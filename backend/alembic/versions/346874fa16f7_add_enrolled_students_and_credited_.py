"""add enrolled_students and credited_hours_override

Revision ID: 346874fa16f7
Revises: 5618fd0d8a85
Create Date: 2026-11-19 16:53:18.619241

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '346874fa16f7'
down_revision: Union[str, Sequence[str], None] = '5618fd0d8a85'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema — add Converted Tutorial (CT) columns safely."""
    with op.batch_alter_table('schedules', schema=None) as batch_op:
        batch_op.add_column(sa.Column('enrolled_students', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('credited_hours_override', sa.Float(), nullable=True))

    with op.batch_alter_table('subject_offerings', schema=None) as batch_op:
        batch_op.add_column(sa.Column('enrolled_students', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('credited_hours_override', sa.Float(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('subject_offerings', schema=None) as batch_op:
        batch_op.drop_column('credited_hours_override')
        batch_op.drop_column('enrolled_students')

    with op.batch_alter_table('schedules', schema=None) as batch_op:
        batch_op.drop_column('credited_hours_override')
        batch_op.drop_column('enrolled_students')
