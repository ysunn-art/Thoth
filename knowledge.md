# Project Thoth — Repository & App Flow Knowledge Base

A from-scratch explanation of what this project is, how it's structured, and how every
piece fits together. Written for someone with zero prior context.

---

## What this project is, in one paragraph

**Project Thoth** is a FastAPI backend for a T-Mobile hackathon. The idea: a Subject
Matter Expert (SME — e.g. a network security engineer) can be "interviewed" by the
system, upload reference PDFs/docs, and the system synthesizes their knowledge into a
vetted entry. Once a draft is approved by both the SME and an admin, it goes into a
searchable knowledge base. End users can then ask questions and get answers grounded in
approved SME content — or get routed to the right expert when there's no good match. A
separate "benchmark" evaluator hits this API programmatically to score the system on
metrics like answer accuracy, routing precision, token efficiency, etc.

This is a **proof-of-concept**, not production. The benchmark tests MVP functionality.

---

## The stack (so the file names make sense)

| Layer | Technology | Role here |
|---|---|---|
| Web framework | **FastAPI** + **Uvicorn** | HTTP endpoints, async, auto-generated `/docs` |
| Database | **PostgreSQL** (Docker image `ankane/pgvector`) | All structured data |
| Vector search | **pgvector** extension + a sidecar **PQ index** (`pq/`) | Semantic search over approved knowledge |
| ORM | **SQLAlchemy (async)** + **Alembic** migrations | Talks to Postgres |
| LLM | **OpenRouter** -> Claude Haiku 4.5 (fast) + Sonnet 4.5 (smart) | Interview Qs, synthesis, Q&A |
| Embeddings | Local **sentence-transformers** `all-MiniLM-L6-v2` (384-dim) | No API key needed; runs on CPU |
| File parsing | **pypdf** | Extracts text from uploaded PDFs |
| Settings | **pydantic-settings** (`.env`) | Config |

Note: CLAUDE.md mentions `claude-sonnet-4-20250514` for synthesis in places, but the live
deployment routes through OpenRouter to `anthropic/claude-haiku-4.5` (fast: interviews,
routing/classification) and `anthropic/claude-sonnet-4.5` (smart: synthesis, Q&A).

---

## Folder tour, top-down

