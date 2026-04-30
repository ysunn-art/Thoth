"""initial schema

Revision ID: 001
Revises:
Create Date: 2026-04-29
"""
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "smes",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("specialization", sa.Text, nullable=False),
        sa.Column("sub_areas", sa.ARRAY(sa.Text), nullable=False, server_default="{}"),
        sa.Column("contact_email", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "interviews",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("sme_id", sa.Text, sa.ForeignKey("smes.id"), nullable=False),
        sa.Column("topic", sa.Text, nullable=False),
        sa.Column("status", sa.Text, nullable=False, server_default="in_progress"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "turns",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("interview_id", sa.Text, sa.ForeignKey("interviews.id"), nullable=False),
        sa.Column("turn_number", sa.Integer, nullable=False),
        sa.Column("sme_response", sa.Text, nullable=False),
        sa.Column("agent_follow_up", sa.Text),
        sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "materials",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("sme_id", sa.Text, sa.ForeignKey("smes.id"), nullable=False),
        sa.Column("title", sa.Text, nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("file_type", sa.Text, nullable=False),
        sa.Column("file_path", sa.Text, nullable=False),
        sa.Column("status", sa.Text, nullable=False, server_default="processing"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "knowledge_entries",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("sme_id", sa.Text, sa.ForeignKey("smes.id"), nullable=False),
        sa.Column("topic", sa.Text, nullable=False),
        sa.Column("status", sa.Text, nullable=False, server_default="draft"),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("source_interviews", sa.ARRAY(sa.Text), nullable=False, server_default="{}"),
        sa.Column("source_materials", sa.ARRAY(sa.Text), nullable=False, server_default="{}"),
        sa.Column("rejection_reason", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("approved_at", sa.DateTime(timezone=True)),
        sa.Column("admin_approved_at", sa.DateTime(timezone=True)),
        sa.Column("rejected_at", sa.DateTime(timezone=True)),
    )

    op.create_table(
        "knowledge_chunks",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("entry_id", sa.Text, sa.ForeignKey("knowledge_entries.id", ondelete="CASCADE"), nullable=False),
        sa.Column("chunk_index", sa.Integer, nullable=False),
        sa.Column("chunk_text", sa.Text, nullable=False),
        sa.Column("embedding", Vector(384)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.execute(
        "CREATE INDEX ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade():
    op.drop_table("knowledge_chunks")
    op.drop_table("knowledge_entries")
    op.drop_table("materials")
    op.drop_table("turns")
    op.drop_table("interviews")
    op.drop_table("smes")
