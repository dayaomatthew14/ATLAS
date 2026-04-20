/**
 * Utility to detect conflicts between a new/edited schedule and existing ones.
 */
export const detectConflicts = (newSchedule, existingSchedules) => {
  const conflicts = [];

  existingSchedules.forEach(existing => {
    // Skip if comparing to itself (during edits)
    if (existing.id === newSchedule.id) return;

    // Check if on the same day
    if (existing.dayOfWeek !== newSchedule.dayOfWeek) return;

    // Time overlap check
    // (start1 < end2) && (end1 > start2)
    const start1 = newSchedule.start_time;
    const end1 = newSchedule.end_time;
    const start2 = existing.startTime || existing.start_time;
    const end2 = existing.endTime || existing.end_time;

    const isTimeOverlap = (start1 < end2) && (end1 > start2);

    if (isTimeOverlap) {
      // Room Conflict
      if (existing.room_id === newSchedule.room_id || (existing.room?.name === newSchedule.room_name)) {
        conflicts.push({ type: 'Room', with: existing });
      }
      
      // Teacher Conflict
      if (existing.faculty_id === newSchedule.faculty_id || (existing.teacher === newSchedule.teacher)) {
        conflicts.push({ type: 'Teacher', with: existing });
      }

      // Subject/Section Conflict (Same section shouldn't have two classes at once)
      if (existing.section === newSchedule.section) {
        conflicts.push({ type: 'Section', with: existing });
      }
    }
  });

  return conflicts;
};

/**
 * Checks if a specific schedule item in a list has any conflicts with others in that same list.
 */
export const checkScheduleIntegrity = (schedules) => {
  return schedules.map(item => {
    const start = item.startTime || item.start_time;
    const end = item.endTime || item.end_time;
    const day = item.dayOfWeek;
    
    const conflicts = schedules.filter(other => {
      if (other.id === item.id) return false;
      if (other.dayOfWeek !== day) return false;
      
      const otherStart = other.startTime || other.start_time;
      const otherEnd = other.endTime || other.end_time;
      const isOverlap = (start < otherEnd) && (end > otherStart);
      
      if (!isOverlap) return false;

      return (
        item.room_id === other.room_id || 
        item.faculty_id === other.faculty_id ||
        item.section === other.section
      );
    });

    return {
      ...item,
      isConflicting: conflicts.length > 0,
      conflictDetails: conflicts
    };
  });
};
