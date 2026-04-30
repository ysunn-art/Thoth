# Project Context for Claude Code

## What we're building

A FastAPI backend implementing a Benchmark API for an SME (Subject Matter Expert) knowledge management system. The evaluator will hit this API programmatically to test an end-to-end pipeline: create SME profiles → run interviews → upload materials → synthesize knowledge entries → approve them → query the knowledge base.

Base URL: `https://<your-deployment>/api/v1`
Auth: `Authorization: Bearer <BENCHMARK_API_KEY>` on every request.

---

## Stack

- **Web framework**: FastAPI
- **ORM**: SQLAlchemy (async) + Alembic for migrations
- **SQL DB**: PostgreSQL with pgvector extension
- **Vector search**: pgvector (no separate vector DB service)
- **LLM**: OpenRouter via `openai` Python SDK — `anthropic/claude-haiku-4.5` (fast: interviews, routing) + `anthropic/claude-sonnet-4.5` (smart: synthesis, Q&A)
- **Embeddings**: Local `sentence-transformers` (`all-MiniLM-L6-v2`, 384-dim) — free, no API key needed
- **File parsing**: pypdf (PDFs), plain read (text/markdown)
- **Settings**: pydantic-settings (.env)
- **Server**: Uvicorn

---

## Folder structure

```
app/
├── main.py
├── config.py
├── dependencies.py
├── routers/
│   ├── smes.py
│   ├── interviews.py
│   ├── materials.py
│   ├── knowledge.py
│   ├── query.py
│   └── system.py
├── services/
│   ├── sme_service.py
│   ├── interview_service.py
│   ├── material_service.py
│   ├── knowledge_service.py
│   ├── query_service.py
│   ├── session_store.py
│   └── llm_client.py
├── repositories/
│   ├── sme_repo.py
│   ├── interview_repo.py
│   ├── material_repo.py
│   ├── knowledge_repo.py
│   └── vector_repo.py
├── models/
│   ├── db/
│   │   ├── base.py
│   │   ├── sme.py
│   │   ├── interview.py
│   │   ├── turn.py
│   │   ├── material.py
│   │   └── knowledge_entry.py
│   └── schemas/
│       ├── sme.py
│       ├── interview.py
│       ├── material.py
│       ├── knowledge.py
│       └── query.py
├── core/
│   ├── auth.py
│   ├── errors.py
│   └── ids.py
└── db/
    ├── session.py
    └── migrations/
        └── versions/
storage/
    └── file_store.py
tests/
alembic.ini
.env
requirements.txt
README.md
```

---

## Database schema

### SQL tables (PostgreSQL)

**smes**
```
id          TEXT PRIMARY KEY          -- e.g. "sme_abc123"
name        TEXT NOT NULL
specialization TEXT NOT NULL
sub_areas   TEXT[]  NOT NULL          -- postgres array
contact_email TEXT NOT NULL
created_at  TIMESTAMPTZ DEFAULT now()
```

**interviews**
```
id          TEXT PRIMARY KEY          -- e.g. "int_xyz789"
sme_id      TEXT REFERENCES smes(id)
topic       TEXT NOT NULL
status      TEXT NOT NULL DEFAULT 'in_progress'  -- 'in_progress' | 'completed'
created_at  TIMESTAMPTZ DEFAULT now()
```

**turns**
```
id          TEXT PRIMARY KEY
interview_id TEXT REFERENCES interviews(id)
turn_number  INTEGER NOT NULL
sme_response TEXT NOT NULL
agent_follow_up TEXT                  -- NULL means interview is complete
timestamp   TIMESTAMPTZ DEFAULT now()
```

**materials**
```
id          TEXT PRIMARY KEY          -- e.g. "mat_..."
sme_id      TEXT REFERENCES smes(id)
title       TEXT NOT NULL
description TEXT
file_type   TEXT NOT NULL             -- MIME type
file_path   TEXT NOT NULL             -- local path or S3 key
status      TEXT NOT NULL DEFAULT 'processing'  -- 'processing' | 'processed' | 'failed'
created_at  TIMESTAMPTZ DEFAULT now()
```

