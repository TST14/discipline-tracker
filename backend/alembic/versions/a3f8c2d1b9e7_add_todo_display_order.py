"""add todo display_order

Revision ID: a3f8c2d1b9e7
Revises: de5643cd52c1
Create Date: 2026-05-17 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a3f8c2d1b9e7'
down_revision: Union[str, None] = 'de5643cd52c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # IF NOT EXISTS makes this safe whether create_all already added the column
    # (fresh DB) or we're adding it to an existing table (existing deployment).
    op.execute("""
        ALTER TABLE todos
        ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0
    """)
    # Backfill existing rows: assign display_order based on created_at ascending
    op.execute("""
        UPDATE todos
        SET display_order = sub.rn - 1
        FROM (
            SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
            FROM todos
        ) sub
        WHERE todos.id = sub.id
    """)


def downgrade() -> None:
    op.drop_column('todos', 'display_order')
