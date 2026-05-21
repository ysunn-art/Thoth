# MinerU PDF Parser Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the duplicated `_parse_file` helper with a shared `app/services/file_parser.py` that uses MinerU (magic-pdf) for richer PDF text extraction — tables, multi-column layouts, and headings preserved as Markdown — and falls back to pypdf if MinerU is unavailable.

**Architecture:** A single shared parser module (`app/services/file_parser.py`) is the sole place that knows about MinerU vs pypdf. It tries MinerU first inside a try/except; if the import or extraction fails it silently falls back to pypdf. Both `material_service.py` and `knowledge_service.py` import from this module, eliminating the current duplication.

**Tech Stack:** `magic-pdf` (MinerU), `pypdf` (fallback), `asyncio.to_thread` to keep MinerU's CPU-bound work off the event loop.

---

## File Map

| Action   | Path                                        | Responsibility                                             |
|----------|---------------------------------------------|------------------------------------------------------------|
| Create   | `app/services/file_parser.py`               | Single source of truth for file-to-text extraction        |
| Modify   | `app/services/material_service.py`          | Remove local `_parse_file`; import from `file_parser`     |
| Modify   | `app/services/knowledge_service.py`         | Remove local `_parse_file`; import from `file_parser`     |
| Modify   | `requirements.txt`                          | Add `magic-pdf`                                           |

---

### Task 1: Add magic-pdf to requirements

**Files:**
- Modify: `requirements.txt`

- [ ] **Step 1: Add the dependency**

Open `requirements.txt`. After the `pypdf` line add:

```
magic-pdf[full]
```

`[full]` installs the layout-detection models. If the deployment environment is CPU-only without enough RAM, this can be changed to just `magic-pdf` (text-mode only, still better than pypdf for structure).

- [ ] **Step 2: Verify the package is installable**

```bash
pip install magic-pdf[full] --dry-run 2>&1 | tail -5
```

Expected: no errors, just a list of packages it would install.

- [ ] **Step 3: Commit**

```bash
git add requirements.txt
git commit -m "deps: add magic-pdf for enhanced PDF text extraction"
```

---

### Task 2: Create the shared file parser module

**Files:**
- Create: `app/services/file_parser.py`

- [ ] **Step 1: Write the failing test**

Create `tests/services/test_file_parser.py`:

```python
import pytest
from app.services.file_parser import parse_file, FileParseError


def test_plain_text_passthrough():
    content = b"Hello world"
    result = parse_file(content, "text/plain")
    assert result == "Hello world"


def test_markdown_passthrough():
    content = b"# Heading\n\nsome text"
    result = parse_file(content, "text/markdown")
    assert result == "# Heading\n\nsome text"


def test_unsupported_type_raises():
    with pytest.raises(FileParseError):
        parse_file(b"data", "application/octet-stream")


def test_pdf_returns_nonempty_string(tmp_path):
    # Minimal single-page PDF (valid PDF structure)
    pdf_bytes = (
        b"%PDF-1.4\n"
        b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
        b"3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R"
        b"/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n"
        b"4 0 obj<</Length 44>>stream\nBT /F1 12 Tf 100 700 Td (Test text) Tj ET\nendstream endobj\n"
        b"5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n"
        b"xref\n0 6\n0000000000 65535 f\n"
        b"trailer<</Size 6/Root 1 0 R>>\n%%EOF"
    )
    result = parse_file(pdf_bytes, "application/pdf")
    # At minimum we get something back (MinerU or pypdf)
    assert isinstance(result, str)
    assert len(result) > 0
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd "/Users/eason/Desktop/University of Washington/2026SP/Hackathon/bonus-thoth-farmers" && \
python -m pytest tests/services/test_file_parser.py -v 2>&1 | tail -20
```

Expected: `ModuleNotFoundError: No module named 'app.services.file_parser'`

- [ ] **Step 3: Create `app/services/file_parser.py`**

