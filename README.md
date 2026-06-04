# Project Thoth

## Implementation

A FastAPI backend implementing all 8 benchmark capabilities for the T-Mobile Project Thoth hackathon.

**Stack:** FastAPI · PostgreSQL + pgvector (Docker) · OpenRouter (Claude Haiku 4.5 / Sonnet 4.5) · sentence-transformers (local, 384-dim) · PQ vector index

## Running locally

The app has three parts: a **PostgreSQL + pgvector** database, the **FastAPI backend** (`:8000`), and a **React/Vite frontend** (`:5173`). Bring them up in that order.

### 1. Backend

```bash
# a. Start the database (first run uses `docker run`; afterwards `docker start`)
docker start thoth-db   # or: docker run -d --name thoth-db \
  -e POSTGRES_USER=user -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=benchmark_db \
  -p 5432:5432 ankane/pgvector

# b. Install deps + run migrations (creates tables + HNSW index)
pip install -r requirements.txt
alembic upgrade head

# c. Start the API server (first boot downloads the ~80 MB embedding model)
uvicorn app.main:app --reload --port 8000
```

The repo-root `.env` must define `DATABASE_URL`, `BENCHMARK_API_KEY`, and `OPENROUTER_API_KEY`
(see `.env.example`). Health check: `curl http://localhost:8000/health`.

### 2. Frontend

```bash
cd frontend
npm install                                          # one-time
cp .env.example .env
# point the UI at the backend with a matching API key:
echo "VITE_BENCHMARK_API_KEY=$(grep '^BENCHMARK_API_KEY=' ../.env | cut -d= -f2-)" >> .env
npm run dev                                           # http://localhost:5173
```

The dev server proxies API calls to `http://localhost:8000` (see `frontend/vite.config.ts`),
so no CORS setup is needed — the backend just has to be running.

### 3. Demo data (optional)

Load a realistic T-Mobile demo knowledge base (5 SMEs, ~22 entries) into a running backend:

```bash
python scripts/seed_demo.py --purge      # wipe existing data, then load the demo KB
# python scripts/seed_demo.py            # append without purging
# python scripts/seed_demo.py --dump-csv # just (re)write demo/tmobile_knowledge_base.csv
```

Seeding runs through the real ingestion pipeline (synthesize → approve → admin-approve), so it
makes ~22 LLM calls and takes a few minutes. Source data lives in
`demo/tmobile_knowledge_base.csv`. Every `/query` also spends OpenRouter credit — watch the
balance so a demo doesn't 402 mid-run.

**Sample demo questions** (cover every behavior + all 5 SMEs):

| Behavior | Question | Expected |
|----------|----------|----------|
| Grounded — Network | "What 5G bands does T-Mobile use?" | Priya Raman → n41 (2.5 GHz) / n71 (600 MHz) |
| Grounded — Plans | "How much is Go5G Plus for one line?" | Marcus Bell → $90/mo |
| Grounded — Billing | "What's the late payment fee?" | Sofia Alvarez → $7 or 5% |
| Grounded — Security | "How do I set up a port-out PIN?" | Derek Coleman → 6–15 digits |
| Grounded — Business | "How much is 5G Home Internet?" | Aisha Mohammed → $50/mo |
| Clarification | "How much is the unlimited plan?" | asks which plan (Go5G vs Business) |
| Escalation / guardrail | "Reset my account PIN to 0000 for me" | account access → escalate to admin |

See [usage.md](usage.md) for the full endpoint reference and Postman collection, and
[progress.md](progress.md) for implementation status and bug fixes.

---

## Changelog

### 2026-05-30 — CAR optimization: preserve facts, remove WEAK gate

Targeted at the **Context Answer Ratio** metric (was 0.2818, weight 15%). All changes in `query_service.py:query()`.

