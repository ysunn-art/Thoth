# Project Thoth — Architecture & Build Plan

**Team:** GIX Hackathon — T-Mobile Project Thoth
**Phase:** Pre check-in #1
**Document owner:** TBD (suggest: Strong dev #1 / Platform owner)
**Last updated:** Pre-build planning

---

## 1. What we are building

Project Thoth is an AI agent that captures Subject Matter Expert (SME) knowledge through structured interviews, organizes it into an approved knowledge base, and answers user questions from that knowledge base — routing to a human SME when it can't answer confidently.

This is a **proof-of-concept**, not a production system. The goal is to demonstrate technical feasibility through a credible end-to-end prototype.

### The 8 core capabilities (from the brief)

| # | Capability | Owner |
|---|-----------|-------|
| 1 | SME Onboarding | Person A |
| 2 | Expert Interview | Person A |
| 3 | Material Ingestion | Person B |
| 4 | Knowledge Synthesis | Person B |
| 5 | SME Review & Approval | Person B |
| 6 | Knowledge-Grounded Q&A | Person C |
| 7 | Clarifying Follow-ups | Person C |
| 8 | Routing & Escalation | Person C |

### Check-in #1 gate (the focus of this document)

To pass check-in #1 and unlock the next budget tranche, we must demonstrate:

1. End-to-end workflow working (deploy + happy path)
2. Five core capabilities working (1, 2, 4, 5, 6 — the demo-critical subset)
3. Q&A with justification / evidence (citations from approved knowledge)

Capabilities 3, 7, 8 are also implemented but not the gate's hard requirements. We build them in anyway because the demo looks broken without routing (capability 8).

---

## 2. Tech stack & rationale

| Layer | Choice | Why |
|-------|--------|-----|
| Backend | **FastAPI** (Python 3.11+) | Auto OpenAPI docs, async-native, low ceremony, friendly to learning devs |
| Frontend | **Next.js** (TypeScript) + Tailwind | Vercel one-click deploy, large ecosystem, handles two views (SME portal + user chat) |
| Database | **Postgres + pgvector** | Single database for relational data and vector search — no extra service to operate |
| LLM API | **OpenRouter** (OpenAI-compatible) | Provided to us; gives us access to Claude Sonnet/Haiku, GPT, free models — single key, single bill |
| LLM SDK | **`openai` Python SDK** (pointed at OpenRouter) | OpenRouter is OpenAI-compatible; using `openai` SDK is the lowest-friction path |
| Embeddings | **sentence-transformers** (local, `all-MiniLM-L6-v2`) | OpenRouter doesn't reliably do embeddings; local model is free, fast, no extra dependency |
| PDF parsing | **`pypdf`** | Lightweight, sufficient for text extraction from supporting materials |
| Backend hosting | **Railway** | One-click deploy of Python service + managed Postgres; free tier sufficient for hackathon |
| Frontend hosting | **Vercel** | Free tier, one-click deploy from GitHub |

### Why a thin SDK wrapper, not a framework

We use **direct SDK calls** wrapped in a small `llm.py` module (~100 lines). All LLM access goes through this module, which standardizes prompts, structured output via tool-calling, retries, and the `usage` token reporting the benchmark requires.

Reasons we kept it thin:

- **Six LLM calls total** in the system — interview turn, synthesis, query embedding, retrieval, grounded answer, routing. Each is a single prompt with structured I/O. A heavier framework's composability isn't earning its weight here.
- **Token efficiency is graded** in the benchmark. Direct SDK calls let us account for every token — no hidden retries or extra calls under the hood.
- **Pipeline, not agent.** Thoth is a deterministic pipeline (interview → synthesize → review → approve → retrieve → answer), not a tool-selecting agent. Pipelines are easier to debug than agents.
- **Team shape.** With 2 strong + 2 learning devs, a thin direct-SDK wrapper produces clearer stack traces and a smaller surface area for the learning devs to absorb.

### Why **not** the Anthropic SDK directly

Originally planned, but the program provided us an OpenRouter key — we cannot make direct calls to `api.anthropic.com`. Through OpenRouter we can still call Claude (Sonnet 4.5, Haiku 4.5) using the OpenAI-compatible interface. Architecture and prompts are unchanged; only the SDK and model IDs change.

### Why two models (Haiku + Sonnet)

Cost efficiency is a benchmark metric. Lower-stakes calls run on the cheaper model:

- **Claude Haiku 4.5** (`anthropic/claude-haiku-4.5`) — interview turn-taking, routing decisions, simple classification. Fast, cheap (~$1/$5 per million tokens).
- **Claude Sonnet 4.5** (`anthropic/claude-sonnet-4.5`) — synthesis, grounded Q&A. Quality matters here.

Model IDs are constants in `llm.py` so we can swap globally if pricing or availability changes.

---

## 3. System architecture

### High-level flow

```
┌─────────────────┐       ┌─────────────────┐
│  SME Portal UI  │       │  User Chat UI   │
│  (Next.js)      │       │  (Next.js)      │
└────────┬────────┘       └────────┬────────┘
         │                          │
         └──────────┬───────────────┘
                    │ REST (benchmark API contract)
                    ▼
         ┌──────────────────────┐
         │   FastAPI backend    │
         │  ┌────────────────┐  │
         │  │   llm.py       │──┼──► OpenRouter ──► Claude (Haiku / Sonnet)
         │  │  (SDK wrapper) │  │
         │  └────────────────┘  │
         │  ┌────────────────┐  │
         │  │ sentence-      │──┼──► local embedding (384-dim)
         │  │ transformers   │  │
         │  └────────────────┘  │
         └──────────┬───────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │  Postgres + pgvector │
         │  (Railway-managed)   │
         └──────────────────────┘
```

### Two distinct user journeys

**SME journey** — onboarding → interview → upload materials → review synthesized draft → approve. This is gated; admin must also approve before knowledge becomes ACTIVE.

**End-user journey** — ask question → system retrieves from ACTIVE entries only → answer with citation, OR ask clarifying question, OR route to SME, OR escalate to admin.

The two journeys share the same backend but have different frontend views.

### The approval gate (the core trust mechanism)

Knowledge entries flow through a status machine:

```
DRAFT (just synthesized)
   │ SME edits & approves
   ▼
SME_APPROVED
   │ Admin validates & approves
   ▼
ACTIVE  ◄──── only ACTIVE entries are queryable by end users
```

This gate is enforced at the **database query level**, not the UI. The Q&A retrieval `SELECT` filters `WHERE status = 'ACTIVE'`. There is no path by which an unapproved entry can reach a user.

### Source visibility

Two distinct content categories that the system handles differently:

- **Interview transcripts** (`interview_turns` table) — stored, never exposed to end users, never indexed for retrieval. Internal only.
- **Supporting materials** (`materials` table, `is_user_visible` flag) — may be cited to users when the flag is true.
- **Synthesized knowledge** (`knowledge_entries` + `knowledge_chunks`) — what end users actually see when answers are generated.

---

## 4. Data model

### Tables

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Capability 1: SME Onboarding
CREATE TABLE smes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    expertise TEXT[] NOT NULL DEFAULT '{}',
    contact TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Capability 2: Expert Interview
CREATE TABLE interviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sme_id UUID REFERENCES smes(id) ON DELETE CASCADE,
    topic TEXT,
    status TEXT DEFAULT 'in_progress',  -- in_progress | complete
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE interview_turns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interview_id UUID REFERENCES interviews(id) ON DELETE CASCADE,
    role TEXT NOT NULL,  -- 'agent' | 'sme'
    content TEXT NOT NULL,
    turn_number INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Capability 3: Material Ingestion
CREATE TABLE materials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sme_id UUID REFERENCES smes(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    content TEXT NOT NULL,
    file_type TEXT,
    is_user_visible BOOLEAN DEFAULT TRUE,  -- controlled source exposure
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Capabilities 4 & 5: Synthesis, Review, Approval
CREATE TABLE knowledge_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sme_id UUID REFERENCES smes(id) ON DELETE CASCADE,
    topic TEXT NOT NULL,
    summary TEXT NOT NULL,
    key_facts JSONB DEFAULT '[]',
    caveats JSONB DEFAULT '[]',
    status TEXT DEFAULT 'DRAFT',  -- DRAFT | SME_APPROVED | ACTIVE | REJECTED
    review_date DATE,             -- maintenance cycle support
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Capability 6: Q&A retrieval
CREATE TABLE knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entry_id UUID REFERENCES knowledge_entries(id) ON DELETE CASCADE,
    chunk_text TEXT NOT NULL,
    embedding vector(384),  -- local sentence-transformers dimension
    chunk_index INT NOT NULL
);

CREATE INDEX ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);

