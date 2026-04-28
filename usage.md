# Usage Guide

## Prerequisites

- Python 3.11+
- PostgreSQL 15+ with the `pgvector` extension
- Anthropic API key (for Claude LLM)
- OpenAI API key (for text embeddings via `text-embedding-3-small`)

## Setup

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure environment

Copy the example and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:

```
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/benchmark_db
BENCHMARK_API_KEY=your-secret-key-here
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
UPLOAD_DIR=./uploads
EMBEDDING_DIM=1536
```

### 3. Set up PostgreSQL with pgvector

```bash
# Create the database
createdb benchmark_db

# Enable pgvector (requires pgvector installed on your Postgres instance)
psql benchmark_db -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### 4. Run database migrations

```bash
alembic upgrade head
```

If this is your first run and there are no migration files yet, generate one:

```bash
alembic revision --autogenerate -m "initial schema"
alembic upgrade head
```

### 5. Start the server

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The API is now available at `http://localhost:8000`.

Interactive docs: `http://localhost:8000/docs`

---

## Base URL

All endpoints are under `/api/v1`:

```
http://localhost:8000/api/v1
```

Health check (no auth):

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
export KEY="your-secret-key-here"

# Health check
curl http://localhost:8000/health

# Create an SME
curl -X POST $BASE/smes \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Dr. Smith","specialization":"AI Safety","sub_areas":["alignment","robustness"],"contact_email":"smith@example.com"}'

# Start an interview
curl -X POST $BASE/smes/<sme_id>/interviews \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"topic":"AI alignment techniques"}'

# Submit a turn
curl -X POST $BASE/interviews/<interview_id>/turns \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"sme_response":"RLHF is the primary technique we use..."}'

# Upload a material
curl -X POST $BASE/smes/<sme_id>/materials \
  -H "Authorization: Bearer $KEY" \
  -F "file=@/path/to/doc.pdf" \
  -F "title=Safety Guidelines" \
  -F "description=Internal safety document"

# Synthesize knowledge
curl -X POST $BASE/smes/<sme_id>/knowledge/synthesize \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"interview_ids":["<interview_id>"],"material_ids":[],"topic":"AI alignment"}'

# Approve → SME approve → Admin approve
curl -X POST $BASE/knowledge/<entry_id>/approve -H "Authorization: Bearer $KEY"
curl -X POST $BASE/knowledge/<entry_id>/admin-approve -H "Authorization: Bearer $KEY"

# Query
curl -X POST $BASE/query \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"question":"What is RLHF?","session_id":"session-1"}'

# Purge all data
curl -X POST $BASE/system/purge -H "Authorization: Bearer $KEY"

# Reset sessions only
curl -X POST $BASE/system/reset -H "Authorization: Bearer $KEY"
```

---

## Folder structure

```
app/
├── main.py               # FastAPI app, router registration
├── config.py             # Settings from .env
├── dependencies.py       # Shared FastAPI dependencies
├── routers/              # HTTP route handlers
├── services/             # Business logic
├── repositories/         # Database access
├── models/
│   ├── db/               # SQLAlchemy ORM models
│   └── schemas/          # Pydantic request/response schemas
├── core/
│   ├── auth.py           # API key verification
│   ├── errors.py         # HTTP error helpers + state guards
│   └── ids.py            # ID generation
└── db/
    ├── session.py        # Async SQLAlchemy engine + session
    └── migrations/       # Alembic migrations
storage/
└── file_store.py         # Local file save/read/purge
```
