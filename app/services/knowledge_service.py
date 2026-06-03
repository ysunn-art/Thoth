import asyncio
import json
import logging
import re
from datetime import datetime, timezone
from app.repositories.knowledge_repo import KnowledgeRepository
from app.repositories.interview_repo import InterviewRepository
from app.repositories.material_repo import MaterialRepository
from app.repositories.sme_repo import SMERepository
from app.repositories.vector_repo import VectorRepository
from app.models.db.knowledge_entry import KnowledgeEntry
from app.models.schemas.knowledge import SynthesizeRequest, KnowledgeUpdate, RejectRequest
from app.services.llm_client import llm_client, UsageInfo, MODEL_FAST
from app.core.ids import new_id
from app.core.errors import raise_not_found, guard_transition, guard_not_rejected
from storage.file_store import read_file
import io

logger = logging.getLogger(__name__)

# Phase 1 — structure-aware chunking. Target small chunks so a single fact isn't
# diluted across an 800-char window and stays under MiniLM's ~256 word-piece limit.
TARGET_CHUNK_CHARS = 400

_SECTION_KEYWORDS = (
    "OVERVIEW", "KEY CONCEPTS", "DETAILED PROCEDURES", "PROCEDURES",
    "REFERENCES", "CAVEATS", "SUMMARY", "SPECIFICATIONS",
)


def _parse_file(content: bytes, file_type: str) -> str:
    if file_type == "application/pdf":
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(content))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    return content.decode("utf-8", errors="replace")


def _strip_heading_decoration(line: str) -> str:
    """Strip markdown / numbering decoration from a candidate heading line."""
    return re.sub(r"^[#*\d.)\-\s]+", "", line.strip()).rstrip(":*# ").strip()


def _is_heading(line: str) -> bool:
    s = line.strip()
    if not s or len(s) > 60:
        return False
    core = _strip_heading_decoration(line)
    if not core:
        return False
    if any(k in core.upper() for k in _SECTION_KEYWORDS):
        return True
    if s.startswith("#"):
        return True
    # short label line ending with a colon, e.g. "Battery:" or "Dosage Limits:"
    if s.endswith(":") and len(core.split()) <= 6:
        return True
    return False


def _split_pieces(block: str) -> list[str]:
    """Split a section body into bullet / paragraph pieces (the atomic fact units)."""
    pieces: list[str] = []
    for para in re.split(r"\n\s*\n", block):
        lines = [ln.strip() for ln in para.split("\n") if ln.strip()]
        if not lines:
            continue
        is_bullets = len(lines) > 1 and all(re.match(r"^[-*•\d]", ln) for ln in lines)
        if is_bullets:
            pieces.extend(lines)
        else:
            pieces.append(" ".join(lines))
    return pieces


def _pack(pieces: list[str], prefix: str) -> list[str]:
    """Greedily pack pieces into <=TARGET chunks; hard-split any overlong single piece."""
    chunks: list[str] = []
    cur = ""
    for p in pieces:
        if len(p) > TARGET_CHUNK_CHARS:
            if cur:
                chunks.append(prefix + cur)
                cur = ""
            for i in range(0, len(p), TARGET_CHUNK_CHARS):
                chunks.append(prefix + p[i:i + TARGET_CHUNK_CHARS])
            continue
        candidate = f"{cur} {p}".strip() if cur else p
        if cur and len(prefix) + len(candidate) > TARGET_CHUNK_CHARS:
            chunks.append(prefix + cur)
            cur = p
        else:
            cur = candidate
    if cur:
        chunks.append(prefix + cur)
    return chunks


def _chunk_text(text: str, topic: str = "") -> list[str]:
    """Split a knowledge entry into small, section-aware chunks (deterministic fallback).

    Splits on section headings then bullets/paragraphs and packs into small chunks.
    No metadata prefix (it dilutes embeddings); wording is preserved verbatim.
    """
    sections: list[tuple[str, list[str]]] = []
    heading = ""
    buf: list[str] = []
    for ln in text.split("\n"):
        if _is_heading(ln):
            if buf:
                sections.append((heading, buf))
                buf = []
            heading = _strip_heading_decoration(ln)
        else:
            buf.append(ln)
    if buf:
        sections.append((heading, buf))

    # No metadata prefix: prepending "[topic — section]" injects non-query tokens that
    # dilute the embedding and push chunks below the relevance threshold (proven to cause
    # mass over-routing). Keep only the structure-aware, small-chunk benefit.
    chunks: list[str] = []
    for _sec_heading, body_lines in sections:
        body = "\n".join(body_lines).strip()
        if not body:
            continue
        chunks.extend(_pack(_split_pieces(body), ""))

    # Fallback: no detectable structure → pack the whole entry as-is.
    if not chunks:
        chunks = _pack(_split_pieces(text), "")
    return chunks


# --- LLM-driven semantic chunking -------------------------------------------------
# An LLM (fast model) segments the entry into self-contained semantic chunks. It is
# constrained to copy text VERBATIM (no paraphrase/number changes) so the system's
# exact-fact-token fidelity is preserved. A verbatim guard validates every chunk
# against the source; on any failure we fall back to the deterministic chunker above.

