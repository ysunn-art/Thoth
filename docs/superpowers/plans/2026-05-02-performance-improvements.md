# Performance Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement three targeted performance improvements — parallel material file I/O in `synthesize()`, a module-level SME list cache, and bulk chunk inserts in `admin_approve()`.

**Architecture:** All three changes are isolated to existing files with no new dependencies. SQLAlchemy's `AsyncSession` cannot be used concurrently, so DB reads remain sequential; only CPU/file-bound work is parallelised via `asyncio.gather` + `asyncio.to_thread`. The SME cache is a module-level variable (matching the existing `session_store` pattern) invalidated explicitly on write/purge. Bulk insert replaces N `db.add()` calls with one `execute(insert(...), rows)`.

**Tech Stack:** Python `asyncio`, SQLAlchemy `insert` (already a dependency), pytest-asyncio.

---

## File Map

| Action | Path | Change |
|--------|------|--------|
| Modify | `app/services/knowledge_service.py` | Add `asyncio`, parallel material loading |
| Modify | `app/repositories/sme_repo.py` | Module-level cache + `invalidate_cache()` |
| Modify | `app/repositories/vector_repo.py` | Bulk insert, add `insert` + `datetime` imports |
| Create | `tests/services/test_knowledge_service.py` | Parallel gather test |
| Create | `tests/repositories/test_sme_repo.py` | Cache hit/miss/invalidation tests |
| Create | `tests/repositories/test_vector_repo.py` | Bulk insert test |

---

### Task 1: Parallel material loading in `synthesize()`

**Files:**
- Modify: `app/services/knowledge_service.py`
- Test: `tests/services/test_knowledge_service.py`

- [ ] **Step 1: Write the failing test**

Create `tests/services/test_knowledge_service.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.services.knowledge_service import KnowledgeService
from app.models.schemas.knowledge import SynthesizeRequest


@pytest.mark.asyncio
async def test_synthesize_includes_all_material_text():
    """Both materials' titles appear in the LLM prompt after parallel loading."""
    repo = AsyncMock()
    interview_repo = AsyncMock()
    material_repo = AsyncMock()
    sme_repo = AsyncMock()
    vector_repo = AsyncMock()

    sme_repo.get_by_id.return_value = MagicMock(id="sme_1")
    interview_repo.get_by_id.return_value = MagicMock(id="int_1", topic="AI")
    interview_repo.get_turns.return_value = []

    mat1 = MagicMock(id="mat_1", title="DocAlpha", file_path="/tmp/a.txt", file_type="text/plain")
    mat2 = MagicMock(id="mat_2", title="DocBeta", file_path="/tmp/b.txt", file_type="text/plain")

    async def _get_mat(mid):
        return {"mat_1": mat1, "mat_2": mat2}[mid]

    material_repo.get_by_id.side_effect = _get_mat

    fake_entry = MagicMock(id="ke_1")
    repo.create.return_value = fake_entry

    service = KnowledgeService(repo, interview_repo, material_repo, sme_repo, vector_repo)
    req = SynthesizeRequest(
        interview_ids=["int_1"],
        material_ids=["mat_1", "mat_2"],
        topic="AI safety",
    )

    with patch("app.services.knowledge_service.read_file", return_value=b"content") as mock_read, \
         patch("app.services.knowledge_service.llm_client") as mock_llm:
        mock_llm.complete = AsyncMock(return_value=("synthesized result", MagicMock()))
        await service.synthesize("sme_1", req)

    prompt = mock_llm.complete.call_args[1]["messages"][0]["content"]
    assert "DocAlpha" in prompt
    assert "DocBeta" in prompt
    assert mock_read.call_count == 2


@pytest.mark.asyncio
async def test_synthesize_material_failure_does_not_crash():
    """If one material file is unreadable, synthesize still completes."""
    repo = AsyncMock()
    interview_repo = AsyncMock()
    material_repo = AsyncMock()
    sme_repo = AsyncMock()
    vector_repo = AsyncMock()

    sme_repo.get_by_id.return_value = MagicMock(id="sme_1")
    interview_repo.get_by_id.return_value = MagicMock(id="int_1", topic="AI")
    interview_repo.get_turns.return_value = []

    mat = MagicMock(id="mat_1", title="BadDoc", file_path="/nonexistent.pdf", file_type="application/pdf")
    material_repo.get_by_id.return_value = mat

    fake_entry = MagicMock(id="ke_1")
    repo.create.return_value = fake_entry

    service = KnowledgeService(repo, interview_repo, material_repo, sme_repo, vector_repo)
    req = SynthesizeRequest(interview_ids=["int_1"], material_ids=["mat_1"], topic="AI")

    with patch("app.services.knowledge_service.read_file", side_effect=FileNotFoundError), \
         patch("app.services.knowledge_service.llm_client") as mock_llm:
        mock_llm.complete = AsyncMock(return_value=("result", MagicMock()))
        entry, _ = await service.synthesize("sme_1", req)

    prompt = mock_llm.complete.call_args[1]["messages"][0]["content"]
    assert "content unavailable" in prompt
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd "/Users/eason/Desktop/University of Washington/2026SP/Hackathon/bonus-thoth-farmers" && \
python -m pytest tests/services/test_knowledge_service.py -v 2>&1 | tail -20
```