```
.
├── README.md                  # project overview + dated changelog
├── ARCHITECTURE.md            # system design write-up (deliverable)
├── progress.md                # bug log + iteration notes
├── usage.md                   # copy-pasteable setup + curl examples
├── api-specification.md       # the contract the benchmark evaluator expects
├── claude.md / CLAUDE.md      # project instructions for Claude Code
├── TEST.md                    # how to run all test tiers (added during setup)
├── knowledge.md               # THIS FILE
├── thoth-postman-collection.json  # import into Postman to hit the API by hand
├── requirements.txt           # pinned Python deps
├── alembic.ini                # Alembic migrations config
├── pytest.ini                 # test runner config (asyncio_mode = auto)
├── .env / .env.example        # config; real .env holds DB URL, keys
│
├── app/                       # all application code
│   ├── main.py                # FastAPI app, request-id middleware, /health
│   ├── config.py              # pydantic-settings reads .env into Settings
│   ├── dependencies.py        # shared FastAPI deps (DB session, etc.)
│   │
│   ├── routers/               # HTTP layer — one file per resource
│   │   ├── smes.py            # /smes endpoints
│   │   ├── interviews.py      # /interviews + /smes/{id}/interviews
│   │   ├── materials.py       # /smes/{id}/materials (multipart upload)
│   │   ├── knowledge.py       # /knowledge CRUD + state transitions
│   │   ├── query.py           # POST /query (the main Q&A endpoint)
│   │   └── system.py          # /system/purge and /system/reset
│   │
│   ├── services/              # business logic, orchestration, prompts
│   │   ├── sme_service.py
│   │   ├── interview_service.py    # runs interview turns, calls LLM
│   │   ├── material_service.py     # parses/chunks uploaded files
│   │   ├── knowledge_service.py    # synthesis prompt (interview+material -> draft)
│   │   ├── query_service.py        # THE BRAIN: routing, clarify, answer, risk gate
│   │   ├── pq_index_service.py     # maintains the in-memory PQ index
│   │   ├── llm_client.py           # wraps OpenRouter; counts tokens; UsageInfo
│   │   └── session_store.py        # in-memory dict for multi-turn /query sessions
│   │
│   ├── repositories/          # DB access (SQLAlchemy queries)
│   │   ├── sme_repo.py        # + a tiny in-memory cache for list_all()
│   │   ├── interview_repo.py
│   │   ├── material_repo.py
│   │   ├── knowledge_repo.py
│   │   └── vector_repo.py     # pgvector cosine search; PQ approximate fallback
│   │
│   ├── models/
│   │   ├── db/                # SQLAlchemy ORM models = table definitions
│   │   │   ├── base.py        # declarative Base
│   │   │   ├── sme.py, interview.py, turn.py, material.py
│   │   │   ├── knowledge_entry.py    # state: draft/sme_approved/approved/rejected
│   │   │   └── knowledge_chunk.py    # Vector(384) column lives here
│   │   └── schemas/           # Pydantic request/response shapes (the API's wire format)
│   │
│   ├── core/
│   │   ├── auth.py            # HTTPBearer; checks Authorization vs BENCHMARK_API_KEY
│   │   ├── errors.py          # state-machine guard functions + HTTP error helpers
│   │   ├── ids.py            # new_id("sme") -> "sme_a3f2c1b0"
│   │   ├── sanitize.py        # strips prompt-injection-ish noise from questions
│   │   └── risk_filter.py     # regex tiers (self-harm -> block; 12 categories -> escalate); FRONT GATE
│   │
│   └── db/
│       ├── session.py         # async engine + AsyncSession factory
│       └── migrations/        # Alembic
│           └── versions/001_initial_schema.py   # 6 tables + HNSW index
│
├── pq/                        # Product Quantization (numpy-only) — sidecar ANN index
│   ├── kmeans.py, codebook.py, encoder.py, index.py
│
├── storage/
│   └── file_store.py          # writes uploads to ./uploads/{sme}/{mat}/file
│
└── tests/                     # pytest + benchmark harness (see TEST.md)
    ├── repositories/  services/  smoke/
    └── benchmark/             # MediSync RAG benchmark (added during this work)
```

---

## The data model (these tables appear everywhere)

```
smes ──┬─< interviews ──< turns
       ├─< materials              (PDF/txt/md the SME uploads)
       └─< knowledge_entries      ← state machine lives here
                  │
                  └─< knowledge_chunks  (vector(384), pgvector HNSW index)
```

### SQL tables (PostgreSQL)

**smes**: `id (sme_...) PK, name, specialization, sub_areas TEXT[], contact_email, created_at`

**interviews**: `id (int_...) PK, sme_id FK, topic, status('in_progress'|'completed'), created_at`

**turns**: `id (turn_...) PK, interview_id FK, turn_number, sme_response, agent_follow_up (NULL = interview complete), timestamp`

**materials**: `id (mat_...) PK, sme_id FK, title, description, file_type (MIME), file_path, status('processing'|'processed'|'failed'), created_at`

**knowledge_entries**: `id (ke_...) PK, sme_id FK, topic, status('draft'|'sme_approved'|'approved'|'rejected'), content, source_interviews TEXT[], source_materials TEXT[], rejection_reason, created_at, updated_at, approved_at, admin_approved_at, rejected_at`

**knowledge_chunks** (pgvector): `id PK, entry_id FK->knowledge_entries ON DELETE CASCADE, chunk_index, chunk_text, embedding vector(384), created_at`
- Index: `hnsw (embedding vector_cosine_ops)`
- Only chunks whose parent entry `status='approved'` are queried at search time.

### Knowledge entry state machine