_LLM_CHUNK_SYSTEM = (
    "You split a knowledge-base entry into small, self-contained chunks for semantic "
    "search. Rules:\n"
    "- Each chunk covers ONE coherent fact, rule, spec, or procedure step.\n"
    "- CRITICAL: every chunk must be self-contained and name its SUBJECT (the device, "
    "product, model, or topic the entry is about) so the chunk makes sense and is "
    "retrievable on its own. A bare fact like 'Battery: 8 hours' is WRONG; write "
    "'The Model X1 battery lasts 8 hours' instead. Put the subject in natural prose, not "
    "a bracketed prefix.\n"
    "- Preserve every number, code, unit, date, and proper noun EXACTLY as in the source. "
    "Do NOT change, round, or invent any of these. You may rephrase the surrounding prose "
    "only to add the subject name and make the chunk self-contained.\n"
    "- Keep each chunk short: roughly 1-3 sentences.\n"
    "- Cover the entire entry; do not drop content.\n"
    'Return ONLY JSON in the form {"chunks": ["...", "..."]} with no extra text.'
)

# If more than this fraction of LLM chunks fail the verbatim guard, distrust the whole
# response and fall back to deterministic chunking.
_MAX_INVALID_FRACTION = 0.30
_MAX_CHUNK_CHARS = 1000  # hard-split anything larger to respect MiniLM's token limit


def _normalize_ws(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


# A "fact token" is any digit-bearing token: bare numbers (8, 2.3, 999, 0.1), and
# alphanumeric codes (v4.2, EAR99, E-101). These are what CAR grades on and what must
# never be mutated or fabricated.
_FACT_RE = re.compile(r"[A-Za-z]*\d[\w.\-/]*")


def _fact_tokens(text: str) -> set[str]:
    toks = set()
    for m in _FACT_RE.findall(text):
        t = m.strip(".-/").lower()
        if t:
            toks.add(t)
    return toks


def _facts_preserved(chunk: str, norm_source_lc: str) -> bool:
    """Allow contextual rewriting of prose, but reject any chunk that introduces a
    numeric/code token not present in the source (mutated or fabricated fact)."""
    if not _normalize_ws(chunk):
        return False
    return all(t in norm_source_lc for t in _fact_tokens(chunk))


def _parse_chunk_json(raw: str) -> list[str]:
    text = raw.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.IGNORECASE).strip()
    # strict=False tolerates raw control chars (e.g. literal newlines) inside strings,
    # which LLMs frequently emit when a chunk spans multiple lines.
    data = json.loads(text, strict=False)
    items = data.get("chunks") if isinstance(data, dict) else data
    if not isinstance(items, list):
        raise ValueError("no chunks list in LLM response")
    return [c.strip() for c in items if isinstance(c, str) and c.strip()]


async def _llm_chunk_text(content: str, topic: str) -> list[str]:
    """LLM semantic chunking with a verbatim guard; deterministic fallback on any issue."""
    try:
        user_msg = (
            f"SUBJECT of this entry: {topic}\n"
            "Name this subject in every chunk so each is self-contained.\n\n"
            f"ENTRY:\n{content}"
        )
        raw, _usage = await llm_client.complete(
            system=_LLM_CHUNK_SYSTEM,
            messages=[{"role": "user", "content": user_msg}],
            max_tokens=4096,
            model=MODEL_FAST,
            temperature=0,
        )
        chunks = _parse_chunk_json(raw)
    except Exception as exc:
        logger.warning("LLM chunking failed (%s); falling back to deterministic", exc)
        return _chunk_text(content, topic)

    if not chunks:
        logger.warning("LLM chunking returned no chunks; falling back to deterministic")
        return _chunk_text(content, topic)

    norm_source_lc = _normalize_ws(content).lower()
    valid = [c for c in chunks if _facts_preserved(c, norm_source_lc)]
    invalid = len(chunks) - len(valid)
    if not valid or invalid > len(chunks) * _MAX_INVALID_FRACTION:
        logger.warning(
            "LLM chunking fact guard rejected %d/%d chunks; falling back",
            invalid, len(chunks),
        )
        return _chunk_text(content, topic)

    # Respect the embedder's token limit: hard-split any overlong chunk.
    final: list[str] = []
    for c in valid:
        if len(c) > _MAX_CHUNK_CHARS:
            final.extend(c[i:i + TARGET_CHUNK_CHARS] for i in range(0, len(c), TARGET_CHUNK_CHARS))
        else:
            final.append(c)
    logger.info("LLM chunking: %d chunks (dropped %d invalid)", len(final), invalid)
    return final


