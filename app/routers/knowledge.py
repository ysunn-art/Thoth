from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.core.auth import verify_api_key
from app.models.schemas.knowledge import (
    SynthesizeRequest, KnowledgeUpdate, RejectRequest,
    KnowledgeEntryResponse, KnowledgeListResponse, Sources,
    ApproveResponse, AdminApproveResponse, RejectResponse, UsageInfo,
)
from app.services.knowledge_service import KnowledgeService
from app.repositories.knowledge_repo import KnowledgeRepository
from app.repositories.interview_repo import InterviewRepository
from app.repositories.material_repo import MaterialRepository
from app.repositories.sme_repo import SMERepository
from app.repositories.vector_repo import VectorRepository

router = APIRouter(dependencies=[Depends(verify_api_key)])


def _make_service(db: AsyncSession) -> KnowledgeService:
    return KnowledgeService(
        KnowledgeRepository(db),
        InterviewRepository(db),
        MaterialRepository(db),
        SMERepository(db),
        VectorRepository(db),
    )


def _to_response(entry, usage=None) -> KnowledgeEntryResponse:
    return KnowledgeEntryResponse(
        entry_id=entry.id,
        sme_id=entry.sme_id,
        topic=entry.topic,
        status=entry.status,
        content=entry.content,
        sources=Sources(
            interviews=entry.source_interviews or [],
            materials=entry.source_materials or [],
        ),
        created_at=entry.created_at.isoformat(),
        updated_at=entry.updated_at.isoformat(),
        usage=UsageInfo(
            prompt_tokens=usage.prompt_tokens,
            completion_tokens=usage.completion_tokens,
            total_tokens=usage.total_tokens,
            model=usage.model,
        ) if usage else None,
    )


@router.post("/smes/{sme_id}/knowledge/synthesize", status_code=201, response_model=KnowledgeEntryResponse)
async def synthesize(sme_id: str, data: SynthesizeRequest, db: AsyncSession = Depends(get_db)):
    entry, usage = await _make_service(db).synthesize(sme_id, data)
    return _to_response(entry, usage)


@router.get("/knowledge", response_model=KnowledgeListResponse)
async def list_entries(status: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    entries = await _make_service(db).list_entries(status)
    return KnowledgeListResponse(entries=[_to_response(e) for e in entries])


@router.get("/knowledge/{entry_id}", response_model=KnowledgeEntryResponse)
async def get_entry(entry_id: str, db: AsyncSession = Depends(get_db)):
    entry = await _make_service(db).get_entry(entry_id)
    return _to_response(entry)


@router.put("/knowledge/{entry_id}", response_model=KnowledgeEntryResponse)
async def update_entry(entry_id: str, data: KnowledgeUpdate, db: AsyncSession = Depends(get_db)):
    entry = await _make_service(db).update_entry(entry_id, data)
    return _to_response(entry)


@router.post("/knowledge/{entry_id}/approve", response_model=ApproveResponse)
async def approve(entry_id: str, db: AsyncSession = Depends(get_db)):
    entry = await _make_service(db).approve(entry_id)
    return ApproveResponse(entry_id=entry.id, status=entry.status, approved_at=entry.approved_at.isoformat())


@router.post("/knowledge/{entry_id}/admin-approve", response_model=AdminApproveResponse)
async def admin_approve(entry_id: str, db: AsyncSession = Depends(get_db)):
    entry = await _make_service(db).admin_approve(entry_id)
    return AdminApproveResponse(entry_id=entry.id, status=entry.status, admin_approved_at=entry.admin_approved_at.isoformat())


@router.post("/knowledge/{entry_id}/reject", response_model=RejectResponse)
async def reject(entry_id: str, data: RejectRequest = RejectRequest(), db: AsyncSession = Depends(get_db)):
    entry = await _make_service(db).reject(entry_id, data)
    return RejectResponse(entry_id=entry.id, status=entry.status, rejected_at=entry.rejected_at.isoformat())
