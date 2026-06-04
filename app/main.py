import logging
import time
import uuid
from datetime import datetime, timezone
from fastapi import FastAPI, Request
from app.routers import smes, interviews, materials, knowledge, query, system, auth

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Thoth Benchmark API", version="1.0.0")

PREFIX = "/api/v1"


@app.middleware("http")
async def request_logging(request: Request, call_next):
    request_id = request.headers.get("x-request-id", uuid.uuid4().hex[:8])
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000
    logger.info(
        "request_id=%s %s %s -> %d (%.1fms)",
        request_id, request.method, request.url.path,
        response.status_code, duration_ms,
    )
    response.headers["x-request-id"] = request_id
    return response


app.include_router(auth.router, prefix=PREFIX)
app.include_router(smes.router, prefix=PREFIX)
app.include_router(interviews.router, prefix=PREFIX)
app.include_router(materials.router, prefix=PREFIX)
app.include_router(knowledge.router, prefix=PREFIX)
app.include_router(query.router, prefix=PREFIX)
app.include_router(system.router, prefix=PREFIX)


@app.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}