Expected: both tests fail — `read_file` is not patched at the right path or `asyncio` not imported.

- [ ] **Step 3: Update `app/services/knowledge_service.py`**

Replace the entire file with:

```python
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
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
python -m pytest tests/services/test_knowledge_service.py -v 2>&1 | tail -20
```

Expected: both tests `PASSED`.

- [ ] **Step 5: Commit**

```bash
git add app/services/knowledge_service.py tests/services/test_knowledge_service.py
git commit -m "perf: parallelize material file I/O in synthesize() with asyncio.gather"
```

---

### Task 2: Module-level SME list cache

**Files:**
- Modify: `app/repositories/sme_repo.py`
- Test: `tests/repositories/test_sme_repo.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/repositories/test_sme_repo.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock
import app.repositories.sme_repo as sme_repo_module
from app.repositories.sme_repo import SMERepository


@pytest.fixture(autouse=True)
def reset_cache():
    sme_repo_module._sme_cache = None
    yield
    sme_repo_module._sme_cache = None


@pytest.mark.asyncio
async def test_list_all_hits_db_once_then_uses_cache():
    db = AsyncMock()
    fake_smes = [MagicMock(id="sme_1"), MagicMock(id="sme_2")]
    result_mock = MagicMock()
    result_mock.scalars.return_value.all.return_value = fake_smes
    db.execute = AsyncMock(return_value=result_mock)

    repo = SMERepository(db)
    first = await repo.list_all()
    second = await repo.list_all()

    assert db.execute.call_count == 1
    assert first is second


@pytest.mark.asyncio
async def test_create_invalidates_cache():
    db = AsyncMock()
    sme_repo_module._sme_cache = [MagicMock()]

    repo = SMERepository(db)
    await repo.create(MagicMock())

    assert sme_repo_module._sme_cache is None


@pytest.mark.asyncio
async def test_delete_all_invalidates_cache():
    db = AsyncMock()
    sme_repo_module._sme_cache = [MagicMock()]

    repo = SMERepository(db)
    await repo.delete_all()

    assert sme_repo_module._sme_cache is None


def test_invalidate_cache_classmethod_clears_cache():
    sme_repo_module._sme_cache = [MagicMock()]
    SMERepository.invalidate_cache()
    assert sme_repo_module._sme_cache is None
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
python -m pytest tests/repositories/test_sme_repo.py -v 2>&1 | tail -20
```

