"""add todo scoring_type and todo_scoring_rules table

Revision ID: b1d2e3f4a5c6
Revises: a3f8c2d1b9e7
Create Date: 2026-05-17 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b1d2e3f4a5c6'
down_revision: Union[str, None] = 'a3f8c2d1b9e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add scoring_type to todos (IF NOT EXISTS for idempotency on fresh DBs)
    op.execute("""
        ALTER TABLE todos
        ADD COLUMN IF NOT EXISTS scoring_type VARCHAR(20) NOT NULL DEFAULT 'boolean'
    """)

    # Create todo_scoring_rules table
    op.execute("""
        CREATE TABLE IF NOT EXISTS todo_scoring_rules (
            id SERIAL PRIMARY KEY,
            todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
            condition VARCHAR(10) NOT NULL,
            value VARCHAR(20) NOT NULL,
            percentage INTEGER NOT NULL,
            rule_order INTEGER NOT NULL DEFAULT 0
        )
    """)


def downgrade() -> None:
    op.drop_table('todo_scoring_rules')
    op.drop_column('todos', 'scoring_type')
