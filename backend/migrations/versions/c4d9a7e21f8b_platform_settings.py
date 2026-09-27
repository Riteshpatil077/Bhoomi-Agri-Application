"""Add persisted platform settings.

Revision ID: c4d9a7e21f8b
Revises: f950416317b9
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "c4d9a7e21f8b"
down_revision = "f950416317b9"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "platform_settings",
        sa.Column("key", sa.String(length=120), primary_key=True, nullable=False),
        sa.Column(
            "value",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            nullable=False,
        ),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_platform_settings_updated_by", "platform_settings", ["updated_by"])


def downgrade():
    op.drop_index("ix_platform_settings_updated_by", table_name="platform_settings")
    op.drop_table("platform_settings")
