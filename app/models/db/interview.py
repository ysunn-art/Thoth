from datetime import datetime, timezone
from sqlalchemy import Column, Text, DateTime, ForeignKey
from app.models.db.base import Base


class Interview(Base):
    __tablename__ = "interviews"

    id = Column(Text, primary_key=True)
    sme_id = Column(Text, ForeignKey("smes.id"), nullable=False)
    topic = Column(Text, nullable=False)
    status = Column(Text, nullable=False, default="in_progress")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