-- Audit & observability
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type TEXT NOT NULL,  -- 'sme_approve' | 'admin_approve' | 'reject' | 'query' | etc.
    actor TEXT,
    entity_id UUID,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### ER diagram

```
smes (1) ─── (N) interviews ─── (N) interview_turns
  │
  ├── (N) materials
  │
  └── (N) knowledge_entries (1) ─── (N) knowledge_chunks
```

### Status machine for knowledge_entries

```
        ┌─────────┐
        │  DRAFT  │ ◄── synthesis output
        └────┬────┘
             │ SME edits & approves (PUT, POST /knowledge/{id}/approve)
             ▼
       ┌───────────────┐
       │ SME_APPROVED  │
       └──────┬────────┘
              │ Admin approves (POST /knowledge/{id}/admin-approve)
              ▼
         ┌─────────┐
         │ ACTIVE  │ ◄── ONLY this status is queryable
         └─────────┘

   At any stage: POST /knowledge/{id}/reject → REJECTED
```

---

## 5. The benchmark API contract

All teams implement the same REST API for automated evaluation. Our frontend is decoupled — only the API is benchmarked.

| Endpoint | Capability | Returns `usage`? |
|----------|------------|------------------|
| `GET /health` | health check | no |
| `POST /smes`, `GET /smes`, `GET /smes/{id}` | 1. SME Onboarding | no |
| `POST /smes/{id}/interviews` | 2. Start interview | no |
| `POST /interviews/{id}/turns` | 2. Interview turn | **yes** |
| `POST /smes/{id}/materials` | 3. Material upload | no |
| `POST /smes/{id}/knowledge/synthesize` | 4. Synthesis | **yes** |
| `PUT /knowledge/{id}` | 5. SME edit | no |
| `POST /knowledge/{id}/approve` | 5. SME approve | no |
| `POST /knowledge/{id}/admin-approve` | 5. Admin approve | no |
| `POST /knowledge/{id}/reject` | 5. Reject | no |
| `POST /query` | 6, 7, 8. Q&A / clarify / route | **yes** |
| `POST /system/purge` | benchmark setup | no |
| `POST /system/reset` | benchmark setup | no |

