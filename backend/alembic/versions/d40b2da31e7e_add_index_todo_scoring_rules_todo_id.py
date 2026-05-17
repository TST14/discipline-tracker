"""add_index_todo_scoring_rules_todo_id

Revision ID: d40b2da31e7e
Revises: c2e3f4a5b6d7
Create Date: 2026-05-18 00:05:16.848648

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd40b2da31e7e'
down_revision: Union[str, None] = 'c2e3f4a5b6d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        'ix_todo_scoring_rules_todo_id',
        'todo_scoring_rules',
        ['todo_id'],
    )


def downgrade() -> None:
    op.drop_index('ix_todo_scoring_rules_todo_id', table_name='todo_scoring_rules')
