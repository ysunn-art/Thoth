from datetime import datetime, timezone
from sqlalchemy import Column, Text, Integer, DateTime, ForeignKey
from app.models.db.base import Base


class Turn(Base):
    __tablename__ = "turns"

    id = Column(Text, primary_key=True)
    interview_id = Column(Text, ForeignKey("interviews.id"), nullable=False)
    turn_number = Column(Integer, nullable=False)
    sme_response = Column(Text, nullable=False)
    agent_follow_up = Column(Text, nullable=True)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