```python
import asyncio
import io
import logging

logger = logging.getLogger(__name__)


class FileParseError(Exception):
    pass


_ACCEPTED = {"application/pdf", "text/plain", "text/markdown"}


def _extract_with_mineru(content: bytes) -> str:
    """Use MinerU (magic-pdf) to extract structured Markdown from a PDF.

    MinerU preserves tables, multi-column layouts, and headings far better
    than pypdf. Raises ImportError if the package isn't installed, or any
    exception on parse failure — callers should fall back to pypdf.
    """
    from magic_pdf.pipe.UNIPipe import UNIPipe
    from magic_pdf.rw.AbsReaderWriter import AbsReaderWriter

    class _NullWriter(AbsReaderWriter):
        """Discards image output — we only need the Markdown text."""
        def write(self, path, data, mode="wb"):
            pass
        def read(self, path, mode="rb"):
            return b""
        def read_offset(self, path, offset=None, limit=None):
            return b""

    writer = _NullWriter()
    pipe = UNIPipe(content, {"_pdf_type": "", "model_list": []}, writer)
    pipe.pipe_classify()
    pipe.pipe_analyze()
    pipe.pipe_parse()
    return pipe.pipe_mk_markdown(writer, drop_mode="none")


def _extract_with_pypdf(content: bytes) -> str:
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(content))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def _parse_pdf(content: bytes) -> str:
    try:
        text = _extract_with_mineru(content)
        logger.debug("PDF parsed with MinerU")
        return text
    except ImportError:
        logger.debug("magic-pdf not installed, falling back to pypdf")
    except Exception as exc:
        logger.warning("MinerU extraction failed (%s), falling back to pypdf", exc)
    return _extract_with_pypdf(content)


def parse_file(content: bytes, file_type: str) -> str:
    """Extract plain/Markdown text from file bytes.

    Raises FileParseError for unsupported MIME types.
    """
    if file_type not in _ACCEPTED:
        raise FileParseError(f"Unsupported file type: {file_type}")
    if file_type == "application/pdf":
        return _parse_pdf(content)
    return content.decode("utf-8", errors="replace")


async def parse_file_async(content: bytes, file_type: str) -> str:
    """Async wrapper — runs CPU-bound extraction in a thread pool."""
    return await asyncio.to_thread(parse_file, content, file_type)
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
python -m pytest tests/services/test_file_parser.py -v 2>&1 | tail -20
```

Expected: all 4 tests `PASSED`.

- [ ] **Step 5: Commit**

```bash
git add app/services/file_parser.py tests/services/test_file_parser.py
git commit -m "feat: add shared file_parser with MinerU + pypdf fallback"
```

---

### Task 3: Update `material_service.py` to use the shared parser

**Files:**
- Modify: `app/services/material_service.py`

- [ ] **Step 1: Write a focused integration test**

Add to `tests/services/test_material_service.py` (create if absent):

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.services.material_service import MaterialService


@pytest.mark.asyncio
async def test_upload_material_calls_shared_parser():
    """material_service must delegate PDF parsing to file_parser, not its own copy."""
    repo = AsyncMock()
    sme_repo = AsyncMock()
    sme_repo.get_by_id.return_value = MagicMock(id="sme_test")

    fake_material = MagicMock()
    fake_material.id = "mat_test"
    repo.create.return_value = fake_material
    repo.update.return_value = fake_material

    service = MaterialService(repo, sme_repo)

    upload = MagicMock()
    upload.content_type = "text/plain"
    upload.filename = "note.txt"
    upload.read = AsyncMock(return_value=b"hello world")

    with patch("app.services.material_service.save_file", new_callable=AsyncMock) as mock_save, \
         patch("app.services.material_service.parse_file_async", new_callable=AsyncMock) as mock_parse:
        mock_save.return_value = "/tmp/note.txt"
        mock_parse.return_value = "hello world"
        material, usage = await service.upload_material("sme_test", upload, "Note", None)

    mock_parse.assert_awaited_once_with(b"hello world", "text/plain")
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
python -m pytest tests/services/test_material_service.py::test_upload_material_calls_shared_parser -v 2>&1 | tail -20
```

Expected: `ImportError` or `AssertionError` — `parse_file_async` is not yet imported.

- [ ] **Step 3: Rewrite `app/services/material_service.py`**

Replace the entire file:

```python
import asyncio
from fastapi import HTTPException, UploadFile
from app.repositories.material_repo import MaterialRepository
from app.repositories.sme_repo import SMERepository
from app.models.db.material import Material
from app.core.ids import new_id
from app.core.errors import raise_not_found
from storage.file_store import save_file, read_file
from app.services.file_parser import parse_file_async, FileParseError

ACCEPTED_TYPES = {"application/pdf", "text/plain", "text/markdown"}
MAX_SIZE = 10 * 1024 * 1024  # 10 MB
CHUNK_SIZE = 2000
CHUNK_OVERLAP = 200


