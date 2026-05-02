# Performance Improvements Design

## Goal

Three targeted performance improvements with no new dependencies and no schema changes:
1. Concurrent DB reads in `synthesize()`
2. Module-level SME list cache
3. Bulk chunk insert in `admin_approve()`

---

## 1. `asyncio.gather` in `synthesize()` — `knowledge_service.py`

Replace the two sequential `for` loops with `asyncio.gather` calls.

**Interview fetching:** Create one coroutine per interview that fetches the interview record and its turns concurrently. `asyncio.gather(*coroutines)` runs them all in parallel. Results are returned in input order.

**Material fetching:** Create one coroutine per material that reads the file from disk and parses it via `parse_file_async` (already runs in a thread pool). `asyncio.gather(*coroutines)` runs them all in parallel.

The transcript and materials_text assembly logic after each gather is identical to today — just iterating over results instead of building inline.

**Testing:** A test verifies that when synthesizing with 2 interviews and 2 materials, the repo methods are called the expected number of times and the final prompt contains text from all sources.

---

## 2. Module-level SME cache — `app/repositories/sme_repo.py`

```
_sme_cache: list | None = None  # module-level
```

- `list_all()` returns `_sme_cache` if not `None`, else queries DB, stores result, returns it.
- `create()` sets `_sme_cache = None` after a successful insert.
- `SMERepository.invalidate_cache()` classmethod sets `_sme_cache = None`. Called by `POST /system/purge` in the system router.

No TTL needed — benchmark data is stable within a run. Cache is never stale unless an SME is created or data is purged, both of which explicitly invalidate it.

**Testing:** A test verifies `list_all()` hits the DB once across two calls, and that calling `invalidate_cache()` causes the next `list_all()` to hit the DB again.

---

## 3. Bulk chunk insert — `vector_repo.py`

Replace the `for chunk_index, chunk_text, embedding in chunks: self.db.add(chunk)` loop with:

```python
await self.db.execute(
    insert(KnowledgeChunk),
    [{"id": new_id("chunk"), "entry_id": entry_id, "chunk_index": i, "chunk_text": t, "embedding": e}
     for i, t, e in chunks_data]
)
```

One DB round-trip regardless of chunk count. The PQ index `add` calls remain in a loop (in-memory, negligible cost).

**Testing:** A test verifies that `upsert_chunks` with N chunks results in exactly 1 bulk insert call rather than N individual adds.

---

## Files Changed

| File | Change |
|---|---|
| `app/repositories/sme_repo.py` | Add module-level cache + `invalidate_cache()` classmethod |
| `app/routers/system.py` | Call `SMERepository.invalidate_cache()` in purge handler |
| `app/services/knowledge_service.py` | Replace sequential loops with `asyncio.gather` |
| `app/repositories/vector_repo.py` | Replace per-chunk `db.add` loop with bulk insert |
| `tests/repositories/test_sme_repo.py` | Cache hit/miss tests |
| `tests/services/test_knowledge_service.py` | Gather concurrency test |
| `tests/repositories/test_vector_repo.py` | Bulk insert test |
