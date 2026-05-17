"""add todo status_changed_date

Revision ID: c2e3f4a5b6d7
Revises: b1d2e3f4a5c6
Create Date: 2026-05-17 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op


revision: str = 'c2e3f4a5b6d7'
down_revision: Union[str, None] = 'b1d2e3f4a5c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE todos
        ADD COLUMN IF NOT EXISTS status_changed_date DATE
    """)
    # Backfill: existing done/skipped rows get their created_at date so they
    # appear as "historical" immediately. Pending rows stay NULL (no date needed).
    op.execute("""
        UPDATE todos
        SET status_changed_date = created_at::date
        WHERE status IN ('done', 'skipped')
    """)


def downgrade() -> None:
    op.drop_column('todos', 'status_changed_date')