def _chunk_text(text: str) -> list[str]:
    chunks = []
    start = 0
    while start < len(text):
        end = start + CHUNK_SIZE
        chunks.append(text[start:end])
        start = end - CHUNK_OVERLAP
    return chunks


class MaterialService:
    def __init__(self, repo: MaterialRepository, sme_repo: SMERepository):
        self.repo = repo
        self.sme_repo = sme_repo

    async def upload_material(
        self,
        sme_id: str,
        file: UploadFile,
        title: str,
        description: str | None,
    ) -> tuple[Material, dict | None]:
        sme = await self.sme_repo.get_by_id(sme_id)
        if not sme:
            raise_not_found("SME", sme_id)

        content_type = file.content_type or ""
        if content_type not in ACCEPTED_TYPES:
            raise HTTPException(
                status_code=400,
                detail={"error": f"Unsupported file type: {content_type}", "code": "UNSUPPORTED_FILE_TYPE"},
            )

        content = await file.read()
        if len(content) > MAX_SIZE:
            raise HTTPException(
                status_code=400,
                detail={"error": "File exceeds 10 MB limit", "code": "FILE_TOO_LARGE"},
            )

        material_id = new_id("mat")
        file_path = await save_file(sme_id, material_id, file.filename or "file", content)

        material = Material(
            id=material_id,
            sme_id=sme_id,
            title=title,
            description=description,
            file_type=content_type,
            file_path=file_path,
            status="processing",
        )
        material = await self.repo.create(material)

        # Validate the file is parseable; actual text used at synthesis time.
        await parse_file_async(content, content_type)

        material.status = "processed"
        material = await self.repo.update(material)
        return material, None

    async def list_materials(self, sme_id: str) -> list[Material]:
        return await self.repo.list_by_sme(sme_id)
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
python -m pytest tests/services/test_material_service.py -v 2>&1 | tail -20
```

Expected: all tests `PASSED`.

- [ ] **Step 5: Commit**

```bash
git add app/services/material_service.py tests/services/test_material_service.py
git commit -m "refactor: material_service uses shared file_parser (MinerU-backed)"
```

---

### Task 4: Update `knowledge_service.py` to use the shared parser

**Files:**
- Modify: `app/services/knowledge_service.py`

- [ ] **Step 1: Write a focused test**

Add to `tests/services/test_knowledge_service.py` (create if absent):

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_synthesize_calls_shared_parser_for_each_material():
    """synthesize must use file_parser for material text extraction."""
    from app.services.knowledge_service import KnowledgeService
    from app.models.schemas.knowledge import SynthesizeRequest

    repo = AsyncMock()
    interview_repo = AsyncMock()
    material_repo = AsyncMock()
    sme_repo = AsyncMock()
    vector_repo = AsyncMock()

    sme_repo.get_by_id.return_value = MagicMock(id="sme_1")
    interview_repo.get_by_id.return_value = MagicMock(id="int_1", topic="AI")
    interview_repo.get_turns.return_value = []

    mat = MagicMock()
    mat.id = "mat_1"
    mat.title = "Doc"
    mat.file_path = "/tmp/doc.pdf"
    mat.file_type = "application/pdf"
    material_repo.get_by_id.return_value = mat

    fake_entry = MagicMock()
    fake_entry.id = "ke_1"
    repo.create.return_value = fake_entry

    service = KnowledgeService(repo, interview_repo, material_repo, sme_repo, vector_repo)
    req = SynthesizeRequest(interview_ids=["int_1"], material_ids=["mat_1"], topic="AI safety")

    with patch("app.services.knowledge_service.read_file", return_value=b"%PDF fake") as mock_read, \
         patch("app.services.knowledge_service.parse_file_async", new_callable=AsyncMock) as mock_parse, \
         patch("app.services.knowledge_service.llm_client") as mock_llm:
        mock_parse.return_value = "Parsed PDF text"
        mock_llm.complete = AsyncMock(return_value=("synthesized content", MagicMock()))
        await service.synthesize("sme_1", req)

    mock_parse.assert_awaited_once_with(b"%PDF fake", "application/pdf")
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
python -m pytest tests/services/test_knowledge_service.py::test_synthesize_calls_shared_parser_for_each_material -v 2>&1 | tail -20
```

Expected: `AssertionError` — `parse_file_async` not imported yet.

