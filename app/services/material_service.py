import io
from fastapi import HTTPException, UploadFile
from app.repositories.material_repo import MaterialRepository
from app.repositories.sme_repo import SMERepository
from app.models.db.material import Material
from app.core.ids import new_id
from app.core.errors import raise_not_found
from storage.file_store import save_file, read_file

ACCEPTED_TYPES = {"application/pdf", "text/plain", "text/markdown"}
MAX_SIZE = 10 * 1024 * 1024  # 10 MB
CHUNK_SIZE = 2000
CHUNK_OVERLAP = 200


def _chunk_text(text: str) -> list[str]:
    chunks = []
    start = 0
    while start < len(text):
        end = start + CHUNK_SIZE
        chunks.append(text[start:end])
        start = end - CHUNK_OVERLAP
    return chunks


def _parse_file(content: bytes, file_type: str) -> str:
    if file_type == "application/pdf":
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(content))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    return content.decode("utf-8", errors="replace")


class MaterialService:
    def __init__(self, repo: MaterialRepository, sme_repo: SMERepository):
        self.repo = repo
        self.sme_repo = sme_repo

    async def upload_material(self, sme_id: str, file: UploadFile, title: str, description: str | None) -> tuple[Material, dict | None]:
        sme = await self.sme_repo.get_by_id(sme_id)
        if not sme:
            raise_not_found("SME", sme_id)

        content_type = file.content_type or ""
        if content_type not in ACCEPTED_TYPES:
            raise HTTPException(status_code=400, detail={"error": f"Unsupported file type: {content_type}", "code": "UNSUPPORTED_FILE_TYPE"})

        content = await file.read()
        if len(content) > MAX_SIZE:
            raise HTTPException(status_code=400, detail={"error": "File exceeds 10 MB limit", "code": "FILE_TOO_LARGE"})

        material_id = new_id("mat")
        file_path = await save_file(sme_id, material_id, file.filename or "file", content)

        material = Material(
            id=material_id,
            sme_id=sme_id,
            title=title,
            description=description,
            file_type=content_type,
            file_path=file_path,
            status="processing",
        )
        material = await self.repo.create(material)

        # Parse the file to validate it's readable — text is stored on disk
        # and read during synthesis. Embedding happens at admin-approve time
        # on the resulting knowledge entry (knowledge_chunks requires a
        # knowledge_entries FK, not a material FK).
        _parse_file(content, content_type)

        material.status = "processed"
        material = await self.repo.update(material)

        return material, None

    async def list_materials(self, sme_id: str) -> list[Material]:
        return await self.repo.list_by_sme(sme_id)