Expected: `AttributeError: module has no attribute '_sme_cache'` and `AttributeError: type object 'SMERepository' has no attribute 'invalidate_cache'`.

- [ ] **Step 3: Update `app/repositories/sme_repo.py`**

Replace the entire file with:

```python
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.models.db.sme import SME

_sme_cache: list | None = None


class SMERepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, sme: SME) -> SME:
        global _sme_cache
        self.db.add(sme)
        await self.db.commit()
        await self.db.refresh(sme)
        _sme_cache = None
        return sme

    async def get_by_id(self, sme_id: str) -> SME | None:
        result = await self.db.execute(select(SME).where(SME.id == sme_id))
        return result.scalar_one_or_none()

    async def list_all(self) -> list[SME]:
        global _sme_cache
        if _sme_cache is not None:
            return _sme_cache
        result = await self.db.execute(select(SME))
        _sme_cache = list(result.scalars().all())
        return _sme_cache

    async def delete_all(self):
        global _sme_cache
        await self.db.execute(delete(SME))
        await self.db.commit()
        _sme_cache = None

    @classmethod
    def invalidate_cache(cls) -> None:
        global _sme_cache
        _sme_cache = None
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
python -m pytest tests/repositories/test_sme_repo.py -v 2>&1 | tail -20
```

Expected: all 4 tests `PASSED`.

- [ ] **Step 5: Wire invalidation into the purge endpoint**

Open `app/routers/system.py`. The `purge` handler already calls `SMERepository(db).delete_all()` which now invalidates the cache. No change needed to `system.py` — the cache is cleared as a side effect of `delete_all()`.

Verify by re-reading the purge handler:
```
SMERepository(db).delete_all()  →  sets _sme_cache = None  ✓
```

- [ ] **Step 6: Commit**

```bash
git add app/repositories/sme_repo.py tests/repositories/test_sme_repo.py
git commit -m "perf: add module-level SME list cache with explicit invalidation"
```

---

### Task 3: Bulk chunk insert in `upsert_chunks()`

**Files:**
- Modify: `app/repositories/vector_repo.py`
- Test: `tests/repositories/test_vector_repo.py`

- [ ] **Step 1: Write the failing test**

Create `tests/repositories/test_vector_repo.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call
from app.repositories.vector_repo import VectorRepository


@pytest.mark.asyncio
async def test_upsert_chunks_uses_bulk_insert_not_individual_adds():
    """upsert_chunks must use a single bulk execute, never db.add per chunk."""
    db = AsyncMock()
    repo = VectorRepository(db)

    chunks = [
        (0, "first chunk text", [0.1] * 384),
        (1, "second chunk text", [0.2] * 384),
        (2, "third chunk text", [0.3] * 384),
    ]

    with patch("app.repositories.vector_repo.pq_index_service"):
        await repo.upsert_chunks("ke_test", chunks)

    db.add.assert_not_called()
    # delete statement + single bulk insert = exactly 2 execute calls
    assert db.execute.call_count == 2


@pytest.mark.asyncio
async def test_upsert_chunks_empty_list_commits_without_insert():
    """Empty chunk list should commit cleanly with no insert call."""
    db = AsyncMock()
    repo = VectorRepository(db)

    with patch("app.repositories.vector_repo.pq_index_service"):
        await repo.upsert_chunks("ke_test", [])

    db.add.assert_not_called()
    # Only the delete execute, no insert
    assert db.execute.call_count == 1
    db.commit.assert_called_once()
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
python -m pytest tests/repositories/test_vector_repo.py -v 2>&1 | tail -20
```

Expected: `AssertionError: Expected 'add' to not have been called. Called N times.` — current code uses `db.add` per chunk.

- [ ] **Step 3: Update `app/repositories/vector_repo.py`**

Replace the entire file with:

