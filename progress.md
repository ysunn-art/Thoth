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
- `POST /query` — embeds question locally, cosine search in pgvector (approved entries only, top 8), calls Claude Sonnet, returns structured JSON
- **Answer-first routing**: System prompt enforces Answer → Clarify → Route hierarchy. When relevant knowledge chunks exist, answer is the default.
- **Deterministic guardrail**: `max_sim >= 0.45` AND `>= 2` chunks forces a grounded answer, overriding any LLM routing/clarification decision.
- **Common-sense answering**: Classifier `"answer"` decision handles trivia, definitions, and general knowledge (`grounded=false`) without routing to admin/SMEs.
- **Risk-aware routing**: 11-category risk filter (billing, account, privacy, legal, security, medical, financial, authorization, destructive, organizational, self-harm) deterministically escalates to admin when RAG is absent. High-risk with RAG receives grounded answers from SME-approved content.
- `response_type: "routing"` surfaces relevant SMEs or escalates to admin
- Multi-turn session context via in-memory SessionStore
- Disclaimer in every response

### System endpoints
- `POST /system/purge` — deletes all DB rows, vectors, uploaded files, clears sessions
- `POST /system/reset` — clears sessions only, all DB data preserved
- `GET /health` — returns `{status, timestamp}`

### Infrastructure
- **Database**: PostgreSQL via Docker (`ankane/pgvector` image), HNSW vector index
- **Migrations**: Alembic `001_initial_schema.py` — 6 tables, `vector(384)` column, HNSW index
- **LLM**: OpenRouter via `openai` SDK — Sonnet 4.5 (classification, synthesis, Q&A), temperature=0 for deterministic routing
- **Embeddings**: Local `sentence-transformers` `all-MiniLM-L6-v2` (384-dim, free, no API key)
- **Risk filter**: Deterministic regex-based pre-filter (`app/core/risk_filter.py`) — 11 action-oriented categories, 0-token admin escalation for critical/high-risk questions
- **PQ index**: In-memory Product Quantization sidecar (`pq/` module) — auto-trains at 16+ chunks, falls back to pgvector exact search
- **Postman collection**: `thoth-postman-collection.json` with all endpoints pre-configured
- **Tests**: 36 unit tests (28 query-service, 8 across SME, vector, knowledge modules)

---

## Bug fixes

### 2026-04-30 — PDF parsing in synthesis (knowledge_service.py)
- **Bug**: `synthesize` was calling `content.decode('utf-8')` on raw PDF bytes → garbled binary sent to LLM → LLM hallucinated content unrelated to the actual document
- **Fix**: Added `_parse_file(content, file_type)` using pypdf to correctly extract text from PDFs before sending to LLM

### 2026-04-30 — Material upload 500 error (material_service.py)
- **Bug**: Material upload was calling `vector_repo.upsert_chunks(material_id, ...)` — `knowledge_chunks.entry_id` is a FK to `knowledge_entries`, so passing a `mat_...` ID caused a FK violation → 500
- **Fix**: Removed the vector upsert from material upload. Materials are stored on disk and text is extracted during synthesis. Embedding only happens at `admin-approve` on knowledge entries.

### 2026-05-26 — Inconsistent routing decisions (query_service.py)

**Bug 1 — Same question got different routing/answering decisions on repeat calls:**
- **Root cause**: `_classify_and_route` was using `MODEL_FAST` (Haiku) which is non-deterministic for nuanced domain classification. Same question + same context could produce "route" on call 1 and "clarify" on call 2.
- **Fix**: Switched to `MODEL_SMART` (Sonnet) at `temperature=0`. Rewrote classifier prompt with strict priority-ordered rules. Added deterministic relevance guardrail: when `max_sim >= 0.45` AND `>= 2` relevant chunks, a second "you MUST answer" LLM call overrides any routing/clarification decision.

**Bug 2 — Answerable questions incorrectly routed to admin/SMEs:**
- **Root cause**: Main Q&A system prompt allowed the LLM to route when uncertain. Guardrail thresholds were too conservative.
- **Fix**: Rewrote system prompt with "ANSWERING IS THE DEFAULT" directive and strict decision hierarchy: Answer → Clarify → Route. Added relevance-based override: strong retrieval signals force an answer regardless of LLM judgment.

**Bug 3 — Common-sense questions routed to admin instead of answered directly:**
- **Root cause**: `_classify_and_route` only had two decisions (clarify / route). When RAG had no chunks, every question — even "What is the capital of France?" — got routed to admin or SMEs.
- **Fix**: Added `"answer"` as a third classifier decision. Common-sense / general-knowledge / trivia questions now get a direct answer (`grounded=false`). Updated both "no SMEs" and "has SMEs" code paths.

**Bug 4 — High-risk questions answered without administrator oversight:**
- **Root cause**: No risk classification existed anywhere in the pipeline. Billing, account access, privacy, legal, security, medical, financial, authorization, destructive, and organizational questions could be answered by the LLM or routed to SMEs without admin review.
- **Fix**: Created `app/core/risk_filter.py` — deterministic pre-filter with 11 risk categories using action-oriented regex patterns. Tier 1 (self-harm) blocks before embedding. Tier 2 (10 high-risk categories) blocks before LLM classification when RAG has no chunks. High-risk WITH RAG chunks still receive grounded answers from SME-approved content (Option B).

---

## Architecture changes (2026-05-26)

### Query routing overhaul
- **Deterministic relevance guardrail** (`query_service.py`): When retrieval quality is objectively high, bypasses LLM routing/clarification decisions and forces a grounded answer. Token counts properly accumulated across both calls.
- **Answer-first system prompt**: `query()` main Q&A prompt rewritten with "ANSWERING IS THE DEFAULT" and strict hierarchy: Answer → Clarify → Route. Includes explicit rules for terminology mismatches and multi-SME synthesis.
- **Model switch**: `_classify_and_route` now uses `MODEL_SMART` (Sonnet) instead of `MODEL_FAST` (Haiku) for reproducible classification.
- **Common-sense answering**: Classifier now supports `"answer"` decision alongside `"clarify"` and `"route"`. Fallback LLM call generates answer text if classifier provides none.
- **Risk-aware routing** (`app/core/risk_filter.py` + `query_service.py`): Two-tier deterministic pre-filter catches 11 risk categories before LLM classification. Self-harm → Tier 1 (before embedding). 10 high-risk categories → Tier 2 (after embedding, before classification).
- **Temperature passthrough** (`llm_client.py`): `complete()` now accepts optional `temperature` parameter, defaulting to `None` (model default).

### New files
- `app/core/risk_filter.py` — `check_risk(question) → (is_risky, category)` with 11 risk categories
- `tests/services/test_query_service.py` — 28 tests covering guardrail, classification, risk filter (all 11 categories), RAG override (Option B), pass-through, and regression scenarios

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
- ~~**Persistence test**~~ — ✅ verified: knowledge survives server restart (PostgreSQL persistence)
- ~~**Routing precision**~~ — ✅ deterministic guardrail + risk filter + Sonnet classifier ensures consistent routing
- ~~**Common-sense Q&A**~~ — ✅ `"answer"` decision in classifier handles general-knowledge questions
- ~~**Risk filtering**~~ — ✅ 11-category pre-filter prevents answering sensitive questions without admin oversight
