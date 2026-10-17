"""add load_unit to faculty

Revision ID: e6cf548134ed
Revises: 80c986b8255f
Create Date: 2026-10-18 02:09:01.958735

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e6cf548134ed'
down_revision: Union[str, Sequence[str], None] = '80c986b8255f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('faculty', schema=None) as batch_op:
        batch_op.add_column(sa.Column('load_unit', sa.String(length=10), nullable=False, server_default='units'))


def downgrade() -> None:
    with op.batch_alter_table('faculty', schema=None) as batch_op:
        batch_op.drop_column('load_unit')