```python
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, insert, text
from app.models.db.knowledge_chunk import KnowledgeChunk
from app.models.db.knowledge_entry import KnowledgeEntry
from app.core.ids import new_id
from app.services.pq_index_service import pq_index_service


class VectorRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def upsert_chunks(self, entry_id: str, chunks: list[tuple[int, str, list[float]]]):
        await self.db.execute(delete(KnowledgeChunk).where(KnowledgeChunk.entry_id == entry_id))
        pq_index_service.remove_entry(entry_id)

        if not chunks:
            await self.db.commit()
            pq_index_service.save()
            return

        rows = []
        for chunk_index, chunk_text, embedding in chunks:
            chunk_id = new_id("chunk")
            rows.append({
                "id": chunk_id,
                "entry_id": entry_id,
                "chunk_index": chunk_index,
                "chunk_text": chunk_text,
                "embedding": embedding,
                "created_at": datetime.now(timezone.utc),
            })
            pq_index_service.add(chunk_id, entry_id, embedding)

        await self.db.execute(insert(KnowledgeChunk), rows)
        await self.db.commit()
        pq_index_service.save()

    async def search(
        self, query_embedding: list[float], top_k: int = 5
    ) -> list[tuple[KnowledgeChunk, KnowledgeEntry]]:
        pq_ids = pq_index_service.search(query_embedding, top_k)

        if pq_ids:
            stmt = (
                select(KnowledgeChunk, KnowledgeEntry)
                .join(KnowledgeEntry, KnowledgeChunk.entry_id == KnowledgeEntry.id)
                .where(KnowledgeChunk.id.in_(pq_ids))
                .where(KnowledgeEntry.status == "approved")
            )
            result = await self.db.execute(stmt)
            rows = result.all()
            order = {cid: i for i, cid in enumerate(pq_ids)}
            rows.sort(key=lambda r: order.get(r[0].id, len(pq_ids)))
            return rows[:top_k]

        stmt = (
            select(KnowledgeChunk, KnowledgeEntry)
            .join(KnowledgeEntry, KnowledgeChunk.entry_id == KnowledgeEntry.id)
            .where(KnowledgeEntry.status == "approved")
            .order_by(KnowledgeChunk.embedding.cosine_distance(query_embedding))
            .limit(top_k)
        )
        result = await self.db.execute(stmt)
        return result.all()

    async def delete_by_entry(self, entry_id: str):
        await self.db.execute(delete(KnowledgeChunk).where(KnowledgeChunk.entry_id == entry_id))
        await self.db.commit()
        pq_index_service.remove_entry(entry_id)

    async def delete_all(self):
        await self.db.execute(delete(KnowledgeChunk))
        await self.db.commit()
        pq_index_service.reset()

    async def enable_extension(self):
        await self.db.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await self.db.commit()
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
python -m pytest tests/repositories/test_vector_repo.py -v 2>&1 | tail -20
```

Expected: both tests `PASSED`.

- [ ] **Step 5: Run the full test suite**

```bash
python -m pytest tests/ -v 2>&1 | tail -30
```

Expected: all tests pass with no regressions.

- [ ] **Step 6: Commit**

```bash
git add app/repositories/vector_repo.py tests/repositories/test_vector_repo.py
git commit -m "perf: bulk insert knowledge chunks in upsert_chunks()"
```

---

## Self-Review

**Spec coverage:**
- [x] `asyncio.gather` for material file I/O (Task 1) — DB reads sequential, file I/O parallelised
- [x] Module-level SME cache invalidated on `create()` and `delete_all()` (Task 2)
- [x] `invalidate_cache()` classmethod on `SMERepository` (Task 2)
- [x] Bulk insert in `upsert_chunks()` (Task 3)
- [x] Tests for all three improvements

**Placeholder scan:** None found.

**Type consistency:**
- `upsert_chunks(entry_id: str, chunks: list[tuple[int, str, list[float]]])` — unchanged signature
- `list_all() -> list[SME]` — unchanged return type
- `_load_material(material) -> str` — local async helper, used only within `synthesize()`
