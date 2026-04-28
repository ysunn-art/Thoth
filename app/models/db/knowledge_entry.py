from datetime import datetime, timezone
from sqlalchemy import Column, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import ARRAY
from app.models.db.base import Base


class KnowledgeEntry(Base):
    __tablename__ = "knowledge_entries"

    id = Column(Text, primary_key=True)
    sme_id = Column(Text, ForeignKey("smes.id"), nullable=False)
    topic = Column(Text, nullable=False)
    status = Column(Text, nullable=False, default="draft")
    content = Column(Text, nullable=False)
    source_interviews = Column(ARRAY(Text), nullable=False, default=list)
    source_materials = Column(ARRAY(Text), nullable=False, default=list)
    rejection_reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    approved_at = Column(DateTime(timezone=True), nullable=True)
    admin_approved_at = Column(DateTime(timezone=True), nullable=True)
    rejected_at = Column(DateTime(timezone=True), nullable=True)
