from fastapi import APIRouter, Depends, UploadFile, File, Form
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.core.auth import verify_api_key
from app.models.schemas.material import MaterialResponse, MaterialListResponse
from app.services.material_service import MaterialService
from app.repositories.material_repo import MaterialRepository
from app.repositories.sme_repo import SMERepository
from app.repositories.vector_repo import VectorRepository

router = APIRouter(dependencies=[Depends(verify_api_key)])


def _to_response(material) -> MaterialResponse:
    return MaterialResponse(
        material_id=material.id,
        sme_id=material.sme_id,
        title=material.title,
        file_type=material.file_type,
        status=material.status,
        created_at=material.created_at.isoformat(),
    )


@router.post("/smes/{sme_id}/materials", status_code=201, response_model=MaterialResponse)
async def upload_material(
    sme_id: str,
    file: UploadFile = File(...),
    title: str = Form(...),
    description: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
):
    service = MaterialService(MaterialRepository(db), SMERepository(db), VectorRepository(db))
    material, _ = await service.upload_material(sme_id, file, title, description)
    return _to_response(material)


@router.get("/smes/{sme_id}/materials", response_model=MaterialListResponse)
async def list_materials(sme_id: str, db: AsyncSession = Depends(get_db)):
    service = MaterialService(MaterialRepository(db), SMERepository(db), VectorRepository(db))
    materials = await service.list_materials(sme_id)
    return MaterialListResponse(materials=[_to_response(m) for m in materials])