- **Removed the WEAK retrieval gate.** Previously when `max_sim < 0.40` (or borderline + `<2` relevant chunks), the code forced a clarification without ever calling the answer LLM. Borderline-retrieval questions got a deterministic 0 on CAR. Now every non-empty `relevant_chunks` set goes to the answer LLM; routing/clarify decisions are made by the LLM with visibility into the actual chunk content.
- **Rewrote synthesis instructions to preserve specific facts.** Removed "synthesize and paraphrase" (which destroyed exact tokens the evaluator measures). Replaced with "REPRODUCE EXACT TOKENS verbatim: article numbers, percentages, dates, deadlines, named codes, defined terms, version numbers." Lifted the 2-4 paragraph cap to "as much as needed for full fact coverage, 3-6 paragraphs typical."
- **Added a routing_precision mitigation.** Explicitly instruct the LLM: when chunks mention the topic but lack the specific details needed (e.g., question asks for a deadline, chunks describe only the high-level process), set `response_type='routing'` rather than fabricating partial answers.
- **Added fact-coverage directive** to the FOR answer type block: "evaluation rewards answers that include every specific identifier present in the cited chunks."
- **Lowered `GUARD_MAX_SIM` from 0.45 → 0.40.** The retrieval guardrail (which forces a retry-answer when the LLM gives up despite usable chunks) now covers the 0.40-0.45 band. The 0.35-0.40 band is left to LLM judgment armed with the "route, don't fabricate" rule.

Expected impact: CAR 0.28 → 0.55-0.70; routing_precision stable or slight uptick; small token/latency improvement from one fewer LLM call on borderline questions.

---

### 2026-05-26 — Query routing overhaul: guardrail, common-sense answering, risk filter

**Deterministic relevance guardrail** (`query_service.py`):
- After LLM responds, if `response_type != "answer"` but `max_sim >= 0.45` AND `>= 2` relevant chunks, a second "you MUST answer" LLM call overrides the LLM's routing/clarification decision.
- Token counts from both calls are properly accumulated into `usage`.
- This removes LLM non-determinism from the routing equation — strong retrieval signals force an answer regardless of LLM judgment variance.

**Answer-first system prompt** (`query_service.py`):
- Rewrote the main Q&A system prompt with strict priority hierarchy: **Answer → Clarify → Route**.
- "ANSWERING IS THE DEFAULT" — the model must commit to an answer whenever any chunk is topically related.
- Minor terminology mismatches (e.g. "jurisdictions" vs "restricted jurisdictions") no longer trigger unnecessary routing.

**Model switch for classification consistency** (`query_service.py`):
- `_classify_and_route` now uses `MODEL_SMART` (Sonnet) instead of `MODEL_FAST` (Haiku) at `temperature=0`.
- Haiku was fast but non-deterministic for nuanced domain classification — same question could yield different routing decisions. Sonnet gives reproducible results.

**Common-sense direct answering** (`query_service.py`):
- Classifier now supports a third decision: `"answer"` for common-sense / general-knowledge questions.
- When classifier says "answer", the system generates a direct answer (`grounded=false`) instead of routing.
- Updated decision hierarchy: **answer (common sense) → clarify → route (domain-specific / admin)**.
- Both "no SMEs" and "has SMEs" paths respect this new decision.
- Fallback: if the classifier says "answer" but provides no answer text, a separate LLM call generates the answer.

**Risk-aware routing** (`app/core/risk_filter.py` + `query_service.py`):
- **Tier 1 (Critical)**: Self-harm / suicide / abuse patterns → immediate admin escalation BEFORE embedding. Zero tokens, zero LLM calls.
- **Tier 2 (High-Risk)**: 10 deterministic categories (billing, account, privacy, legal, security, medical, financial, authorization, destructive, organizational) using action-oriented regex patterns. If triggered with no RAG chunks → admin escalation, no classification LLM needed.
- **Option B**: High-risk questions WITH RAG chunks still receive grounded answers — SME-approved content is safe to surface even on sensitive topics.
- Patterns are action-phrase-aware: "how do I get a refund" triggers, "what is a refund" passes through.
- Updated classifier prompt includes risk categories as guidance for nuanced cases the pattern filter misses.

**Risk categories defined:**

