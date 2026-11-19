/**
 * Normalizes subject codes by stripping A, B, or A/B suffixes to compare base subjects.
 */
export const getBaseSubjectCode = (code) => {
  if (!code) return '';
  return String(code).replace(/[_\-\s]*(?:A\/B|[AB])$/i, '').trim().toUpperCase();
};

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

export const LUNCH_BREAK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
export const LUNCH_BREAK_START_MIN = 12 * 60; // 12:00 PM
export const LUNCH_BREAK_END_MIN = 13 * 60;   // 01:00 PM

export const isLunchBreakOverlap = (day, startStr, endStr) => {
  if (!day || !LUNCH_BREAK_DAYS.includes(String(day).slice(0, 3))) return false;
  const s = parseTimeToMinutes(startStr);
  const e = parseTimeToMinutes(endStr);
  if (s === null || e === null) return false;
  return s < LUNCH_BREAK_END_MIN && e > LUNCH_BREAK_START_MIN;
};

/**
 * Utility to detect conflicts between a new/edited schedule and existing ones.
 */
export const detectConflicts = (newSchedule, existingSchedules) => {
  const conflicts = [];
  const newDay = newSchedule.dayOfWeek || newSchedule.day_of_week;
  const newStart = newSchedule.start_time || newSchedule.startTime;
  const newEnd = newSchedule.end_time || newSchedule.endTime;

  if (isLunchBreakOverlap(newDay, newStart, newEnd)) {
    conflicts.push({
      type: 'LunchBreak',
      severity: 'blocking',
      with: null,
      message: `Classes cannot overlap the mandatory 1-hour Lunch Break (12:00 PM – 01:00 PM) on ${newDay}.`,
    });
  }

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
      // Teacher Conflict
      const newFacId = newSchedule.faculty_id || newSchedule.teacherId;
      const existingFacId = existing.faculty_id || existing.teacherId;

      const hasTeacherConflict = Boolean(
        newFacId && existingFacId && String(newFacId) === String(existingFacId)
      );

      if (hasTeacherConflict) {
        conflicts.push({ type: 'Teacher', severity: 'blocking', with: existing });
      }

      // Same Program + Year Level student cohort overlap (advisory warning)
      const newBlock = newSchedule.block_id;
      const existingBlock = existing.block_id;
      const newYear = String(newSchedule.year_level || '').trim().toUpperCase();
      const existingYear = String(existing.year_level || '').trim().toUpperCase();
      const newCurrId = newSchedule.curriculum_id || newSchedule.subject_id;
      const existingCurrId = existing.curriculum_id;

      if (
        newBlock &&
        existingBlock &&
        String(newBlock) === String(existingBlock) &&
        newYear &&
        existingYear &&
        newYear === existingYear &&
        (!newCurrId || !existingCurrId || String(newCurrId) !== String(existingCurrId))
      ) {
        conflicts.push({
          type: 'CohortOverlap',
          severity: 'advisory',
          with: existing,
          message: `Same program & year level already has ${existing.subject_code || 'another class'} at this time on ${newDay}.`,
        });
      }
    }

    // Session Order Conflict (Lecture must precede Laboratory on the same day)
    const newCode = newSchedule.subject_code || newSchedule.code || newSchedule.subject || '';
    const existingCode = existing.subject_code || existing.code || existing.subject || '';
    const newBase = getBaseSubjectCode(newCode);
    const existingBase = getBaseSubjectCode(existingCode);

    const isSameSubject = (newBase && newBase === existingBase) ||
      (newSchedule.curriculum_id && existing.curriculum_id && newSchedule.curriculum_id === existing.curriculum_id);

    if (isSameSubject) {
      const isNewLab = newSchedule.part_type === 'lab' || newSchedule.type === 'lab' || newSchedule.curriculum_type === 'lab' || String(newCode).toUpperCase().endsWith('B');
      const isExistingLec = existing.part_type === 'lecture' || existing.type === 'lecture' || existing.curriculum_type === 'lecture' || String(existingCode).toUpperCase().endsWith('A');

      const isNewLec = newSchedule.part_type === 'lecture' || newSchedule.type === 'lecture' || newSchedule.curriculum_type === 'lecture' || String(newCode).toUpperCase().endsWith('A');
      const isExistingLab = existing.part_type === 'lab' || existing.type === 'lab' || existing.curriculum_type === 'lab' || String(existingCode).toUpperCase().endsWith('B');

      const s1 = parseTimeToMinutes(start1);
      const e1 = parseTimeToMinutes(end1);
      const s2 = parseTimeToMinutes(start2);
      const e2 = parseTimeToMinutes(end2);

      if (isNewLab && isExistingLec && s1 !== null && e2 !== null && s1 < e2) {
        conflicts.push({
          type: 'SessionOrder',
          severity: 'blocking',
          with: existing,
          message: `Laboratory session must be scheduled after Lecture session on ${newDay}.`
        });
      } else if (isNewLec && isExistingLab && e1 !== null && s2 !== null && e1 > s2) {
        conflicts.push({
          type: 'SessionOrder',
          severity: 'blocking',
          with: existing,
          message: `Lecture session must be scheduled before Laboratory session on ${newDay}.`
        });
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
      // Never compare classes from different semesters against each other
      if (item.semester_id != null && other.semester_id != null && item.semester_id !== other.semester_id) {
        return false;
      }
      const otherDay = other.day_of_week || other.dayOfWeek;
      if (!otherDay || !day || otherDay !== day) return false;
      
      const otherStart = other.start_time || other.startTime;
      const otherEnd = other.end_time || other.endTime;
      if (!isTimeOverlap(start, end, otherStart, otherEnd)) return false;

      const itemFacId = item.faculty_id || item.teacherId;
      const otherFacId = other.faculty_id || other.teacherId;
      const teacherConflict = Boolean(itemFacId && otherFacId && String(itemFacId) === String(otherFacId));

      return teacherConflict;
    });

    return {
      ...item,
      isConflicting: conflicts.length > 0 || isLunchBreakOverlap(day, start, end),
      hasLunchBreakConflict: isLunchBreakOverlap(day, start, end),
      hasRoomOverlap: false,
      conflictDetails: conflicts,
      roomOverlapDetails: [],
    };
  });
};