### `usage` object format (required on every LLM-touching endpoint)

```json
{
  "prompt_tokens": 412,
  "completion_tokens": 156,
  "total_tokens": 568,
  "model": "anthropic/claude-sonnet-4.5"
}
```

Token efficiency is a benchmark metric. Identical inputs across all teams → directly comparable token consumption.

### `/system/reset` semantics

The benchmark calls `/system/reset` between test runs. Implementation: `TRUNCATE` all tables, preserve schema. **Persistence test:** load knowledge → restart server → query → answer must still work. Anything in-process memory that should be in DB will fail this test.

---

## 6. Agentic engineering approach

### LLM call inventory

The system makes exactly six categories of LLM calls. Each has a fixed prompt template living in `prompts.py`.

| # | Call | Model | Purpose | Output format |
|---|------|-------|---------|---------------|
| 1 | Interview turn | Haiku | Generate the next focused follow-up question | text |
| 2 | Synthesis | Sonnet | Convert (transcript + materials) → structured draft | structured JSON via tool-calling |
| 3 | Query embedding | local | Embed user query for retrieval | vector |
| 4 | Retrieval ranking | n/a | pgvector cosine similarity | top-K chunks |
| 5 | Grounded answer | Sonnet | Generate answer from retrieved chunks with citations, refuse if no match | structured JSON (answer + citations + confidence) |
| 6 | Routing | Haiku | When retrieval below threshold, match question → SME by expertise | structured JSON (sme_ids + reasoning) |

### Why structured output via tool-calling, not "respond in JSON"

Asking the model "respond in JSON" produces unparseable output ~5% of the time (markdown fences, trailing prose, escaped quotes). Tool-calling is provider-enforced — the response either matches the schema or the API errors out. Synthesis and grounded answer both use this.

### Closed-book defense (10% of benchmark score)

The grounded-answer prompt explicitly says: *"If the retrieved context does not contain the answer, respond with `cannot_answer: true` and a brief explanation. Do not use your training knowledge."* Verified by:

1. Reset the DB
2. Ask a domain question
3. System must refuse, not hallucinate

This test is run on Day 6.

### Disclaimer (5% of benchmark score)