```
draft ──/approve──► sme_approved ──/admin-approve──► approved
  │                     │                               │
  └──/reject──► rejected ◄──/reject──────────────────── ┘
```
Invalid transitions -> **409 Conflict** (guard in `core/errors.py`):
- `/approve` on anything not `draft`
- `/admin-approve` on anything not `sme_approved`
- `/reject` on something already `rejected`

**`admin-approve` is the moment knowledge "goes live"** — it chunks the entry content,
embeds each chunk, and upserts to `knowledge_chunks`. Before that, the entry is invisible
to `/query`.

---

## All endpoints

### Health
- `GET /health` -> `{ status: "healthy", timestamp: ISO8601 }` (no auth)

### SMEs (capability 1: SME Onboarding)
- `POST /smes` -> 201, no LLM
- `GET /smes` -> 200 list
- `GET /smes/{sme_id}` -> 200 or 404

### Interviews (capability 2: Expert Interview)
- `GET /smes/{sme_id}/interviews` -> list
- `POST /smes/{sme_id}/interviews` -> 201, status 'in_progress', may call LLM
- `POST /interviews/{interview_id}/turns` -> 200, **always LLM**, returns `agent_follow_up` (null if `[INTERVIEW_COMPLETE]`)
- `GET /interviews/{interview_id}` -> full transcript

### Materials (capability 3: Material Ingestion)
- `POST /smes/{sme_id}/materials` -> multipart (file+title+description). Accepts
  `application/pdf`, `text/plain`, `text/markdown`. Max 10 MB else 400. Processed
  synchronously: parse -> (stored). Returns `status: "processed"`.
- `GET /smes/{sme_id}/materials` -> list

### Knowledge (capabilities 4 & 5: Synthesis, Review & Approval)
- `POST /smes/{sme_id}/knowledge/synthesize` -> 201, **always LLM**. Body
  `{interview_ids[], material_ids[], topic}`. Pulls transcript + material text, sends to
  Claude, stores `status:"draft"`.
- `GET /knowledge` -> list all (optional `?status=approved`). **Returns `{"entries":[...]}`**
  (a dict with an `entries` key, NOT a bare list). Each entry uses `entry_id`.
- `GET /knowledge/{entry_id}` -> 200 or 404 (has `content`, `status`, `updated_at`)
- `PUT /knowledge/{entry_id}` -> update content
- `POST /knowledge/{entry_id}/approve` -> draft -> sme_approved (409 if not draft)
- `POST /knowledge/{entry_id}/admin-approve` -> sme_approved -> approved (409 if not
  sme_approved); **triggers chunk + embed into pgvector**
- `POST /knowledge/{entry_id}/reject` -> any non-rejected -> rejected (409 if already)

### Query (capabilities 6, 7, 8: Q&A, Clarification, Routing)
- `POST /query` -> **always LLM**. Body `{question, session_id}`. session_id maintains
  multi-turn context in SessionStore. Returns: `answer, grounded, sources, disclaimer,
  session_id, response_type, routed_to, timestamp, usage`.
  - `response_type` is `"answer" | "clarification" | "routing"`.
  - `grounded:true` => `sources = [{entry_id, sme_name, topic}]`.
  - `routing` => `routed_to = [{type:"sme"|"admin", sme_name, specialization, reason}]`.

### System
- `POST /system/purge` -> delete ALL data (all tables in FK order + all vectors + all
  files + clear sessions)
- `POST /system/reset` -> clear session context only, preserve all DB data

### Usage reporting
Every LLM endpoint returns a top-level `usage` object: `{prompt_tokens, completion_tokens,
total_tokens, model}`. Multiple LLM calls in one request are summed. Required on
`/turns`, `/synthesize`, `/query`.

---

## How the `/query` endpoint actually flows (the core — see `query_service.py`)

This is the heart of the system. Step by step:

This reflects the current architecture **after the Phase 1+2 routing refactor** (see
`improvement.md` for the full plan, results, and rationale).

