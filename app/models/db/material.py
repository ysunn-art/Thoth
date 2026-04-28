from datetime import datetime, timezone
from sqlalchemy import Column, Text, DateTime, ForeignKey
from app.models.db.base import Base


class Material(Base):
    __tablename__ = "materials"

    id = Column(Text, primary_key=True)
    sme_id = Column(Text, ForeignKey("smes.id"), nullable=False)
    title = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    file_type = Column(Text, nullable=False)
    file_path = Column(Text, nullable=False)
    status = Column(Text, nullable=False, default="processing")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