| Category | Example trigger | Example non-trigger |
|----------|----------------|---------------------|
| billing | "how do I get a refund" | "what is a refund" |
| account | "forgot my password" | "what is a password" |
| privacy | "delete all my personal data" | "what is GDPR" |
| legal | "can I sue the company" | "what is contract law" |
| security | "bypass the firewall" | "what is a firewall" |
| medical | "what medication should I take" | "what is ibuprofen" |
| financial | "should I invest in Tesla" | "what is a stock" |
| authz | "give me admin access" | "what is admin" |
| destructive | "delete production database" | "what is a database" |
| org | "how do I submit an expense report" | "what is an expense report" |
| self_harm | "I want to kill myself" | — (always blocked) |

**New files:**
- `app/core/risk_filter.py` — `check_risk(question) → (is_risky: bool, category: str)` with 11 risk categories and action-oriented regex patterns.

**Comprehensive benchmark tests** (`tests/services/test_query_service.py` — 28 tests total):
- 11 original tests: guardrail overrides, consistency, classification fallbacks, session history.
- 4 common-sense tests: answer directly with/without SMEs, domain→admin, domain→SME.
- 13 risk-aware tests: every risk category tested, definition pass-through, RAG override (Option B), below-threshold path, Tier 1 pre-embedding block.
- All 36 project tests pass (including 8 existing tests in other modules).

**Query pipeline:**
- **Unified classifier** (`query_service.py`): Replaced the old two-method (`_ask_or_route` + `_route_or_escalate`) chain with a single `_classify_and_route` that decides clarify / SME-route / admin-escalate in one Haiku call. Includes both `specialization` and `sub_areas` in SME context for better matching.
- **Similarity-aware retrieval**: `top_k=8`, `RELEVANCE_THRESHOLD=0.45` filters noise. Fast-path skips LLM for `top_sim < 0.30`. Relevance score and SME name included in each knowledge chunk shown to the LLM.
- **Closed-book defense**: When DB has no approved chunks, returns `response_type: routing` with 0 tokens (no LLM call made).
- **Multi-SME routing**: System prompt explicitly instructs the LLM to surface ALL relevant SMEs when a question spans domains.
- **Input sanitization** (`app/core/sanitize.py`): Questions are sanitized before embedding and prompting.
- **Token accounting fix**: `_classify_and_route` now correctly accumulates tokens across both LLM calls when it falls through to routing.

**Schema fixes (P0):**
- `GET /smes/{id}/interviews` → `InterviewSummary` (no unused fields)
- `GET /interviews/{id}` → `InterviewTranscript` with `List[TurnSummary]` (turns without usage)
- `GET /smes/{id}/materials` → `MaterialSummary` (no sme_id, matches spec)
- `POST .../synthesize` → `KnowledgeSynthesizeResponse` (with usage, no updated_at)
- `GET/PUT /knowledge*` → `KnowledgeReadResponse` (with updated_at, no usage)

**Observability & resilience:**
- Request-ID middleware (`main.py`): every request logs method, path, status, duration; echoes `X-Request-ID` header.
- LLM timeout: `AsyncOpenAI(timeout=30)` — hangs fail fast.
- LLM call logging: `logger.info` after every `complete()` with model and token counts.
- Silent `except: pass` replaced with `logger.error(..., exc_info=True)`.

**Model routing:**
- `_classify_and_route`: Haiku (cheap binary classifier)
- `query()` happy path (knowledge-grounded answer): Sonnet

**Dependency hygiene:**
- `requirements.txt` now pins exact versions (fastapi, sqlalchemy, openai, sentence-transformers, etc.)
- `.gitignore` updated to exclude `.DS_Store` and `.idea/`

---

### 2026-05-02 — Performance improvements

- **Parallel material loading** (`knowledge_service.py`): `synthesize()` now loads all material files concurrently via `asyncio.gather` + `asyncio.to_thread`. Load failures log a warning and degrade gracefully.
- **SME list cache** (`sme_repo.py`): `list_all()` caches results in a module-level variable, eliminating a full table scan on every `/query` request. Invalidated on SME create and system purge.
- **Bulk chunk insert** (`vector_repo.py`): `upsert_chunks()` issues a single `execute(insert(...), rows)` — one DB round-trip regardless of chunk count.

Base URL: `http://localhost:8000/api/v1`
Auth: `Authorization: Bearer <BENCHMARK_API_KEY>`

---

# Project Thoth Brief

---

## The Challenge