Every Q&A response includes: *"This is approved expert knowledge, not professional advice."* Hardcoded into the response wrapper, not generated by the LLM (so it can't be omitted).

### Token efficiency strategies

- **Model routing** — Haiku for simple tasks, Sonnet for hard ones
- **Concise system prompts** — every word costs tokens × every call
- **Chunk retrieval, not full entries** — Q&A pipeline only sends top-3 chunks (~500 tokens) to the LLM, not full entries
- **No re-embedding** — chunks embedded once at synthesis time, reused for every query

---

## 7. Project structure

```
thoth/
├── api/                          # FastAPI backend
│   ├── main.py                   # App entry, route registration
│   ├── llm.py                    # OpenRouter SDK wrapper (~100 lines)
│   ├── prompts.py                # Centralized prompt templates
│   ├── db.py                     # Connection pool, query helpers
│   ├── schemas.py                # Pydantic request/response models
│   ├── embedding.py              # sentence-transformers wrapper
│   ├── routes/
│   │   ├── smes.py               # Capability 1
│   │   ├── interviews.py         # Capability 2
│   │   ├── materials.py          # Capability 3
│   │   ├── knowledge.py          # Capabilities 4, 5
│   │   ├── query.py              # Capabilities 6, 7, 8
│   │   └── system.py             # /health, /system/reset, /system/purge
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── web/                          # Next.js frontend
│   ├── app/
│   │   ├── sme/                  # SME portal (onboarding, interview, review)
│   │   ├── admin/                # Admin approval queue
│   │   └── chat/                 # End-user Q&A interface
│   └── package.json
├── db/
│   └── migrations/
│       └── 001_init.sql          # Full schema (see section 4)
├── ARCHITECTURE.md               # This file
├── README.md                     # Setup, deployed URL, benchmark API key
└── .gitignore                    # MUST include .env
```

### Required environment variables

```
OPENROUTER_API_KEY=sk-or-v1-xxx     # provided by program
DATABASE_URL=postgresql://...        # Railway-managed
BENCHMARK_API_KEY=xxx                # we generate, share with evaluator
```

API keys never go in the repo. `.gitignore` includes `.env` from commit #1.

---

## 8. Team & ownership

### Roles (4 people)

| Person | Slice | Capabilities | Background |
|--------|-------|--------------|------------|
| **A** (learning) | SME side | 1, 2 — onboarding + interview | UI + API for SME entry |
| **B** (learning) | Knowledge side | 3, 4, 5 — materials + synthesis + approval | The human-in-the-loop |
| **C** (strong) | Q&A side | 6, 7, 8 — retrieval, grounded answer, routing | The user-facing demo moment |
| **D** (strong) | Platform | infra, integration, benchmark conformance | Repo, deploy, schema, `usage` wrapper, demo runner |

### Pairing rule

- A pairs with C (interview prompts share patterns with Q&A prompts)
- B pairs with D (synthesis JSON schema co-designed with data model)

Strong devs schedule 30–45 min pairing sessions on Day 3 explicitly. Don't wait for learning devs to ask.

### Vertical slicing principle

Each person owns their capability **end-to-end** — DB → API → UI. We do **not** split by layer (one person on backend, one on frontend). Vertical slicing means integration is continuous, not a Day 5 cliff.

### Stub-first development

Day 1: Person D writes every endpoint as a stub returning the final response shape with hardcoded data. Day 2 onward: each person replaces their stubs with real logic. The frontend builds against working stubs from Day 2. Result: no integration cliff.

---

## 9. Day-by-day plan (Days 1–7 to check-in)

### Day 0 (pre-build, evening before)

- Create shared chat (Discord / Slack / WeChat)
- Create GitHub repo, all 4 collaborators
- Strong devs create OpenRouter, Railway, Vercel accounts
- Add `OPENROUTER_API_KEY` to a shared password vault (1Password / Bitwarden) — not in chat, not in repo

### Day 1 — Foundations (full team together, ~5 hrs)

**Goal:** every person has run the project locally; deployed `/health` returns 200.

- Strong dev #1 screen-shares while building scaffolding (others watch, don't parallel-work)
- Repo skeleton, FastAPI minimal app, Next.js minimal app
- All 8 benchmark endpoints stubbed with correct response shapes
- DB schema written and migrated to Railway Postgres
- `llm.py` v1 (one `complete()` function works against OpenRouter)
- Each person clones, runs locally, pushes a trivial commit
- Deployed URL live

**Day 1 acceptance:** every box below ticked.

- [ ] All 4 cloned the repo
- [ ] All 4 ran backend + frontend locally
- [ ] All 4 pushed at least 1 commit
- [ ] `https://xxx.railway.app/health` returns 200 from any laptop
- [ ] All 8 endpoints stubbed
- [ ] Schema migrated
- [ ] `llm.py` works (one Claude call returns text + usage)
- [ ] All 4 know their Day 2 tasks

### Day 2 — Vertical slices (parallel, ~3 hrs each)

- **A**: Real `POST /smes`, `GET /smes/{id}` against DB. SME signup form.
- **B**: Real `POST /smes/{id}/materials`, PDF parsing, store raw content.
- **C**: pgvector smoke test. Manually insert one fake ACTIVE entry. `POST /query` does real semantic search, returns stub answer.
- **D**: `usage` wrapper finalized. `/system/purge` and `/system/reset` real implementations. Pair with B on materials data model.

### Day 3 — LLM integration (~3–4 hrs each)

- **A**: Real interview turn endpoint. Haiku. 2–3 turns to keep demo crisp. Pair 45 min with C on interview prompt.
- **B**: Synthesis endpoint. Sonnet. Tool-calling for structured JSON output. Pair with D on schema. Build SME review UI.
- **C**: Real grounded Q&A. Sonnet. Closed-book refusal in system prompt. Citation formatting.
- **D**: Admin approval endpoint + admin UI (functional, ugly is fine). Start demo script.

### Day 4 — Routing, persistence, polish (~3 hrs each)

- **A**: Polish interview prompt quality. Tag transcripts `internal_only`. **Add a test** that Q&A pipeline cannot retrieve from transcripts.
- **B**: `review_date` field. Two-step gate enforced at DB query level (only `ACTIVE` is queryable).
- **C**: Routing — when top similarity < 0.7, return SME match by expertise tags. When no match, escalate to admin. Disclaimer added to every Q&A response.
- **D**: First closed-book test run. Token audit of one full demo flow.

### Day 5 — Integration freeze (NOON deadline, ~3 hrs each)

- **Morning**: All open PRs merged by noon. After noon, only bugfixes.
- **Afternoon**: Full team on a call running demo on deployed URL. Triage bugs.
- **Evening**: First timed rehearsal. Aim for 7–8 minutes total.

### Day 6 — Hardening (~2–3 hrs each)

Three tests, all on deployed URL:

1. **Persistence test** — load knowledge, restart server, query → still works
2. **Closed-book test** — reset, query before any data → clean refusal
3. **Hostile question test** — ambiguous, out-of-scope, edge cases

Whoever owns the failing slice fixes it. End of day: all three pass.

### Day 7 — Final rehearsal + buffer (~2 hrs each)

- Two final dry runs
- Lock URL, commit everything
- Write the one-page status doc for check-in
- Strong devs on standby for last-second fixes

---

## 10. Demo script (check-in #1)

The demo tells one continuous story. Total runtime: ~7–8 minutes.

| Step | What happens | Capability shown |
|------|-------------|------------------|
| 1 | Onboard SME "Alex Chen" — expertise: ["network engineering", "5G"] | 1 |
| 2 | Run interview on a topic. Agent asks 2–3 focused follow-ups. Show transcript stored (internal). | 2 |
| 3 | Upload one supporting PDF as material. | 3 |
| 4 | Click "Synthesize" — Sonnet generates structured draft entry, status DRAFT. **Transcript not exposed.** | 4 |
| 5 | SME reviews, edits one sentence, approves → SME_APPROVED. | 5 (SME half) |
| 6 | Admin approves → ACTIVE. **Emphasize: this is the gate.** | 5 (admin half) |
| 7 | Switch to user view. Ask question covered by the entry. Get cited answer with disclaimer. | 6 |
| 8 | **Closed-book test** — reset DB, ask same question, system refuses cleanly. | (10% of benchmark) |
| 9 | Ask out-of-scope question → system routes to Alex Chen (or escalates to admin). | 8 |

The closed-book test is small but high-impact for credibility — it shows the system can't fabricate.

---

## 11. Risks & mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Integration cliff (everyone works in isolation, Day 5 nothing connects) | Demo fails | Vertical slicing + stub-first + daily merges |
| Transcript leakage to end users | Spec violation, demo embarrassment | DB-level filter on Q&A retrieval; Day 4 explicit test |
| LLM fabricates answer instead of refusing | Closed-book test fails (10% of benchmark) | Strict system prompt; Day 6 explicit test |
| Knowledge doesn't survive `/system/reset` | Persistence test fails (5% of benchmark) | Everything in DB, nothing in-process; Day 6 explicit test |
| Token usage way above other teams | Token efficiency score low (5%) | Model routing (Haiku where possible); Day 4 token audit |
| OpenRouter model ID changes | All LLM calls fail | Models as constants in `llm.py`, single point of change |
| Free model rate limits hit during dev | Slow iteration | Use paid Haiku ($1/$5) for hot paths during dev; pennies per session |
| Learning devs underestimate effort, get stuck silently | Slice incomplete by Day 5 | Daily 15-min standup with mandatory "stuck on" item; scheduled pairing on Day 3 |
| Strong devs over-engineer (auth, monitoring, multi-tenant) | Scope blowup | This doc explicitly says "feasibility prototype, not production" |

---

## 12. Out of scope for check-in #1

To keep scope tight, the following are **explicitly deferred** until after the gate passes:

- Authentication / authorization (anyone with the URL can use it; this is a hackathon prototype)
- Multi-tenancy (single global namespace)
- Production-grade error handling beyond basic try/except
- Beautiful UI (Tailwind defaults are fine)
- Monitoring / observability beyond log files
- Audit log UI (table is created but no admin view yet)
- Maintenance cycle automation (the `review_date` field is captured but nothing schedules reminders)

These show up in the **Production Recommendations** deliverable for the final stage, not the prototype.

---

## 13. Production recommendations preview (for final deliverable)

Documenting these now so we don't forget them when the recommendations doc is due:

- **Security**: SSO integration, role-based access, encrypted secrets manager, PII detection on SME inputs
- **Scale**: Vector DB at higher scale (Pinecone / Weaviate), Postgres read replicas, async synthesis jobs in a queue
- **Multi-tenancy**: Per-tenant data isolation, per-tenant SME namespaces, per-tenant approval policies
- **Audit**: Full event log surfaced via admin UI, immutable storage, exportable for compliance
- **Cost**: Aggressive model routing (Haiku/free models for low-stakes), prompt caching, batched embedding refresh
- **Monitoring**: Per-call latency and token tracking, hallucination detection (semantic comparison of answer to retrieved context), alert on rejection rate spikes
- **Maintenance cycle**: Cron-driven re-review reminders to SMEs based on `review_date`; flag stale entries
- **Knowledge migration**: Bulk import path for existing T-Mobile docs (SharePoint, Confluence) with auto-routing to candidate SMEs for review

---

## 14. Appendix — key code snippets

### `llm.py` (the wrapper)

```python
import os
from openai import OpenAI

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ["OPENROUTER_API_KEY"],
)

MODEL_FAST = "anthropic/claude-haiku-4.5"
MODEL_SMART = "anthropic/claude-sonnet-4.5"

def _format_usage(response, model):
    u = response.usage
    return {
        "prompt_tokens": u.prompt_tokens,
        "completion_tokens": u.completion_tokens,
        "total_tokens": u.total_tokens,
        "model": model,
    }

def complete(prompt, system="", model=MODEL_FAST, max_tokens=1024, temperature=0.3):
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    r = client.chat.completions.create(
        model=model, messages=messages,
        max_tokens=max_tokens, temperature=temperature,
    )
    return {"text": r.choices[0].message.content, "usage": _format_usage(r, model)}

def complete_json(prompt, schema, system="", model=MODEL_SMART, max_tokens=2048):
    import json
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    tools = [{
        "type": "function",
        "function": {"name": "submit_response", "parameters": schema},
    }]
    r = client.chat.completions.create(
        model=model, messages=messages, max_tokens=max_tokens,
        tools=tools, tool_choice={"type": "function", "function": {"name": "submit_response"}},
    )
    data = json.loads(r.choices[0].message.tool_calls[0].function.arguments)
    return {"data": data, "usage": _format_usage(r, model)}
```

### `embedding.py` (local, free)

```python
from sentence_transformers import SentenceTransformer

_model = None

def get_model():
    global _model
    if _model is None:
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model

def embed(text: str) -> list[float]:
    return get_model().encode(text).tolist()
```

### `requirements.txt`

```
fastapi==0.115.0
uvicorn==0.32.0
openai==1.54.0
psycopg[binary]==3.2.3
pgvector==0.3.6
pypdf==5.1.0
sentence-transformers==3.3.0
python-dotenv==1.0.1
```

---

**Document version:** 1.0 — pre-build planning
**Next revision:** Day 5 (after integration freeze, update with what actually shipped)
