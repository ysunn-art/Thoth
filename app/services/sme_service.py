from app.repositories.sme_repo import SMERepository
from app.models.db.sme import SME
from app.models.schemas.sme import SMECreate, SMEUpdate
from app.core.ids import new_id
from app.core.errors import raise_not_found


class SMEService:
    def __init__(self, repo: SMERepository):
        self.repo = repo

    async def create_sme(self, data: SMECreate) -> SME:
        sme = SME(
            id=new_id("sme"),
            name=data.name,
            specialization=data.specialization,
            sub_areas=data.sub_areas,
            contact_email=data.contact_email,
        )
        return await self.repo.create(sme)

    async def get_sme(self, sme_id: str) -> SME:
        sme = await self.repo.get_by_id(sme_id)
        if not sme:
            raise_not_found("SME", sme_id)
        return sme

    async def update_sme(self, sme_id: str, data: SMEUpdate) -> SME:
        sme = await self.get_sme(sme_id)
        sme.name = data.name
        sme.specialization = data.specialization
        sme.sub_areas = data.sub_areas
        sme.contact_email = data.contact_email
        return await self.repo.update(sme)

    async def list_smes(self) -> list[SME]:
        return await self.repo.list_all()
