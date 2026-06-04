import shutil
from pathlib import Path
from app.config import settings


async def save_file(sme_id: str, material_id: str, filename: str, content: bytes) -> str:
    upload_dir = Path(settings.upload_dir) / sme_id / material_id
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / filename
    file_path.write_bytes(content)
    return str(file_path)


def read_file(file_path: str) -> bytes:
    return Path(file_path).read_bytes()


def purge_uploads():
    upload_dir = Path(settings.upload_dir)
    if upload_dir.exists():
        shutil.rmtree(upload_dir)


def delete_sme_uploads(sme_id: str) -> bool:
    """Remove the upload directory for a single SME (recursive). No-op if absent.
    Returns True if a directory was actually removed."""
    sme_dir = Path(settings.upload_dir) / sme_id
    if sme_dir.exists():
        shutil.rmtree(sme_dir)
        return True
    return False
