from datetime import datetime, timezone
from sqlalchemy import Column, Text, Boolean, DateTime, ForeignKey, CheckConstraint, Index
from app.models.db.base import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("is_sme = false OR sme_id IS NOT NULL", name="user_sme_link"),
        Index("ix_users_email", "email", unique=True),
    )

    id = Column(Text, primary_key=True)
    email = Column(Text, nullable=False, unique=True)
    password_hash = Column(Text, nullable=False)
    is_admin = Column(Boolean, nullable=False, default=False)
    is_sme = Column(Boolean, nullable=False, default=False)
    sme_id = Column(Text, ForeignKey("smes.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
