"""Add fields that preserve smart farm and estimated plot inputs.

Revision ID: d1e2f3a4b5c6
Revises: c4d9a7e21f8b
"""
from alembic import op
import sqlalchemy as sa


revision = "d1e2f3a4b5c6"
down_revision = "c4d9a7e21f8b"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("farms") as batch:
        batch.add_column(sa.Column("client_request_id", sa.String(length=36), nullable=True))
        batch.add_column(sa.Column("location_name", sa.String(length=255), nullable=True))
        batch.add_column(sa.Column(
            "soil_type_source", sa.String(length=30), server_default="farmer_provided", nullable=False
        ))
        batch.add_column(sa.Column("soil_region", sa.String(length=120), nullable=True))
        batch.create_unique_constraint(
            "uq_farms_user_client_request", ["user_id", "client_request_id"]
        )
    with op.batch_alter_table("plots") as batch:
        batch.add_column(sa.Column("client_request_id", sa.String(length=36), nullable=True))
        batch.add_column(sa.Column(
            "area_is_estimated", sa.Boolean(), server_default=sa.false(), nullable=False
        ))
        batch.create_unique_constraint(
            "uq_plots_farm_client_request", ["farm_id", "client_request_id"]
        )


def downgrade():
    with op.batch_alter_table("plots") as batch:
        batch.drop_constraint("uq_plots_farm_client_request", type_="unique")
        batch.drop_column("area_is_estimated")
        batch.drop_column("client_request_id")
    with op.batch_alter_table("farms") as batch:
        batch.drop_constraint("uq_farms_user_client_request", type_="unique")
        batch.drop_column("soil_region")
        batch.drop_column("soil_type_source")
        batch.drop_column("location_name")
        batch.drop_column("client_request_id")