- [ ] **Step 3: Update `app/services/knowledge_service.py`**

At the top of the file, replace the `_parse_file` import block and inline definition with the shared import. Remove the local `_parse_file` function entirely. Replace the `read_file` + `_parse_file(raw, ...)` call in `synthesize` with `await parse_file_async(raw, ...)`.

Full updated file:

```python
from datetime import datetime, timezone
from app.repositories.knowledge_repo import KnowledgeRepository
from app.repositories.interview_repo import InterviewRepository
from app.repositories.material_repo import MaterialRepository
from app.repositories.sme_repo import SMERepository
from app.repositories.vector_repo import VectorRepository
from app.models.db.knowledge_entry import KnowledgeEntry
from app.models.schemas.knowledge import SynthesizeRequest, KnowledgeUpdate, RejectRequest
from app.services.llm_client import llm_client, UsageInfo
from app.services.file_parser import parse_file_async
from app.core.ids import new_id
from app.core.errors import raise_not_found, guard_transition, guard_not_rejected
from storage.file_store import read_file

CHUNK_SIZE = 2000
CHUNK_OVERLAP = 200


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

        transcripts = []
        for int_id in data.interview_ids:
            interview = await self.interview_repo.get_by_id(int_id)
            if not interview:
                raise_not_found("Interview", int_id)
            turns = await self.interview_repo.get_turns(int_id)
            transcript = f"Interview on {interview.topic}:\n"
            for t in turns:
                transcript += f"  SME: {t.sme_response}\n"
                if t.agent_follow_up:
                    transcript += f"  Agent: {t.agent_follow_up}\n"
            transcripts.append(transcript)

        materials_text = []
        for mat_id in data.material_ids:
            material = await self.material_repo.get_by_id(mat_id)
            if not material:
                raise_not_found("Material", mat_id)
            try:
                raw = read_file(material.file_path)
                text = await parse_file_async(raw, material.file_type)
                materials_text.append(f"[{material.title}]\n{text}")
            except Exception:
                materials_text.append(f"[{material.title}] (content unavailable)")

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
```

- [ ] **Step 4: Run all service tests**

```bash
python -m pytest tests/services/ -v 2>&1 | tail -30
```

Expected: all tests `PASSED`.

- [ ] **Step 5: Commit**

```bash
git add app/services/knowledge_service.py tests/services/test_knowledge_service.py
git commit -m "refactor: knowledge_service uses shared file_parser (MinerU-backed)"
```

---

### Task 5: Smoke test the full upload → synthesize path

**Files:** no file changes — verify only

- [ ] **Step 1: Start the server**

```bash
uvicorn app.main:app --reload --port 8000 &
```

- [ ] **Step 2: Upload a PDF and synthesize**

```bash
# Create a test SME
curl -s -X POST http://localhost:8000/api/v1/smes \
  -H "Authorization: Bearer $BENCHMARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","specialization":"ML","sub_areas":["NLP"],"contact_email":"a@example.com"}' | jq .

# Upload a small PDF (substitute any local PDF)
curl -s -X POST http://localhost:8000/api/v1/smes/<SME_ID>/materials \
  -H "Authorization: Bearer $BENCHMARK_API_KEY" \
  -F "file=@/path/to/test.pdf;type=application/pdf" \
  -F "title=Test Doc" | jq .
```

Expected: `"status": "processed"` with no 500 errors in server logs.

- [ ] **Step 3: Check server logs for MinerU vs pypdf**

```
grep -i "mineru\|pypdf\|magic.pdf\|fallback" /tmp/server.log
```

With MinerU installed: `PDF parsed with MinerU`
Without MinerU installed: `magic-pdf not installed, falling back to pypdf`

- [ ] **Step 4: Stop the server**

```bash
kill %1
```

---

## Self-Review

**Spec coverage:**
- [x] Material upload still validates file type and size
- [x] `status: "processed"` returned after upload
- [x] Synthesis still reads from disk, calls LLM, returns `usage`
- [x] No changes to DB schema, endpoints, or auth
- [x] Fallback to pypdf preserves existing behavior if MinerU not installed

**Placeholder scan:** No TBDs, all code blocks are complete.

**Type consistency:**
- `parse_file(content: bytes, file_type: str) -> str` — same signature used in both service files
- `parse_file_async` — async wrapper, same args, awaited correctly in both services
- `FileParseError` — raised in `parse_file`, tested in `test_file_parser.py`
