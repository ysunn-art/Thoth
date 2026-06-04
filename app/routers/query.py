from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.core.auth import get_current_user
from app.models.schemas.query import QueryRequest, QueryResponse
from app.services.query_service import QueryService
from app.services.session_store import SessionStore
from app.repositories.sme_repo import SMERepository
from app.repositories.knowledge_repo import KnowledgeRepository
from app.repositories.vector_repo import VectorRepository
from app.repositories.session_repo import SessionRepository

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.post("/query", response_model=QueryResponse)
async def query(data: QueryRequest, db: AsyncSession = Depends(get_db)):
    session_store = SessionStore(SessionRepository(db))
    service = QueryService(SMERepository(db), KnowledgeRepository(db), VectorRepository(db), session_store)
    return await service.query(data.question, data.session_id)
