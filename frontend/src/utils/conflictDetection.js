/**
 * Utility to parse time strings (e.g. "08:00", "8:00", "13:30:00", "01:30 PM") into minutes from midnight.
 */
export const parseTimeToMinutes = (timeStr) => {
  if (!timeStr) return null;
  if (typeof timeStr !== 'string') return null;

  const trimmed = timeStr.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[3];

  if (ampm) {
    const period = ampm.toUpperCase();
    if (period === 'PM' && hours < 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
  }

  return hours * 60 + minutes;
};

/**
 * Robust time overlap check using numeric minute calculations.
 * (start1 < end2) && (end1 > start2)
 */
export const isTimeOverlap = (start1Str, end1Str, start2Str, end2Str) => {
  const s1 = parseTimeToMinutes(start1Str);
  const e1 = parseTimeToMinutes(end1Str);
  const s2 = parseTimeToMinutes(start2Str);
  const e2 = parseTimeToMinutes(end2Str);

  if (s1 === null || e1 === null || s2 === null || e2 === null) return false;
  return s1 < e2 && e1 > s2;
};

/**
 * Utility to detect conflicts between a new/edited schedule and existing ones.
 */
export const detectConflicts = (newSchedule, existingSchedules) => {
  const conflicts = [];

  existingSchedules.forEach(existing => {
    // Skip if comparing to itself (during edits)
    if (existing.id && newSchedule.id && existing.id === newSchedule.id) return;

    // Check if on the same day
    const existingDay = existing.dayOfWeek || existing.day_of_week;
    const newDay = newSchedule.dayOfWeek || newSchedule.day_of_week;
    if (!existingDay || !newDay || existingDay !== newDay) return;

    const start1 = newSchedule.start_time || newSchedule.startTime;
    const end1 = newSchedule.end_time || newSchedule.endTime;
    const start2 = existing.start_time || existing.startTime;
    const end2 = existing.end_time || existing.endTime;

    if (isTimeOverlap(start1, end1, start2, end2)) {
      // Room Conflict (only if room is assigned)
      // Identity only. Matching on display name additionally flagged two
      // distinct rooms that happen to share a name -- `rooms` has no unique
      // constraint on `name`, so "101" in two buildings is normal -- and two
      // faculty who share a display name. Both produced conflicts the server
      // does not have and the user cannot resolve. The server compares ids
      // (schedule_generator.is_room_conflict); so does this now.
      const newRoomId = newSchedule.room_id || newSchedule.roomId;
      const existingRoomId = existing.room_id || existing.roomId;

      const hasRoomConflict = Boolean(newRoomId && existingRoomId && newRoomId === existingRoomId);

      if (hasRoomConflict) {
        conflicts.push({ type: 'Room', with: existing });
      }
      
      // Teacher Conflict
      const newFacId = newSchedule.faculty_id || newSchedule.teacherId;
      const existingFacId = existing.faculty_id || existing.teacherId;

      const hasTeacherConflict = Boolean(newFacId && existingFacId && newFacId === existingFacId);

      if (hasTeacherConflict) {
        conflicts.push({ type: 'Teacher', with: existing });
      }

      // Section Conflict
      if (newSchedule.section && existing.section && newSchedule.section === existing.section) {
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
    const start = item.start_time || item.startTime;
    const end = item.end_time || item.endTime;
    const day = item.day_of_week || item.dayOfWeek;
    
    const conflicts = schedules.filter(other => {
      if (other.id === item.id) return false;
      const otherDay = other.day_of_week || other.dayOfWeek;
      if (!otherDay || !day || otherDay !== day) return false;
      
      const otherStart = other.start_time || other.startTime;
      const otherEnd = other.end_time || other.endTime;
      if (!isTimeOverlap(start, end, otherStart, otherEnd)) return false;

      // Identity only -- see the note in detectConflicts above.
      const itemId = item.room_id || item.roomId;
      const otherRoomId = other.room_id || other.roomId;
      const roomConflict = Boolean(itemId && otherRoomId && itemId === otherRoomId);

      const itemFacId = item.faculty_id || item.teacherId;
      const otherFacId = other.faculty_id || other.teacherId;
      const teacherConflict = Boolean(itemFacId && otherFacId && itemFacId === otherFacId);

      const sectionConflict = item.section && other.section && item.section === other.section;

      return roomConflict || teacherConflict || sectionConflict;
    });

    return {
      ...item,
      isConflicting: conflicts.length > 0,
      conflictDetails: conflicts
    };
  });
};
