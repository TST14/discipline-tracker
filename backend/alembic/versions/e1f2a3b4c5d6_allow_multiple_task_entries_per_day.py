"""allow multiple task entries per day

Drop the unique constraint on (entry_date, todo_id) in daily_task_entries
so that a pending task can be logged in multiple time blocks on the same day.

Revision ID: e1f2a3b4c5d6
Revises: d40b2da31e7e
Create Date: 2026-05-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = 'e1f2a3b4c5d6'
down_revision: Union[str, None] = 'd40b2da31e7e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    result = conn.execute(text(
        "SELECT 1 FROM pg_constraint WHERE conname = 'uq_task_entry_date_todo'"
    )).fetchone()
    if result:
        op.drop_constraint('uq_task_entry_date_todo', 'daily_task_entries', type_='unique')


def downgrade() -> None:
    op.create_unique_constraint(
        'uq_task_entry_date_todo', 'daily_task_entries', ['entry_date', 'todo_id']
    )
