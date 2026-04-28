from fastapi import Security, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import settings

_security = HTTPBearer()


async def verify_api_key(credentials: HTTPAuthorizationCredentials = Security(_security)):
    if credentials.credentials != settings.benchmark_api_key:
        raise HTTPException(status_code=401, detail={"error": "Invalid API key", "code": "UNAUTHORIZED"})