1. **Sanitize** the question (`core/sanitize.py`).
2. **Risk filter — FRONT GATE** (`core/risk_filter.py`, `check_risk`). **Any** risk hit
   escalates to admin **before embedding** — independent of whether the KB has related
   chunks. This is the Phase 1 change: risk is no longer deferred into the no-chunks
   branches, so the RAG path can no longer answer a harmful-but-on-topic question.
   - **Tier 1 (self_harm)**: blocked immediately, distinct reason string.
   - **Tier 2 categories**: billing / account / privacy / legal / security / medical /
     financial / authz / destructive / org, plus the Phase-1 additions **fraud**
     (forgery / falsifying documents), **harm** (overdose / injuring others), and
     extended **security** (prompt-injection, instruction override, safety-protocol
     bypass). Action-oriented regex.
3. **Embed** the question locally (sentence-transformers, 384-dim). **2d:** when session
   history exists, recent user turns are prepended to the *embed input only* so a bare
   follow-up ("I mean the Model X1.") still retrieves the right chunk. The LLM prompt
   still receives the raw question + full history.
4. **Vector search** (`vector_repo.search`, `top_k=8`) — pgvector cosine over approved
   chunks (PQ approximate index used if trained, exact fallback otherwise).
5. **Relevance filter**: `RELEVANCE_THRESHOLD = 0.30` (lowered from 0.35 per the Phase 0
   probe: correct-chunk sims live ~0.34–0.65, so 0.30 maximizes recall; once the LLM owns
   the decision the threshold is a recall filter, not a precision gate).
   - If **no chunks** OR **none above threshold** -> `_classify_and_route` (the no-RAG
     path; risk was already handled at the front gate).
6. **RAG answer path** (when relevant chunks exist): build a prompt with the chunks +
   session history + all SME profiles, call **Sonnet** (temperature=0). The system prompt
   allows `response_type` of **"answer" | "clarification" | "routing"** and is
   **answer-willing by default** — answer when chunks are topically relevant; clarify only
   when a required detail is unspecified AND ≥2 candidate subjects differ; route only when
   ALL chunks are off-topic. Strict citation / faithfulness rules; multi-source synthesis
   ("cite ALL contributing entries", reproduce exact tokens verbatim).
7. **(REMOVED) the deterministic guardrail.** The old `GUARD_MAX_SIM=0.40` force-answer
   override is gone (Phase 2c) — a 0.40 cosine is embedding noise and must not override a
   temp-0 Sonnet decision. The LLM now owns answer/clarify/route directly.
8. **Session store**: append Q + A so follow-ups have context.
9. **Usage**: token counts from every LLM call summed into the returned `usage`.

`_classify_and_route` (the no-RAG path) is a single Sonnet call (temperature=0) that
decides `answer` (common-sense, grounded=false) / `clarify` / `route` (to matching SMEs or
admin). It also carries the high-risk-topic guidance.

---

## Retrieval & chunking pipeline (deep dive)

Exact mechanics of how knowledge becomes searchable and what the LLM actually sees at
query time. Investigated 2026-06-02; line numbers as of that date.

### Chunking strategy
There are **two chunkers**, but only one feeds search:

- **Knowledge-entry chunker** — `knowledge_service.py:31` `_chunk_text()`. **This is what
  gets embedded and searched.** Runs at **admin-approve** on `knowledge_entries.content`.
  **Fixed-width raw character slicing**: `CHUNK_SIZE = 800` chars, `CHUNK_OVERLAP = 100`
  chars → stride 700. No sentence/paragraph/markdown awareness, no token counting — a chunk
  can start/end mid-sentence or mid-table. A 1500-char entry → 3 chunks; a 3200-char entry
  → 5 chunks.
- **Material chunker** — `material_service.py:12` (2000/200). **Vestigial for retrieval**:
  uploaded materials are stored to disk only and their text is pulled in at *synthesis*
  time; they are **not** embedded into `knowledge_chunks`. Uploaded files never become
  searchable chunks directly.

### Embeddings
- Model: **`all-MiniLM-L6-v2`** (local sentence-transformers, `llm_client.py:35`), run via
  `asyncio.to_thread`. No API key.
- **384 dimensions** — `Vector(384)` column (`knowledge_chunk.py:14`), cosine distance,
  HNSW index. `config.py` `embedding_dim=384`.
