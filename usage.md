# Usage Guide

## Prerequisites

- Python 3.11+
- Docker (for PostgreSQL + pgvector)
- OpenRouter API key (for LLM via Claude Haiku/Sonnet)
- No embedding API key needed — embeddings run locally via `sentence-transformers`

---

## Setup

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure environment

Create a `.env` file in the project root:

```
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/benchmark_db
BENCHMARK_API_KEY=<your-secret-key>
OPENROUTER_API_KEY=sk-or-v1-...
UPLOAD_DIR=./uploads
EMBEDDING_DIM=384
```

### 3. Start PostgreSQL with pgvector via Docker

```bash
docker run -d \
  --name thoth-db \
  -e POSTGRES_USER=user \
  -e POSTGRES_PASSWORD=pass \
  -e POSTGRES_DB=benchmark_db \
  -p 5432:5432 \
  ankane/pgvector
```

If the container already exists but is stopped:

```bash
docker start thoth-db
```

### 4. Run database migrations

```bash
alembic upgrade head
```

This creates all 6 tables (smes, interviews, turns, materials, knowledge_entries, knowledge_chunks) and the HNSW vector index on `knowledge_chunks.embedding`.

### 5. Start the server

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Verify with:

```bash
curl http://localhost:8000/health
# → {"status":"healthy","timestamp":"..."}
```

Interactive docs: `http://localhost:8000/docs`

---

## Testing with Postman

Import `thoth-postman-collection.json` (included in this repo) into Postman:

**File → Import → select `thoth-postman-collection.json`**

The collection has:
- `base_url` and `api_key` pre-configured as collection variables
- Bearer auth applied to all requests automatically
- Auto-capture scripts that save `sme_id`, `interview_id`, `entry_id` into variables after each create call

**Run in this order:**

```
Health Check
→ Create SME
→ Create Interview
→ Submit Turn(s)
→ Upload Material (optional)
→ Synthesize Knowledge Entry
→ Approve (draft → sme_approved)
→ Admin Approve (sme_approved → approved, triggers embedding)
→ Query
→ System Purge / Reset
```

---

## Base URL

All endpoints are under `/api/v1`:

```
http://localhost:8000/api/v1
```

Health check (no auth required):

```
http://localhost:8000/health
```

---

## Authentication

All `/api/v1/*` endpoints require:

```
Authorization: Bearer <BENCHMARK_API_KEY>
```

---

## Quick test with curl

```bash
export BASE="http://localhost:8000/api/v1"
export KEY="<your-benchmark-api-key>"

# Health check (no auth)
curl http://localhost:8000/health

# Create an SME
curl -s -X POST $BASE/smes \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Dr. Jane Smith","specialization":"Network Security","sub_areas":["firewalls","zero trust","VPN"],"contact_email":"jane@example.com"}'

# Start an interview (replace <sme_id>)
curl -s -X POST $BASE/smes/<sme_id>/interviews \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"topic":"Zero Trust Architecture"}'

# Submit a turn (replace <interview_id>)
curl -s -X POST $BASE/interviews/<interview_id>/turns \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"sme_response":"Zero trust means never trust, always verify every user and device..."}'

# Upload a material
curl -s -X POST $BASE/smes/<sme_id>/materials \
  -H "Authorization: Bearer $KEY" \
  -F "file=@/path/to/doc.pdf" \
  -F "title=Zero Trust Whitepaper" \
  -F "description=Internal ZT implementation guide"

# Synthesize knowledge entry
curl -s -X POST $BASE/smes/<sme_id>/knowledge/synthesize \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"interview_ids":["<interview_id>"],"material_ids":[],"topic":"Zero Trust Architecture"}'

# Approve workflow (replace <entry_id>)
curl -s -X POST $BASE/knowledge/<entry_id>/approve -H "Authorization: Bearer $KEY"
curl -s -X POST $BASE/knowledge/<entry_id>/admin-approve -H "Authorization: Bearer $KEY"

# Query the knowledge base
curl -s -X POST $BASE/query \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"question":"What is zero trust architecture?","session_id":"session-1"}'

# System operations
curl -s -X POST $BASE/system/reset -H "Authorization: Bearer $KEY"   # clear sessions only
curl -s -X POST $BASE/system/purge -H "Authorization: Bearer $KEY"   # wipe everything
```

---

## Stack

| Component | Technology |
|---|---|
| Web framework | FastAPI + Uvicorn |
| Database | PostgreSQL (Docker: `ankane/pgvector`) |
| Vector search | pgvector with HNSW index, 384-dim |
| Vector index (approx) | In-memory PQ index (`pq/` module) |
| LLM — fast | OpenRouter → `anthropic/claude-haiku-4.5` |
| LLM — smart | OpenRouter → `anthropic/claude-sonnet-4.5` |
| Embeddings | Local `sentence-transformers` `all-MiniLM-L6-v2` (384-dim, free) |
| ORM | SQLAlchemy async + Alembic |
| File parsing | pypdf (PDF), plain read (txt/md) |

---

## Folder structure

```
app/
├── main.py               # FastAPI app, router registration
├── config.py             # Settings from .env
├── dependencies.py       # Shared FastAPI dependencies
├── routers/              # HTTP route handlers
├── services/             # Business logic + LLM client
├── repositories/         # Database access layer
├── models/
│   ├── db/               # SQLAlchemy ORM models
│   └── schemas/          # Pydantic request/response schemas
├── core/
│   ├── auth.py           # API key verification
│   ├── errors.py         # HTTP error helpers + state guards
│   └── ids.py            # ID generation (prefix_hex8)
└── db/
    ├── session.py        # Async SQLAlchemy engine + session
    └── migrations/       # Alembic migration files
pq/                       # Product Quantization vector index module
storage/
└── file_store.py         # Local file save/read/purge
thoth-postman-collection.json  # Postman collection for all endpoints
```
