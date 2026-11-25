"""add_lab_room_approval_fields

Revision ID: cddf63933c40
Revises: 346874fa16f7
Create Date: 2026-11-25 12:07:44.304628

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cddf63933c40'
down_revision: Union[str, Sequence[str], None] = '346874fa16f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema — add lab room approval fields."""
    with op.batch_alter_table('schedules', schema=None) as batch_op:
        batch_op.add_column(sa.Column('room_approval_status', sa.String(length=30), nullable=True))
        batch_op.add_column(sa.Column('room_requested_by', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('room_approved_by', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('room_approved_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('room_rejection_reason', sa.String(length=255), nullable=True))
        batch_op.create_foreign_key('fk_schedules_room_requested_by', 'users', ['room_requested_by'], ['id'])
        batch_op.create_foreign_key('fk_schedules_room_approved_by', 'users', ['room_approved_by'], ['id'])

    with op.batch_alter_table('subject_offerings', schema=None) as batch_op:
        batch_op.alter_column('faculty_id', existing_type=sa.Integer(), nullable=True)
        batch_op.add_column(sa.Column('room_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('room_approval_status', sa.String(length=30), nullable=True))
        batch_op.add_column(sa.Column('room_requested_by', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('room_approved_by', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('room_approved_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('room_rejection_reason', sa.String(length=255), nullable=True))
        batch_op.create_foreign_key('fk_subject_offerings_room_id', 'rooms', ['room_id'], ['id'], ondelete='SET NULL')
        batch_op.create_foreign_key('fk_subject_offerings_room_requested_by', 'users', ['room_requested_by'], ['id'])
        batch_op.create_foreign_key('fk_subject_offerings_room_approved_by', 'users', ['room_approved_by'], ['id'])


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('subject_offerings', schema=None) as batch_op:
        batch_op.alter_column('faculty_id', existing_type=sa.Integer(), nullable=False)
        batch_op.drop_constraint('fk_subject_offerings_room_id', type_='foreignkey')
        batch_op.drop_column('room_id')
    with op.batch_alter_table('subject_offerings', schema=None) as batch_op:
        batch_op.drop_column('room_rejection_reason')
        batch_op.drop_column('room_approved_at')
        batch_op.drop_column('room_approved_by')
        batch_op.drop_column('room_requested_by')
        batch_op.drop_column('room_approval_status')

    with op.batch_alter_table('schedules', schema=None) as batch_op:
        batch_op.drop_column('room_rejection_reason')
        batch_op.drop_column('room_approved_at')
        batch_op.drop_column('room_approved_by')
        batch_op.drop_column('room_requested_by')
        batch_op.drop_column('room_approval_status')