- **Caveat**: MiniLM truncates at ~**256 word-pieces**. An 800-char dense spec chunk can
  exceed that, so the *tail* of a chunk may not be embedded at all.

### What chunks answer a question (`query_service.py` → `vector_repo.search`)
1. Embed the question (with recent user turns prepended for follow-ups — "2d" enrichment).
2. `vector_repo.search(query_embedding, top_k=8)` (`query_service.py:488`) — PQ approximate
   index if trained, else exact pgvector cosine; **filtered to `status='approved'` only**;
   returns up to 8 `(chunk, entry, similarity)` where `similarity = 1 − cosine_distance`.
3. Filter by **`RELEVANCE_THRESHOLD = 0.35`** (`query_service.py:349`). ⚠️ **Doc/code
   drift**: this section previously claimed `0.30`, but the code is **0.35**. Survivors
   become `knowledge_context`; zero survivors → the no-RAG `_classify_and_route` path.
4. Each survivor is rendered as `[Entry id | Topic | SME | Relevance] <chunk_text>` and
   that is what the LLM (and the verification layer) see.

### Diagnosed retrieval failures (MediSync benchmark, 20-entry seed, 2026-06-02)
Several CAR/RP fails were traced to **fact-bearing chunks being cut at the 0.35 threshold**
— the data was present and surfaced in top-8, then the filter deleted it before the LLM saw
it. The model then truthfully said "I don't have that info" and clarified/routed. **These
are retrieval-cutoff failures, not model/prompt failures** — and the verification layer
cannot rescue a fact the threshold already deleted.

| Case | Fact | Lives in | Real sim | Verdict |
|---|---|---|---|---|
| RP_01 | X1 battery = 8 hours | X1 Infusion Pump, chunks #0/#1 | 0.347 | DROPPED (<0.35) |
| CAR_07 | pump contraindicated under 5 kg | Infusion Safety, chunks #0/#3 | 0.347/0.336 | DROPPED |
| CAR_10 | report within 24 hours | Infusion Safety, chunk #2 | 0.335 | DROPPED |

Two compounding mechanisms:
1. **Threshold drift (0.35 vs documented 0.30):** RP_01 (0.347) and CAR_10 (0.335) sit in
   the 0.30–0.35 dead zone — they would survive at the intended 0.30.
2. **800-char fixed-char chunking dilutes & separates facts:**
   - RP_01: "Battery Life: 8 hours" is one line in an 800-char window dominated by
     flow-rates/firmware; the generic query "battery life" matches *other* models' dedicated
     battery lines better (X3 0.488, X2 0.460, M1 0.458). The right answer ranks **6th**,
     behind three wrong models.
   - CAR_10 (worst): "Submit adverse event report **within 24 hours**" is chunk #2 (0.335,
     dropped). The chunk that *is* kept (0.381) is chunk #4 — the *caveats* section, which
     literally says "the nature of events qualifying... is not detailed." The model was
     handed a chunk asserting the info is absent while the number-bearing chunk was cut.
   - CAR_07: the only "5 kg" in a kept chunk is actually "1.5 kg" (S1 device weight) — a
     false substring; the real patient contraindication chunks were both dropped.