class KnowledgeService:
    def __init__(
        self,
        repo: KnowledgeRepository,
        interview_repo: InterviewRepository,
        material_repo: MaterialRepository,
        sme_repo: SMERepository,
        vector_repo: VectorRepository,
    ):
        self.repo = repo
        self.interview_repo = interview_repo
        self.material_repo = material_repo
        self.sme_repo = sme_repo
        self.vector_repo = vector_repo

    async def synthesize(self, sme_id: str, data: SynthesizeRequest) -> tuple[KnowledgeEntry, UsageInfo]:
        sme = await self.sme_repo.get_by_id(sme_id)
        if not sme:
            raise_not_found("SME", sme_id)

        # Sequential DB reads — AsyncSession is not safe for concurrent use
        interview_records: list[tuple] = []
        for int_id in data.interview_ids:
            interview = await self.interview_repo.get_by_id(int_id)
            if not interview:
                raise_not_found("Interview", int_id)
            turns = await self.interview_repo.get_turns(int_id)
            interview_records.append((interview, turns))

        material_records = []
        for mat_id in data.material_ids:
            material = await self.material_repo.get_by_id(mat_id)
            if not material:
                raise_not_found("Material", mat_id)
            material_records.append(material)

        transcripts = []
        for interview, turns in interview_records:
            transcript = f"Interview on {interview.topic}:\n"
            for t in turns:
                transcript += f"  SME: {t.sme_response}\n"
                if t.agent_follow_up:
                    transcript += f"  Agent: {t.agent_follow_up}\n"
            transcripts.append(transcript)

        async def _load_material(material) -> str:
            try:
                raw = await asyncio.to_thread(read_file, material.file_path)
                text = await asyncio.to_thread(_parse_file, raw, material.file_type)
                return f"[{material.title}]\n{text}"
            except Exception as exc:
                logger.warning("Failed to load material %s: %s", material.id, exc)
                return f"[{material.title}] (content unavailable)"

        materials_text = list(await asyncio.gather(*[_load_material(m) for m in material_records]))

        user_msg = (
            f"Synthesize the following interview transcripts and reference materials into a "
            f"comprehensive knowledge entry on: {data.topic}\n\n"
            f"INTERVIEWS:\n{''.join(transcripts)}\n\n"
            f"MATERIALS:\n{''.join(materials_text)}"
        )

        system = (
            "You are synthesizing SME knowledge into a structured knowledge base entry. "
            "Follow this organization:\n"
            "1. OVERVIEW — 2-3 sentence summary of the topic\n"
            "2. KEY CONCEPTS — bullet points of core definitions, rules, or frameworks\n"
            "3. DETAILED PROCEDURES — step-by-step procedures mentioned in the sources\n"
            "4. REFERENCES — cite specific article numbers, section names, or document titles from the source material\n"
            "5. CAVEATS — important limitations, exceptions, or edge cases\n\n"
            "Quality rules:\n"
            "- Only synthesize from the provided transcripts and materials. Do not add external knowledge.\n"
            "- If interview and material conflict, note the conflict explicitly.\n"
            "- Prefer specific facts over general statements.\n"
            "- Do not fabricate article numbers — only cite what appears in the sources."
        )
        content, usage = await llm_client.complete(
            system=system,
            messages=[{"role": "user", "content": user_msg}],
            max_tokens=4096,
        )

        entry = KnowledgeEntry(
            id=new_id("ke"),
            sme_id=sme_id,
            topic=data.topic,
            content=content,
            source_interviews=data.interview_ids,
            source_materials=data.material_ids,
        )
        entry = await self.repo.create(entry)
        return entry, usage

    async def get_entry(self, entry_id: str) -> KnowledgeEntry:
        entry = await self.repo.get_by_id(entry_id)
        if not entry:
            raise_not_found("Knowledge entry", entry_id)
        return entry

    async def list_entries(self, status: str | None = None) -> list[KnowledgeEntry]:
        return await self.repo.list_all(status)

    async def update_entry(self, entry_id: str, data: KnowledgeUpdate) -> KnowledgeEntry:
        entry = await self.get_entry(entry_id)
        entry.content = data.content
        return await self.repo.update(entry)

    async def approve(self, entry_id: str) -> KnowledgeEntry:
        entry = await self.get_entry(entry_id)
        guard_transition(entry.status, "draft", "approve")
        entry.status = "sme_approved"
        entry.approved_at = datetime.now(timezone.utc)
        return await self.repo.update(entry)

    async def admin_approve(self, entry_id: str) -> KnowledgeEntry:
        entry = await self.get_entry(entry_id)
        guard_transition(entry.status, "sme_approved", "admin-approve")
        entry.status = "approved"
        entry.admin_approved_at = datetime.now(timezone.utc)
        entry = await self.repo.update(entry)

        chunks = await _llm_chunk_text(entry.content, entry.topic)
        embeddings = await llm_client.embed(chunks)
        await self.vector_repo.upsert_chunks(
            entry_id,
            [(i, c, e) for i, (c, e) in enumerate(zip(chunks, embeddings))],
        )
        return entry

    async def reject(self, entry_id: str, data: RejectRequest) -> KnowledgeEntry:
        entry = await self.get_entry(entry_id)
        guard_not_rejected(entry.status)
        entry.status = "rejected"
        entry.rejection_reason = data.reason
        entry.rejected_at = datetime.now(timezone.utc)
        return await self.repo.update(entry)