**knowledge_entries**
```
id          TEXT PRIMARY KEY          -- e.g. "ke_..."
sme_id      TEXT REFERENCES smes(id)
topic       TEXT NOT NULL
status      TEXT NOT NULL DEFAULT 'draft'
            -- 'draft' | 'sme_approved' | 'approved' | 'rejected'
content     TEXT NOT NULL
source_interviews TEXT[]              -- array of interview IDs
source_materials  TEXT[]              -- array of material IDs
rejection_reason  TEXT
created_at  TIMESTAMPTZ DEFAULT now()
updated_at  TIMESTAMPTZ DEFAULT now()
approved_at TIMESTAMPTZ
admin_approved_at TIMESTAMPTZ
rejected_at TIMESTAMPTZ
```

### pgvector table

**knowledge_chunks**
```
id          TEXT PRIMARY KEY
entry_id    TEXT REFERENCES knowledge_entries(id) ON DELETE CASCADE
chunk_index INTEGER NOT NULL
chunk_text  TEXT NOT NULL
embedding   vector(384)               -- all-MiniLM-L6-v2 dimension
created_at  TIMESTAMPTZ DEFAULT now()
```

Index: `CREATE INDEX ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)`

Only chunks whose parent `knowledge_entries.status = 'approved'` are queried at search time. Filter in the query: join knowledge_entries and check status, or maintain a partial index.

---

## All endpoints

### Health
- `GET /health` → `{ status: "healthy", timestamp: ISO8601 }`

### SMEs
- `POST /smes` → 201, creates SME, no LLM
- `GET /smes` → 200, list all
- `GET /smes/{sme_id}` → 200 or 404

### Interviews
- `GET /smes/{sme_id}/interviews` → list with `interview_id, topic, status, created_at`
- `POST /smes/{sme_id}/interviews` → 201, `status: "in_progress"`, **may call LLM** (usage required if so)
- `POST /interviews/{interview_id}/turns` → 200, **always calls LLM**, usage required
  - Receives `sme_response`, generates `agent_follow_up` (null if done)
- `GET /interviews/{interview_id}` → full transcript with all turns

### Materials
- `POST /smes/{sme_id}/materials` → multipart/form-data, file + title + description
  - Accepted: `application/pdf`, `text/plain`, `text/markdown`
  - Max size: 10 MB — reject others with 400
  - Process synchronously: parse → chunk → embed → upsert pgvector → return `status: "processed"`
  - **May call LLM** for embedding (usage if so)
- `GET /smes/{sme_id}/materials` → list

### Knowledge
- `POST /smes/{sme_id}/knowledge/synthesize` → 201, **always calls LLM**, usage required
  - Body: `{ interview_ids: string[], material_ids: string[], topic: string }`
  - Pulls transcript text + material text, sends to Claude, stores result as `status: "draft"`
- `GET /knowledge` → list all (optional `?status=approved` filter)
- `GET /knowledge/{entry_id}` → 200 or 404
- `PUT /knowledge/{entry_id}` → update content, return updated entry
- `POST /knowledge/{entry_id}/approve` → draft → sme_approved (409 if not draft)
- `POST /knowledge/{entry_id}/admin-approve` → sme_approved → approved (409 if not sme_approved); **this triggers embedding**: chunk the content and upsert to pgvector
- `POST /knowledge/{entry_id}/reject` → any non-rejected → rejected (body: optional `reason`); (409 if already rejected)

### Query
- `POST /query` → **always calls LLM**, usage required
  - Body: `{ question: string, session_id: string }`
  - session_id maintains multi-turn context (stored in SessionStore)
  - Returns: `answer, grounded, sources, disclaimer, session_id, response_type, routed_to, timestamp, usage`
  - `response_type` is one of: `"answer"` | `"clarification"` | `"routing"`
  - When `grounded: true`, sources = `[{ entry_id, sme_name, topic }]`
  - When `response_type: "routing"`, routed_to = `[{ type, sme_name, specialization, reason }]`

### System
- `POST /system/purge` → delete ALL data (all tables + all vectors + all files + clear sessions)
- `POST /system/reset` → clear session context only, preserve everything else