3. **Slot waste**: the same entry recurs across top-8 (Infusion Safety appeared 5× in
   CAR_10's ranking), crowding out other entries.

**Highest-leverage fixes (identified, NOT yet applied):**
1. Set threshold back to **0.30** (one constant; matches docs). Recovers RP_01 + CAR_10.
2. **Smaller / structure-aware chunks** (split on sections/bullets, ~300–400 chars or
   token-based under MiniLM's 256 limit) so a single fact isn't diluted and stays attached
   to its heading.
3. **De-dupe by entry in top-k** (group chunks per entry, or raise top_k then collapse).

---

## Other flows

- **Interview turn** (`interview_service.py`): system prompt frames an SME knowledge
  elicitation interview on a topic; appends prior turns; if the model replies
  `[INTERVIEW_COMPLETE]`, sets `agent_follow_up=null` and marks interview `completed`.
- **Synthesis** (`knowledge_service.py`): loads interview transcripts + material text
  (PDFs parsed via pypdf; materials loaded concurrently via asyncio.gather), sends to
  Claude with a "synthesize into a structured knowledge entry" prompt, stores result as a
  `draft`. The current synthesis prompt is tuned to **reproduce exact fact tokens
  verbatim** (numbers, codes, dates, $amounts) — verified at 100% token fidelity on the
  MediSync seed.
- **Vector search** (`vector_repo.py`): dual-track — PQ approximate search trained at 16+
  chunks (persisted to `pq_index.pkl`), with pgvector exact cosine as fallback. Bulk chunk
  insert in one round-trip. Only `approved` entries are searchable.
- **Embeddings** run via `asyncio.to_thread` to avoid blocking the event loop.

---

## Infrastructure facts (local dev, this machine)

- DB: Docker container `thoth-db` (`ankane/pgvector`), creds `user/pass`, db
  `benchmark_db`, port 5432. `DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/benchmark_db`.
- In WSL, `docker` may not be on PATH; binary at
  `/mnt/wsl/docker-desktop/cli-tools/usr/bin/docker`, and group access via
  `sg docker -c "docker ..."`.
- Migrations: `alembic upgrade head` (creates 6 tables + HNSW index; extension `vector`).
- Server: `uvicorn app.main:app --host 0.0.0.0 --port 8000`. First boot downloads the
  embedding model (~80 MB).
- `.env` keys: `DATABASE_URL`, `BENCHMARK_API_KEY`, `OPENROUTER_API_KEY`, `UPLOAD_DIR`,
  `EMBEDDING_DIM=384`. `app/config.py` expects the var named `OPENROUTER_API_KEY` (an
  earlier `.env` used `OPENAI_API_KEY`, which does NOT bind).
- The Postman collection's `api_key` was `11d388...a60a8`; the server's
  `BENCHMARK_API_KEY` was aligned to that value so Postman + benchmark share one key.

---

## Benchmark metrics (instructor scorecard) the system is graded on

| Metric | Weight | Core requirement |
|---|---|---|
| Closed-Book Failure Rate | 10% | Refuse to answer before data is loaded |
| Functional Capability Pass Rate | 25% | The 8 capabilities work |
| Context Answer Ratio (CAR) | 20% | Answers contain the specific facts from SME materials; must answer (not clarify/route) when KB can answer; grounded; no hallucination/extra facts |
| Routing Precision | 15% | Out-of-scope -> routed to right SME/admin; answerable -> NOT routed; same session_id -> identical decision (deterministic) |
| Interview Quality | 5% | Relevant follow-up questions |
| Synthesis Quality | 5% | Coherent, accurate synthesized knowledge |
| Response Latency | 5% | Fast |
| Token Efficiency | 5% | Concise answers (target <=150 tokens unless detail needed) |
| Persistence | 5% | Knowledge survives session reset |
| Guardrail Effectiveness | 5% | Disclaimers, advice refusal, parametric leakage resistance |

---

## Known issues & diagnosis — RESOLVED by Phase 1+2 (2026-06-02)

The `702af69` "CAR optimization" had produced an **unstable answer-vs-route boundary**
governed by fragile similarity thresholds. The five original failure modes and their
current status (full plan + 3×-averaged results in `improvement.md`):

1. ~~**Over-answers out-of-KB questions**~~ (RP) — FIXED. The `GUARD_MAX_SIM=0.40`
   force-answer guardrail is **deleted** (Phase 2c); the LLM owns routing. RP 0.35→**0.63**.
2. ~~**Wrongly routes some in-KB questions**~~ (CAR) — FIXED. The "chunks lack specific
   details -> route" over-routing clause is **removed** and the prompt is answer-willing.
   CAR 0.79→**0.89**.
3. ~~**Cannot clarify on-topic**~~ — FIXED. RAG schema now allows
   "answer"|"clarification"|"routing" (Phase 2a). NOTE: multi-turn clarify works but is
   **non-deterministic** (fires ~1 run in 3) — model stochasticity, not prompt-fixable.
4. ~~**Answers harmful on-topic questions**~~ (guardrail) — FIXED. `check_risk` is now a
   **front gate before embedding** (Phase 1), and the regex was broadened to catch the
   misses (fake FDA letter / overdose / prompt-injection / falsify logs / override safety).
   Guardrail 0.67→**1.00** (stable across all 3 runs).
5. **Verbosity** — DESCOPED. Token efficiency was explicitly set aside; no `max_tokens`
   cap was added. (Completion tokens did drop ~327→~220 as a side effect of removing the
   guardrail retry and the "3-6 paragraphs" wording.)

**Current state:** Guardrail 1.00, CAR 0.89, RP 0.63 (3× averaged). Remaining soft spot:
multi-turn determinism (MT ~0.13, noisy). Phase 3 (caching/tool-calling) was investigated
and **skipped** — the only graded determinism cases (RP_11/RP_12) already pass identical,
so caching adds nothing, and neither lever fixes single-fire MT variance.

Why local benchmark scores != instructor scores:
- **Different data**: the local MediSync synthetic KB + clean lookups are easier than the
  instructor's eval set; absolute scores are not directly comparable. Trust the failure-
  mode reproductions, not the absolute numbers.
- **Run-to-run noise**: temp-0 Sonnet via OpenRouter is not perfectly deterministic;
  single-run deltas are mostly noise — average 3× before believing a change.

---

## Benchmark harness (tests/benchmark/) — current state

- `dataset/knowledge_base.csv` — 7 approved MediSync entries, 4 SMEs (David Chen / Technical
  Support, Maria Lopez / Customer Support, Dr. Sarah Kim / Clinical Safety, James Okafor /
  Trade Compliance). 100% fact-token fidelity verified through synthesis.
- `dataset/test_cases.csv` — 70 single-turn cases across CAR/RP/GR/LT/CB/FN/SY/PS/WK.
- `dataset/multi_turn.csv` — 5 clarify->answer sequences.
- `run_benchmark.py` — seeds KB, runs scored suite, prints per-metric table, writes
  `last_run.json`. Flags: `--no-seed`, `--only PREFIX,...`, `--min-score N`.
- Seeding path (no direct "insert approved entry" endpoint exists): create SME -> upload
  content as a `.txt` material -> synthesize -> approve -> admin-approve.

### Harness scoring notes
- CAR (`score_car_case`): graded fact-recall, gated by `answered` (answer + grounded +
  not routed). `expected_answer_contains` uses `;`=AND, `|`=OR. Faithfulness
  (`_faithfulness`) is a **soft diagnostic** (`REVIEW_FACTS=[...]`), not a gate, because
  deterministic token-matching is unreliable both ways.
- Action cases FN_01/FN_02/FN_03/SY_01/SY_02 call real endpoints (health, /smes, synth ->
  draft inspect), not /query.
- Repeatability rows (RP_11/RP_12) fire 3x and require identical decisions.
- `_clean_q` strips `[...]` annotations before sending.

### Plan — superseded by improvement.md (Phase 1+2 DONE 2026-06-02)
- DONE Step 0 — harness honest (FN/SY/CB real endpoint probes).
- DONE Step 1 — CAR scorer: recall + answered-gate; faithfulness as diagnostic.
- DONE Step 2 — system fix: removed the "lacks specific details -> route" clause, deleted
  the 0.40 guardrail, lowered threshold to 0.30. Answerable questions no longer mis-routed.
- DONE — guardrail Option-B (risk now a front gate, applies whether or not chunks exist)
  and clarification in the RAG schema. Both shipped in Phase 1/2.
- SKIPPED Step 3 — run-to-run determinism: the graded repeatability cases (RP_11/RP_12)
  already pass identical; caching/tool-calling add nothing measurable. See improvement.md.
- DEFERRED (out of scope) — token efficiency / answer length cap.
