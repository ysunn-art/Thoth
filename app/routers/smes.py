import logging
from fastapi import APIRouter, Depends
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.core.auth import get_current_user, require_admin
from app.core.errors import raise_not_found
from app.models.db.user import User
from app.models.schemas.sme import SMECreate, SMEUpdate, SMEResponse, SMEListResponse
from app.services.sme_service import SMEService
from app.repositories.sme_repo import SMERepository
from app.repositories.interview_repo import InterviewRepository
from app.repositories.material_repo import MaterialRepository
from app.repositories.knowledge_repo import KnowledgeRepository
from app.repositories.vector_repo import VectorRepository
from app.repositories.user_repo import UserRepository
from storage.file_store import delete_sme_uploads

logger = logging.getLogger(__name__)

# All endpoints require an authenticated user (JWT or service token).
# POST /smes additionally requires admin via per-route dependency.
router = APIRouter(dependencies=[Depends(get_current_user)])


def _to_response(sme) -> SMEResponse:
    return SMEResponse(
        sme_id=sme.id,
        name=sme.name,
        specialization=sme.specialization,
        sub_areas=sme.sub_areas or [],
        contact_email=sme.contact_email,
        created_at=sme.created_at.isoformat(),
    )


@router.post(
    "/smes",
    status_code=201,
    response_model=SMEResponse,
    dependencies=[Depends(require_admin)],
)
async def create_sme(
    data: SMECreate,
    db: AsyncSession = Depends(get_db),
):
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


@router.put("/smes/{sme_id}", response_model=SMEResponse)
async def update_sme(sme_id: str, data: SMEUpdate, db: AsyncSession = Depends(get_db)):
    sme = await SMEService(SMERepository(db)).update_sme(sme_id, data)
    return _to_response(sme)


@router.post("/smes/{sme_id}/link", dependencies=[Depends(require_admin)])
async def link_user_to_sme(
    sme_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Link the current user to this SME. Sets is_sme=true, sme_id=sme_id.
    Admin-only to prevent random users from claiming anyone's SME."""
    sme_repo = SMERepository(db)
    sme = await sme_repo.get_by_id(sme_id)
    if not sme:
        raise_not_found("SME", sme_id)

    user_repo = UserRepository(db)
    user = await user_repo.get_by_id(current_user.id)
    if not user:
        raise_not_found("User", current_user.id)

    user.is_sme = True
    user.sme_id = sme_id
    await user_repo.update(user)

    return {"status": "linked", "sme_id": sme_id, "user_id": user.id}


@router.delete("/smes/{sme_id}", dependencies=[Depends(require_admin)])
async def delete_sme(sme_id: str, db: AsyncSession = Depends(get_db)):
    """Delete an SME and EVERYTHING tied to it:
      - knowledge entries (chunks cascade in DB, PQ index cleaned per-entry)
      - interviews + their turns
      - materials (DB rows + disk files)
      - upload directory for this SME
    Linked user accounts are demoted (is_sme=false, sme_id=NULL) so they survive
    as regular users — the FK SET NULL would otherwise violate the CHECK
    constraint `is_sme=true OR sme_id IS NULL`.

    Admin-only. Idempotent on a non-existent id (returns 404).
    """
    # 1. Verify SME exists
    sme_repo = SMERepository(db)
    sme = await sme_repo.get_by_id(sme_id)
    if not sme:
        raise_not_found("SME", sme_id)

    # 2. Demote any users linked to this SME so the FK SET NULL doesn't trip the
    #    CHECK constraint when we delete the SME row. Single UPDATE.
    user_demote_result = await db.execute(
        update(User)
        .where(User.sme_id == sme_id)
        .values(is_sme=False, sme_id=None)
    )
    users_demoted = user_demote_result.rowcount or 0
    await db.commit()

    # 3. Pull entry ids first so we can clean the in-memory PQ index per-entry,
    #    then the DB deletes will CASCADE chunks via the FK.
    knowledge_repo = KnowledgeRepository(db)
    vector_repo = VectorRepository(db)
    entry_ids = await knowledge_repo.list_ids_by_sme(sme_id)
    for entry_id in entry_ids:
        await vector_repo.delete_by_entry(entry_id)
    entries_deleted = await knowledge_repo.delete_by_sme(sme_id)

    # 4. Interviews (+ their turns inside delete_by_sme)
    interviews_deleted = await InterviewRepository(db).delete_by_sme(sme_id)

    # 5. Materials (DB rows) + upload directory (disk)
    materials_deleted = await MaterialRepository(db).delete_by_sme(sme_id)
    dir_removed = delete_sme_uploads(sme_id)

    # 6. The SME row itself
    sme_removed = await sme_repo.delete(sme_id)

    logger.info(
        "sme_deleted sme_id=%s entries=%d interviews=%d materials=%d users_demoted=%d dir_removed=%s",
        sme_id, entries_deleted, interviews_deleted, materials_deleted, users_demoted, dir_removed,
    )

    return {
        "status": "deleted",
        "sme_id": sme_id,
        "removed": {
            "knowledge_entries": entries_deleted,
            "interviews": interviews_deleted,
            "materials": materials_deleted,
            "upload_directory": dir_removed,
            "sme_row": bool(sme_removed),
        },
        "users_demoted": users_demoted,
    }