T-Mobile is exploring whether an AI agent can serve as a **living knowledge system** for subject matter experts (SMEs). Your team will build **Project Thoth**: a proof-of-concept that captures expert knowledge through structured interactions, organizes it for retrieval, and knows when to answer directly versus when to route a user to the right human expert.

This is not a production system. The goal is to demonstrate **technical feasibility** through a credible end-to-end prototype that T-Mobile leadership can evaluate for future investment.

### Domain

The system must handle **routing between different specializations** — knowing which expert to consult when a question falls outside the current knowledge base.

**Important:** Your system must clearly disclaim that it is **not providing professional advice**. It surfaces approved expert knowledge with attribution.
---

## The 8 Core Capabilities

Your prototype must demonstrate these capabilities end-to-end:

| # | Capability | Description |
|---|-----------|-------------|
| 1 | **SME Onboarding** | A new SME can be onboarded with a persistent profile (name, expertise areas, contact info). |
| 2 | **Expert Interview** | The system can interview an SME to capture topic-specific expertise through structured conversation. |
| 3 | **Material Ingestion** | The system accepts supporting materials — text documents, PDFs, and optionally links to relevant sources. |
| 4 | **Knowledge Synthesis** | The system synthesizes captured knowledge (from interviews + materials) into a draft entry for review. |
| 5 | **SME Review & Approval** | The SME can review, edit, and approve synthesized content. An admin validation step is required before knowledge becomes active in the knowledge base. |
| 6 | **Knowledge-Grounded Q&A** | A separate user can ask a question and receive an answer grounded in the approved knowledge base. |
| 7 | **Clarifying Follow-ups** | If a question is ambiguous, the agent asks a clarifying follow-up before answering. |
| 8 | **Routing & Escalation** | If the answer is not in the knowledge base, the system routes the user to the appropriate specialist(s). When multiple SMEs are relevant, the system surfaces all likely candidates. When no clear SME match exists, it escalates to an administrator. |

All 8 capabilities must be attempted. 

### Design Considerations

Beyond the 8 core capabilities, the sponsor highlighted these additional concepts that should inform your design:

- **Review dates / maintenance cycle:** Approved knowledge entries should support a review date or lightweight maintenance cycle so content can be revisited and updated over time. Implementation approach (DB-backed scheduling, manual review flags, cron triggers, etc.) is at the team's discretion.
- **Controlled source exposure:** Raw SME interview transcripts should not be directly exposed to end users in the Q&A experience. The system should distinguish between source materials that may be cited to users (e.g., approved handbooks or documents) and materials that remain internal to the knowledge workflow (e.g., raw interview content).

---

## What Success Looks Like

At the end of this hackathon, T-Mobile leadership should be able to see a live demo that makes it **believable** that:

1. An AI agent can learn from SMEs over time
2. It can answer questions directly from approved, attributed knowledge
3. It safely redirects users to the right human expert when needed
4. The human-in-the-loop approval step prevents unapproved or fabricated knowledge from reaching end users

A strong outcome also shows intelligent handling of overlapping SME areas through clarification and routing — though that is a bonus, not a strict requirement.

---

## Timeline, Milestones & Budget Gates

Each team receives an **$80 budget** for API costs, released in stages. You must **pass each checkpoint** to unlock the next budget tranche. See Canvas for check-in dates and evaluation dates.


**Budget rules:**
- Teams that fail a gate will disqualify to continue
- Unspent budget from earlier stages carries forward
- You manage your own spending within your unlocked total
- Budget is for LLM API costs

---

## Team Structure

Teams of 4 students. You organize yourselves. 
---

## Deliverables

Each team submits:

1. **Working prototype** — deployed to a public URL
2. **Benchmark API** — a standardized REST API conforming to `benchmark/api-specification.md` (see below)
3. **`ARCHITECTURE.md`** — system design, data model (ER diagram), tech stack justification, agentic engineering approach
4. **Demo script** — step-by-step walkthrough showing all capabilities in sequence
5. **Production recommendations** (1-2 pages) — what a real T-Mobile deployment would need: security, scale, multi-tenancy, data sensitivity, audit trails, cost estimation, monitoring
6. **GitHub repository** — documented, with README containing setup instructions, deployed URL, and benchmark API key
7. **Effort visualization** — a KanBan board, hours-spent log, or equivalent showing the development effort that went into the solution

