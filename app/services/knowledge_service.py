import asyncio
from datetime import datetime, timezone
from app.repositories.knowledge_repo import KnowledgeRepository
from app.repositories.interview_repo import InterviewRepository
from app.repositories.material_repo import MaterialRepository
from app.repositories.sme_repo import SMERepository
from app.repositories.vector_repo import VectorRepository
from app.models.db.knowledge_entry import KnowledgeEntry
from app.models.schemas.knowledge import SynthesizeRequest, KnowledgeUpdate, RejectRequest
from app.services.llm_client import llm_client, UsageInfo
from app.core.ids import new_id
from app.core.errors import raise_not_found, guard_transition, guard_not_rejected
from storage.file_store import read_file
import io

CHUNK_SIZE = 2000
CHUNK_OVERLAP = 200


def _parse_file(content: bytes, file_type: str) -> str:
    if file_type == "application/pdf":
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(content))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    return content.decode("utf-8", errors="replace")


def _chunk_text(text: str) -> list[str]:
    chunks = []
    start = 0
    while start < len(text):
        end = start + CHUNK_SIZE
        chunks.append(text[start:end])
        start = end - CHUNK_OVERLAP
    return chunks


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
            except Exception:
                return f"[{material.title}] (content unavailable)"

        materials_text = list(await asyncio.gather(*[_load_material(m) for m in material_records]))

        user_msg = (
            f"Synthesize the following interview transcripts and reference materials into a "
            f"comprehensive knowledge entry on: {data.topic}\n\n"
            f"INTERVIEWS:\n{''.join(transcripts)}\n\n"
            f"MATERIALS:\n{''.join(materials_text)}"
        )

        system = "You are synthesizing expert knowledge into a clear, structured knowledge base entry."
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

        chunks = _chunk_text(entry.content)
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