---

## Knowledge entry state machine

```
draft ──/approve──► sme_approved ──/admin-approve──► approved
  │                     │                               │
  └──/reject──► rejected ◄──/reject──────────────────── ┘
```

Invalid transitions → **409 Conflict**:
- `/approve` on anything that isn't `draft`
- `/admin-approve` on anything that isn't `sme_approved`
- `/reject` on something already `rejected`

Enforce this in `core/errors.py` with a guard function called before every transition.

---

## LLM integration (`services/llm_client.py`)

All Anthropic API calls go through `LLMClient`. It must:
1. Wrap the Anthropic Python SDK
2. Accumulate token counts per request (some endpoints make multiple LLM calls — sum them all)
3. Return a `UsageInfo` dataclass: `{ prompt_tokens, completion_tokens, total_tokens, model }`

Model to use: `claude-sonnet-4-20250514`

### Interview turn prompt pattern
```
System: You are conducting a knowledge elicitation interview with an SME.
        Topic: {topic}. Ask focused follow-up questions to extract detailed knowledge.
        When you have enough information, respond with exactly: [INTERVIEW_COMPLETE]

User: [prior turns as conversation history]
      SME said: {sme_response}
```
If the response is `[INTERVIEW_COMPLETE]`, set `agent_follow_up = null` and mark interview `completed`.

### Synthesis prompt pattern
```
System: You are synthesizing expert knowledge into a clear, structured knowledge base entry.

User: Synthesize the following interview transcripts and reference materials into a
      comprehensive knowledge entry on: {topic}

      INTERVIEWS:
      {formatted transcripts}

      MATERIALS:
      {material text chunks}
```

### Query prompt pattern
```
System: You are a knowledge base assistant. Answer questions using ONLY the provided
        knowledge entries. If the question is too vague, ask for clarification.
        If no relevant knowledge exists, route to the appropriate SME.
        Respond in JSON: { response_type, answer, grounded, sources, routed_to, disclaimer }

User: Session history: {prior turns for this session_id}
      Question: {question}
      
      Relevant knowledge:
      {top-k semantic search results from pgvector, approved entries only}
      
      Available SMEs:
      {list of all SMEs with specializations and sub_areas}
```

---

## Vector search (`repositories/vector_repo.py`)

Use pgvector with SQLAlchemy. Steps:
1. Enable extension: `CREATE EXTENSION IF NOT EXISTS vector`
2. Use `pgvector.sqlalchemy.Vector` column type
3. At query time: embed the question → cosine similarity search → filter to `approved` entries only → return top-k chunks with their `entry_id`
4. At admin-approve time: chunk the knowledge entry content (e.g. 512 tokens, 50 token overlap), embed each chunk, upsert to `knowledge_chunks`
5. At purge time: `DELETE FROM knowledge_chunks`

Embedding model: local `sentence-transformers` (`all-MiniLM-L6-v2`, 384 dims). Run via `asyncio.to_thread` to avoid blocking the event loop. No API key needed.

---

## Session store (`services/session_store.py`)

Simple in-memory dict (no Redis needed for benchmark):
```python
_sessions: dict[str, list[dict]] = {}
# Each entry: { role: "user"|"assistant", content: str }
```

- `get_history(session_id)` → list of prior messages
- `append(session_id, role, content)` → add a turn
- `clear_all()` → called by `POST /system/reset`

Session context is used in the query prompt to support multi-turn clarification flows.

---

## File storage (`storage/file_store.py`)

For the benchmark, local disk is fine:
- Save to `./uploads/{sme_id}/{material_id}/{filename}`
- Return the path, store it in `materials.file_path`
- Read it back in `MaterialService` for parsing

At purge, delete the uploads directory.

---

## ID generation (`core/ids.py`)

```python
import uuid

def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"

# Usage:
# new_id("sme")  → "sme_a3f2c1b0"
# new_id("int")  → "int_9d8e7f6a"
# new_id("mat")  → "mat_..."
# new_id("ke")   → "ke_..."
# new_id("turn") → "turn_..."
```

---

## Auth (`core/auth.py`)

