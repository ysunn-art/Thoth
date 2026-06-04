from fastapi import APIRouter, Depends
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.core.auth import require_admin
from app.models.db.user import User
from app.repositories.sme_repo import SMERepository
from app.repositories.interview_repo import InterviewRepository
from app.repositories.material_repo import MaterialRepository
from app.repositories.knowledge_repo import KnowledgeRepository
from app.repositories.vector_repo import VectorRepository
from app.repositories.session_repo import SessionRepository
from app.services.session_store import SessionStore
from storage.file_store import purge_uploads

router = APIRouter(dependencies=[Depends(require_admin)])


@router.post("/system/purge")
async def purge(db: AsyncSession = Depends(get_db)):
    await VectorRepository(db).delete_all()
    await KnowledgeRepository(db).delete_all()
    await MaterialRepository(db).delete_all()
    await InterviewRepository(db).delete_all()
    await SessionRepository(db).delete_all()
    await db.execute(delete(User))
    await db.commit()
    await SMERepository(db).delete_all()
    purge_uploads()
    return {"status": "purged", "message": "All data has been deleted"}


@router.post("/system/reset")
async def reset(db: AsyncSession = Depends(get_db)):
    await SessionRepository(db).delete_all()
    return {"status": "reset", "message": "Session state cleared"}