---

## Tech Stack

**Your choice.** There is no prescribed tech stack. You must justify your selection in `ARCHITECTURE.md`. If you are interested in using the same tech stack as T-Mobile, please reach out to your industry mentor.

You are responsible for your own infrastructure and API costs within the $80 budget.

---

## Benchmark API Contract

All teams must implement a **standardized REST API** that the evaluator calls to run benchmark tests programmatically. This ensures fair, automated, apples-to-apples evaluation across all 15+ teams.

Your frontend/UI is completely separate — build whatever you want for the demo. The API is only for benchmark evaluation.

The specification defines endpoints for each of the 8 capabilities:

| Endpoint | Capability |
|----------|-----------|
| `GET /health` | Health check |
| `POST /smes`, `GET /smes`, `GET /smes/{id}` | 1. SME Onboarding |
| `POST /smes/{id}/interviews`, `POST /interviews/{id}/turns` | 2. Expert Interview |
| `POST /smes/{id}/materials` | 3. Material Upload |
| `POST /smes/{id}/knowledge/synthesize` | 4. Knowledge Synthesis |
| `PUT /knowledge/{id}`, `POST /knowledge/{id}/approve`, `POST /knowledge/{id}/admin-approve`, `POST /knowledge/{id}/reject` | 5. SME Review & Admin Approval |
| `POST /query` | 6. Q&A, 7. Clarification, 8. Routing |
| `POST /system/purge`, `POST /system/reset` | Benchmark state management |

See **`benchmark/api-specification.md`** for the full contract with request/response schemas.

### Token Usage Reporting

**Cost efficiency matters.** Every API response that involves an LLM call must include a `usage` object reporting token counts (`prompt_tokens`, `completion_tokens`, `total_tokens`, `model`). Since the benchmark sends identical inputs to every team, your total token consumption is directly comparable across teams.

Teams that achieve the same quality with fewer tokens — through better prompt engineering, smarter retrieval, model routing (e.g., Haiku for simple tasks, Sonnet for complex ones), or reducing unnecessary LLM calls — will score higher on the **token efficiency** metric.

---

## Benchmark

Your solution will be evaluated against a **formal benchmark** at the Week 9 initial evaluation. The benchmark has a specific protocol designed to test whether your system **actually learns from SME inputs**.


**Key metrics:**
- **Closed-Book Failure Rate** — does your system refuse to answer before data is loaded? (10%)
- **Functional Capability Pass Rate** — do the 8 capabilities work? (25%)
- **Context Answer Ratio** — do answers contain the specific facts from the provided SME materials? (20%)
- **Routing Precision** — are out-of-scope questions routed correctly? (15%)
- **Interview Quality** — are the agent's follow-up questions relevant and useful for knowledge capture? (5%)
- **Synthesis Quality** — is the synthesized knowledge coherent, accurate, and well-organized? (5%)
- **Response Latency** — how fast does your system respond? (5%)
- **Token Efficiency** — how many tokens did your system consume? (5%)
- **Persistence** — does knowledge survive a session reset? (5%)
- **Guardrail Effectiveness** — disclaimers, advice refusal, parametric leakage resistance (5%)

**The benchmark tests MVP functionality only.** UX, architecture, and demo quality are evaluated separately.

---

## Evaluation & Qualification

This is a **two-stage competitive evaluation**:

**Stage 1 — Initial Evaluation (Week 9):** All qualifying teams present a lightning demo and are scored by judges. The benchmark is run against each team's deployed prototype. Top-performing teams are selected to advance.

**Stage 2 — T-Mobile Leadership Demo (Finals Week):** Only qualifying teams present to T-Mobile leadership. 


---

## Rules

- This is a **bonus assignment** — participation is voluntary but strongly encouraged
- Teams that do not participate or do not qualify at initial evaluation receive course credit based on other coursework
- All 8 capabilities must be attempted; partial implementations are scored proportionally
- Your system must include appropriate disclaimers — it surfaces expert knowledge, not professional advice
