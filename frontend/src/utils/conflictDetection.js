/**
 * Utility to detect conflicts between a new/edited schedule and existing ones.
 */
export const detectConflicts = (newSchedule, existingSchedules) => {
  const conflicts = [];

  existingSchedules.forEach(existing => {
    // Skip if comparing to itself (during edits)
    if (existing.id === newSchedule.id) return;

    // Check if on the same day
    const existingDay = existing.dayOfWeek || existing.day_of_week;
    const newDay = newSchedule.dayOfWeek || newSchedule.day_of_week;
    if (existingDay !== newDay) return;

    // Time overlap check
    // (start1 < end2) && (end1 > start2)
    const start1 = newSchedule.start_time;
    const end1 = newSchedule.end_time;
    const start2 = existing.startTime || existing.start_time;
    const end2 = existing.endTime || existing.end_time;

    const isTimeOverlap = (start1 < end2) && (end1 > start2);

    if (isTimeOverlap) {
      // Room Conflict
      if (
        (existing.room_id && existing.room_id === newSchedule.room_id) || 
        (existing.room?.name && existing.room?.name === newSchedule.room_name) ||
        (existing.room_name && existing.room_name === newSchedule.room_name)
      ) {
        conflicts.push({ type: 'Room', with: existing });
      }
      
      // Teacher Conflict
      if (
        (existing.faculty_id && existing.faculty_id === newSchedule.faculty_id) || 
        (existing.teacher && existing.teacher === newSchedule.teacher) ||
        (existing.faculty_name && existing.faculty_name === newSchedule.faculty_name)
      ) {
        conflicts.push({ type: 'Teacher', with: existing });
      }

      // Curriculum/Section Conflict (Same section shouldn't have two classes at once)
      if (existing.section && existing.section === newSchedule.section) {
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
    const day = item.dayOfWeek || item.day_of_week;
    
    const conflicts = schedules.filter(other => {
      if (other.id === item.id) return false;
      const otherDay = other.dayOfWeek || other.day_of_week;
      if (otherDay !== day) return false;
      
      const otherStart = other.startTime || other.start_time;
      const otherEnd = other.endTime || other.end_time;
      const isOverlap = (start < otherEnd) && (end > otherStart);
      
      if (!isOverlap) return false;

      return (
        (item.room_id && item.room_id === other.room_id) || 
        (item.room_name && item.room_name === other.room_name) ||
        (item.faculty_id && item.faculty_id === other.faculty_id) ||
        (item.faculty_name && item.faculty_name === other.faculty_name) ||
        (item.section && item.section === other.section)
      );
    });

    return {
      ...item,
      isConflicting: conflicts.length > 0,
      conflictDetails: conflicts
    };
  });
};
