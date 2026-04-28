from datetime import datetime, timezone
from sqlalchemy import Column, Text, DateTime
from sqlalchemy.dialects.postgresql import ARRAY
from app.models.db.base import Base


class SME(Base):
    __tablename__ = "smes"

    id = Column(Text, primary_key=True)
    name = Column(Text, nullable=False)
    specialization = Column(Text, nullable=False)
    sub_areas = Column(ARRAY(Text), nullable=False)
    contact_email = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
