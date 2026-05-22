# Project Thoth — Progress

## Status: End-to-end pipeline verified ✅

Full benchmark flow tested locally with Postman:
`Create SME → Upload Material → Synthesize → PUT content → Approve → Admin-approve → Query`

RAG working: `grounded: true`, answers sourced from uploaded PDF content.

---

## Completed capabilities

### Capability 1 — SME Onboarding
- `POST /smes`, `GET /smes`, `GET /smes/{sme_id}` implemented
- DB model, schema, repository, service complete

### Capability 2 — Expert Interview
- `POST /smes/{sme_id}/interviews` — creates interview
- `POST /interviews/{interview_id}/turns` — sends SME response to Claude Haiku, gets follow-up question
- `GET /interviews/{interview_id}` — full transcript
- Auto-detects `[INTERVIEW_COMPLETE]`, marks interview done, sets `agent_follow_up: null`

### Capability 3 — Material Ingestion
- `POST /smes/{sme_id}/materials` — accepts PDF / text / markdown (max 10 MB)
- Parses file on upload (pypdf for PDFs, UTF-8 decode for text) to validate readability
- File stored on disk; text extracted during synthesis
- `GET /smes/{sme_id}/materials` — list materials

### Capability 4 — Knowledge Synthesis
- `POST /smes/{sme_id}/knowledge/synthesize` — reads interview transcripts + material files, correctly parses PDFs via pypdf, calls Claude Sonnet, stores as `draft`
- Supports `PUT /knowledge/{entry_id}` to manually override content (bypass LLM)

### Capability 5 — Review & Approval
- `PUT /knowledge/{entry_id}` — SME edits content
- `POST /knowledge/{entry_id}/approve` — draft → sme_approved
- `POST /knowledge/{entry_id}/admin-approve` — sme_approved → approved + triggers local embedding
- `POST /knowledge/{entry_id}/reject` — any state → rejected with optional reason
- 409 enforced on all invalid state transitions

### Capabilities 6 / 7 / 8 — Q&A, Clarification, Routing
- `POST /query` — embeds question locally, cosine search in pgvector (approved entries only, top 5), calls Claude Sonnet, returns structured JSON
- `grounded: true` when answer comes from knowledge base
- `response_type: "clarification"` when question is too vague
- `response_type: "routing"` when no knowledge exists, surfaces relevant SMEs
- Multi-turn session context via in-memory SessionStore
- Disclaimer in every response

### System endpoints
- `POST /system/purge` — deletes all DB rows, vectors, uploaded files, clears sessions
- `POST /system/reset` — clears sessions only, all DB data preserved
- `GET /health` — returns `{status, timestamp}`

### Infrastructure
- **Database**: PostgreSQL via Docker (`ankane/pgvector` image), HNSW vector index
- **Migrations**: Alembic `001_initial_schema.py` — 6 tables, `vector(384)` column, HNSW index
- **LLM**: OpenRouter via `openai` SDK — Haiku 4.5 (interviews) + Sonnet 4.5 (synthesis, Q&A)
- **Embeddings**: Local `sentence-transformers` `all-MiniLM-L6-v2` (384-dim, free, no API key)
- **PQ index**: In-memory Product Quantization sidecar (`pq/` module) — auto-trains at 16+ chunks, falls back to pgvector exact search
- **Postman collection**: `thoth-postman-collection.json` with all endpoints pre-configured

---

## Bug fixes

### 2026-04-30 — PDF parsing in synthesis (knowledge_service.py)
- **Bug**: `synthesize` was calling `content.decode('utf-8')` on raw PDF bytes → garbled binary sent to LLM → LLM hallucinated content unrelated to the actual document
- **Fix**: Added `_parse_file(content, file_type)` using pypdf to correctly extract text from PDFs before sending to LLM

### 2026-04-30 — Material upload 500 error (material_service.py)
- **Bug**: Material upload was calling `vector_repo.upsert_chunks(material_id, ...)` — `knowledge_chunks.entry_id` is a FK to `knowledge_entries`, so passing a `mat_...` ID caused a FK violation → 500
- **Fix**: Removed the vector upsert from material upload. Materials are stored on disk and text is extracted during synthesis. Embedding only happens at `admin-approve` on knowledge entries.

---

## Architecture changes (2026-04-29)
Migrated from Anthropic SDK + OpenAI embeddings to team's actual architecture:
- `llm_client.py` — switched to `openai` SDK → OpenRouter, two-model routing (Haiku/Sonnet), replaced OpenAI embeddings with local sentence-transformers
- `config.py` — removed `ANTHROPIC_API_KEY` + `OPENAI_API_KEY`, added `OPENROUTER_API_KEY`, embedding dim 1536 → 384
- `requirements.txt` — removed `anthropic`, added `sentence-transformers`
- `knowledge_chunk.py` — vector column 1536 → 384
- `pq_index_service.py` — `EMBEDDING_DIM` 1536 → 384
- DB migration — `vector(384)` + HNSW index

### PQ vector index integration (2026-04-28)
- Added `pq/` module (kmeans, codebook, encoder, index) — numpy-only Product Quantization
- Added `app/services/pq_index_service.py` — singleton sidecar, trains at 16+ chunks
- Updated `vector_repo.py` — dual-track: PQ approximate search → pgvector fallback

---

## What's left

- **Deploy to public URL** — Railway / Render / Fly.io (benchmark evaluator needs a public endpoint)
- **ARCHITECTURE.md** — ER diagram, tech stack justification, agentic design
- **Demo script** — step-by-step walkthrough of all 8 capabilities
- **Production recommendations** — 1-2 page doc for T-Mobile
- ~~**Closed-book test**~~ — ✅ implemented: empty DB returns `response_type: routing` with 0 tokens, no LLM call
- **Persistence test** — load knowledge, restart server, knowledge must still be queryable
