from datetime import datetime, timezone
from fastapi import FastAPI
from app.routers import smes, interviews, materials, knowledge, query, system

app = FastAPI(title="Thoth Benchmark API", version="1.0.0")

PREFIX = "/api/v1"

app.include_router(smes.router, prefix=PREFIX)
app.include_router(interviews.router, prefix=PREFIX)
app.include_router(materials.router, prefix=PREFIX)
app.include_router(knowledge.router, prefix=PREFIX)
app.include_router(query.router, prefix=PREFIX)
app.include_router(system.router, prefix=PREFIX)


@app.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}
