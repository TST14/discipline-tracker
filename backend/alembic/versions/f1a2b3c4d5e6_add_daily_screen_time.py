"""add daily_screen_time table

Revision ID: f1a2b3c4d5e6
Revises: e1f2a3b4c5d6
Create Date: 2026-05-19
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector

revision = 'f1a2b3c4d5e6'
down_revision = 'e1f2a3b4c5d6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    if 'daily_screen_time' not in inspector.get_table_names():
        op.create_table(
            'daily_screen_time',
            sa.Column('id',         sa.Integer(),     primary_key=True, index=True),
            sa.Column('entry_date', sa.Date(),         nullable=False,   index=True),
            sa.Column('start_time', sa.Time(),         nullable=False),
            sa.Column('end_time',   sa.Time(),         nullable=False),
            sa.Column('minutes',    sa.Integer(),      nullable=False),
            sa.Column('note',       sa.String(200),    nullable=True),
            sa.Column('logged_at',  sa.DateTime(),     server_default=sa.text('now()')),
        )


def downgrade() -> None:
    op.drop_table('daily_screen_time')
