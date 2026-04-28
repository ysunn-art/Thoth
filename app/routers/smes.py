from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.core.auth import verify_api_key
from app.models.schemas.sme import SMECreate, SMEResponse, SMEListResponse
from app.services.sme_service import SMEService
from app.repositories.sme_repo import SMERepository

router = APIRouter(dependencies=[Depends(verify_api_key)])


def _to_response(sme) -> SMEResponse:
    return SMEResponse(
        sme_id=sme.id,
        name=sme.name,
        specialization=sme.specialization,
        sub_areas=sme.sub_areas or [],
        contact_email=sme.contact_email,
        created_at=sme.created_at.isoformat(),
    )


@router.post("/smes", status_code=201, response_model=SMEResponse)
async def create_sme(data: SMECreate, db: AsyncSession = Depends(get_db)):
    sme = await SMEService(SMERepository(db)).create_sme(data)
    return _to_response(sme)


@router.get("/smes", response_model=SMEListResponse)
async def list_smes(db: AsyncSession = Depends(get_db)):
    smes = await SMEService(SMERepository(db)).list_smes()
    return SMEListResponse(smes=[_to_response(s) for s in smes])


@router.get("/smes/{sme_id}", response_model=SMEResponse)
async def get_sme(sme_id: str, db: AsyncSession = Depends(get_db)):
    sme = await SMEService(SMERepository(db)).get_sme(sme_id)
    return _to_response(sme)
