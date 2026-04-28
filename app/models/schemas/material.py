from typing import List, Optional
from pydantic import BaseModel


class MaterialResponse(BaseModel):
    material_id: str
    sme_id: str
    title: str
    file_type: str
    status: str
    created_at: str
    usage: Optional[dict] = None


class MaterialListResponse(BaseModel):
    materials: List[MaterialResponse]
