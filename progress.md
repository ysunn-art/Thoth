# Project Thoth — Progress

## What's done

### Backend structure
All files and folders are in place. The layered architecture (routers → services → repositories → models) is fully scaffolded and wired together.

### Capability 1 — SME Onboarding
- `POST /smes`, `GET /smes`, `GET /smes/{sme_id}` all implemented
- DB model, schema, repository, service complete

### Capability 2 — Expert Interview
- `POST /smes/{sme_id}/interviews` — creates interview
- `POST /interviews/{interview_id}/turns` — sends SME response to Claude (Haiku), gets follow-up question back
- `GET /interviews/{interview_id}` — returns full transcript
- Auto-detects `[INTERVIEW_COMPLETE]` signal, marks interview done

### Capability 3 — Material Ingestion
- `POST /smes/{sme_id}/materials` — accepts PDF / text / markdown (max 10 MB)
- Parses file, chunks text, embeds with local sentence-transformers, upserts to pgvector
- `GET /smes/{sme_id}/materials` — list materials

### Capability 4 — Knowledge Synthesis
- `POST /smes/{sme_id}/knowledge/synthesize` — pulls interview transcripts + material text, calls Claude (Sonnet), stores result as `draft`

### Capability 5 — Review & Approval
- `PUT /knowledge/{entry_id}` — SME edits content
- `POST /knowledge/{entry_id}/approve` — draft → sme_approved
- `POST /knowledge/{entry_id}/admin-approve` — sme_approved → approved (triggers embedding into pgvector)
- `POST /knowledge/{entry_id}/reject` — any state → rejected with optional reason
- 409 enforced on invalid state transitions

### Capabilities 6 / 7 / 8 — Q&A, Clarification, Routing
- `POST /query` — embeds question, cosine search in pgvector (approved entries only), calls Claude (Sonnet), returns structured JSON
- Multi-turn session context via in-memory SessionStore
- `response_type`: `answer` / `clarification` / `routing`
- Disclaimer hardcoded in every response

### System endpoints
- `POST /system/purge` — deletes all DB rows, all vectors, all uploaded files, clears sessions
- `POST /system/reset` — clears sessions only
- `GET /health` — returns status + timestamp

### Vector search
- pgvector with cosine similarity
- PQ (Product Quantization) approximate search layer on top — speeds up search once enough vectors accumulate, falls back to exact search when not ready
- HNSW index in DB migration

### LLM integration
- OpenRouter via `openai` SDK (team's OpenRouter key, not direct Anthropic)
- Two-model routing: Claude Haiku 4.5 for interviews + routing (cheap), Claude Sonnet 4.5 for synthesis + Q&A (quality)
- Local `sentence-transformers` (`all-MiniLM-L6-v2`, 384-dim) for embeddings — free, no extra API key

### DB migration
- Initial Alembic migration (`001_initial_schema.py`) creates all 6 tables with correct schema

### Architecture alignment (2026-04-29)
Migrated the codebase from Anthropic SDK + OpenAI embeddings to match the team's actual architecture doc:
- `llm_client.py` — switched to `openai` SDK → OpenRouter, added two-model routing (Haiku/Sonnet), replaced OpenAI embeddings with local sentence-transformers
- `config.py` — removed `ANTHROPIC_API_KEY` + `OPENAI_API_KEY`, added `OPENROUTER_API_KEY`, embedding dim 1536 → 384
- `requirements.txt` — removed `anthropic`, added `sentence-transformers`
- `knowledge_chunk.py` — vector column 1536 → 384
- `pq_index_service.py` — `EMBEDDING_DIM` 1536 → 384 (was broken after embedding switch)
- `claude.md` — updated stack docs, .env template, requirements, vector index (IVFFlat → HNSW), PQ params

---

## What's NOT done yet

### Blocked right now
- **No `.env` file** — need `DATABASE_URL` (Railway or local Postgres) and `BENCHMARK_API_KEY` (self-generated)
- **Database not created** — `alembic upgrade head` hasn't been run
- **Dependencies not installed** — `pip install -r requirements.txt` hasn't been run
- **App never started** — not tested end-to-end yet

### Next immediate steps (in order)

1. **Set up database**
   - Option A: Create a Railway project → add PostgreSQL → copy `DATABASE_URL`
   - Option B: Local Postgres — `createdb thoth_db`

2. **Create `.env`**
   ```
   DATABASE_URL=postgresql+asyncpg://...
   BENCHMARK_API_KEY=...  # generate: python3 -c "import secrets; print(secrets.token_hex(32))"
   OPENROUTER_API_KEY=sk-or-v1-...
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Run migration**
   ```bash
   alembic upgrade head
   ```

5. **Start the server**
   ```bash
   uvicorn app.main:app --reload
   ```

6. **Smoke test** — hit `GET /health`, then manually walk through one full flow:
   create SME → start interview → submit a turn → synthesize → approve → query

### After smoke test passes

- **Closed-book test** — reset DB, query before any data, system must refuse cleanly (10% of benchmark score)
- **Persistence test** — load knowledge, restart server, query must still work
- **Deploy to Railway** — push code, set env vars in Railway dashboard, get public URL
- **Share URL + BENCHMARK_API_KEY** with evaluator

### Not in scope for check-in #1
- Frontend (Next.js SME portal + user chat) — the benchmark only hits the API
- Authentication beyond the API key
- Production error handling, monitoring, logging
