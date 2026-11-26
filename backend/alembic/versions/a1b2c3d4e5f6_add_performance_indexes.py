"""add_performance_indexes

Revision ID: a1b2c3d4e5f6
Revises: cddf63933c40
Create Date: 2026-11-26 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'cddf63933c40'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


INDEXES = [
    ('ix_curriculum_blocks_department_id', 'curriculum_blocks', ['department_id']),
    ('ix_curriculum_blocks_program_id', 'curriculum_blocks', ['program_id']),
    ('ix_curriculum_block_id', 'curriculum', ['block_id']),
    ('ix_curriculum_department_id', 'curriculum', ['department_id']),
    ('ix_rooms_department_id', 'rooms', ['department_id']),
    ('ix_faculty_department_id', 'faculty', ['department_id']),
    ('ix_schedules_curriculum_id', 'schedules', ['curriculum_id']),
    ('ix_conflicts_schedule_id_1', 'conflicts', ['schedule_id_1']),
    ('ix_conflicts_schedule_id_2', 'conflicts', ['schedule_id_2']),
    ('ix_conflicts_faculty_id', 'conflicts', ['faculty_id']),
    ('ix_conflicts_curriculum_id', 'conflicts', ['curriculum_id']),
    ('ix_conflicts_resolved_at', 'conflicts', ['resolved_at']),
    ('ix_subject_offerings_faculty_id', 'subject_offerings', ['faculty_id']),
    ('ix_subject_offerings_curriculum_id', 'subject_offerings', ['curriculum_id']),
    ('ix_subject_offerings_semester_id', 'subject_offerings', ['semester_id']),
    ('ix_subject_offerings_room_id', 'subject_offerings', ['room_id']),
]


def upgrade() -> None:
    """Add indexes to frequently queried foreign key and filter columns."""
    for idx_name, table_name, columns in INDEXES:
        op.create_index(idx_name, table_name, columns, unique=False)


def downgrade() -> None:
    """Drop performance indexes."""
    for idx_name, table_name, _ in reversed(INDEXES):
        op.drop_index(idx_name, table_name=table_name)
