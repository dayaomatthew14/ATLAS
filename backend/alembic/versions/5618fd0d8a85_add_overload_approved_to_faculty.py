"""add_overload_approved_to_faculty

Revision ID: 5618fd0d8a85
Revises: e6cf548134ed
Create Date: 2026-11-13 11:07:19.815126

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5618fd0d8a85'
down_revision: Union[str, Sequence[str], None] = 'e6cf548134ed'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('faculty', schema=None) as batch_op:
        batch_op.add_column(sa.Column('overload_approved', sa.Boolean(), nullable=False, server_default=sa.text('0')))
        batch_op.alter_column('type',
               existing_type=sa.VARCHAR(length=9),
               type_=sa.String(length=40),
               existing_nullable=False)

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.alter_column('role',
               existing_type=sa.VARCHAR(length=13),
               type_=sa.String(length=50),
               existing_nullable=False)


def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.alter_column('role',
               existing_type=sa.String(length=50),
               type_=sa.VARCHAR(length=13),
               existing_nullable=False)

    with op.batch_alter_table('faculty', schema=None) as batch_op:
        batch_op.alter_column('type',
               existing_type=sa.String(length=40),
               type_=sa.VARCHAR(length=9),
               existing_nullable=False)
        batch_op.drop_column('overload_approved')