```python
from fastapi import Security, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

BENCHMARK_API_KEY = settings.benchmark_api_key  # from .env

async def verify_api_key(credentials: HTTPAuthorizationCredentials = Security(HTTPBearer())):
    if credentials.credentials != BENCHMARK_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
```

Apply as a dependency on all routers except `GET /health`.

---

## Usage reporting

Every endpoint that calls the LLM must include a top-level `usage` field:
```json
{
  "prompt_tokens": 450,
  "completion_tokens": 32,
  "total_tokens": 482,
  "model": "claude-sonnet-4-20250514"
}
```

If a request triggers multiple LLM calls (e.g. embed + generate), **sum all token counts**.
Endpoints with no LLM call → `usage: null` (or omit).

Required on: `POST /interviews/{id}/turns`, `POST /smes/{id}/knowledge/synthesize`, `POST /query`
Optional (if LLM used): `POST /smes/{id}/interviews`, `POST /smes/{id}/materials`

---

## Error responses

All errors:
```json
{ "error": "Human-readable message", "code": "MACHINE_CODE" }
```

Status codes:
- 400 — bad request, missing fields, unsupported file type, file too large
- 401 — invalid or missing API key
- 404 — resource not found
- 409 — invalid state transition
- 500 — internal server error

---

## Key implementation notes

1. **Synchronous material processing** — process files inline in the upload request. Parse → chunk → embed → upsert pgvector → return `"processed"`. No background tasks needed for the benchmark.

2. **Embedding on admin-approve** — when `POST /knowledge/{id}/admin-approve` is called, chunk the `content` field and upsert embeddings to `knowledge_chunks`. This is the trigger for the entry becoming searchable.

3. **Query flow**:
   a. Embed the question
   b. Cosine similarity search in `knowledge_chunks` (approved entries only, top 5)
   c. Build prompt with results + session history + all SME profiles
   d. Call Claude, parse structured JSON response
   e. Store question+answer in session store
   f. Return response with `response_type` field

4. **`POST /system/purge`** must delete: all rows in all tables (in FK order) + all pgvector chunks + all uploaded files + clear session store.

5. **`POST /system/reset`** calls `session_store.clear_all()` only. All DB data preserved.

6. **Field names must match the spec exactly** — snake_case as specified. The benchmark evaluator checks field names.

7. **Timestamps** must be ISO 8601 with timezone: `datetime.now(timezone.utc).isoformat()`

---

## .env template

```
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/benchmark_db
BENCHMARK_API_KEY=your-secret-key-here
OPENROUTER_API_KEY=sk-or-v1-...
UPLOAD_DIR=./uploads
EMBEDDING_DIM=384
```

---

## requirements.txt (starting point)

```
fastapi
uvicorn[standard]
sqlalchemy[asyncio]
asyncpg
alembic
pgvector
openai
sentence-transformers
pypdf
python-multipart
pydantic-settings
numpy
```

---

## Progress

### 2026-04-28 — PQ 向量索引集成

在 bonus-thoth-farmers 中集成了 Product Quantization 近似搜索层，作为 pgvector 精确搜索的加速 sidecar。

**新增文件：**
- `pq/` — 从 pqvector 项目迁移的完整 PQ 模块（kmeans / codebook / encoder / index）
- `app/services/pq_index_service.py` — 管理 PQ 索引生命周期的单例服务

**修改文件：**
- `app/repositories/vector_repo.py` — 集成 PQ 到 upsert / search / delete
- `requirements.txt` — 新增 numpy

**搜索策略（双轨制）：**
1. **PQ 可用时**：`search()` 用 PQ 近似排序返回候选 chunk_id，再从数据库加载完整记录（过滤 approved），按 PQ 排名返回。
2. **PQ 未就绪时**（向量数 < 16 时仍在训练前）：回退到 pgvector 精确余弦相似度搜索，行为与原来完全一致。

**PQ 参数：** `dim=384, M=8, K=16`（benchmark 规模下 16 个向量即可触发训练）

**持久化：** 每次 `upsert_chunks` 后自动将索引写入 `pq_index.pkl`，服务重启后自动加载。
