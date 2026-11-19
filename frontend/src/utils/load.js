/**
 * Frontend helpers for faculty teaching-hour limits and subject-hour conversions.
 *
 * Uses exact weekly minutes internally to prevent floating-point drift:
 * - Lecture (A): 1u = 80m (1h 20m), 2u = 160m (2h 40m), 3u = 240m (4h)
 * - Laboratory (B): 1u = 240m (4h), 2u = 480m (8h)
 * - Combined (C): 3u = 240m (4h) — only when genuinely classified as C
 *
 * Faculty weekly teaching-hour limits by classification & term:
 * - Full-Time Probationary: 24h (1st), 24h (2nd), 24h (3rd)
 * - Full-Time Regular:      24h (1st), 20h (2nd), 20h (3rd)
 * - Part-Time:              Max 20h (1st, 2nd, 3rd)
 */

export const PART_TIME_CEILING_HOURS = 20;

export const FULL_TIME_PROBATIONARY_HOURS = {
  '1st': 24,
  '2nd': 24,
  '3rd': 24,
};

export const FULL_TIME_REGULAR_HOURS = {
  '1st': 24,
  '2nd': 20,
  '3rd': 20,
};

export const TOTAL_WORK_WEEK_HOURS = 40.0;
export const OFF_CAMPUS_HOURS = { '1st': 2.5, '2nd': 5.5, '3rd': 5.5 };
export const CONSULTATION_HOURS = { '1st': 6.0, '2nd': 6.0, '3rd': 6.0 };
export const ALLOCATED_OFFICE_HOURS = { '1st': 7.5, '2nd': 8.5, '3rd': 8.5 };
export const MAX_OVERLOAD_HOURS = ALLOCATED_OFFICE_HOURS;

export function normaliseTermKey(term) {
  if (!term) return '1st';
  const str = String(term).toLowerCase();
  if (str.includes('2')) return '2nd';
  if (str.includes('3')) return '3rd';
  return '1st';
}

export function normaliseEmploymentType(type) {
  const raw = String(type || 'full_time_regular').trim().toLowerCase();
  if (raw.includes('part')) return 'part_time';
  if (raw.includes('probationary')) return 'full_time_probationary';
  return 'full_time_regular';
}

export function employmentTypeLabel(type) {
  const norm = normaliseEmploymentType(type);
  if (norm === 'full_time_probationary') return 'Full-Time Probationary';
  if (norm === 'part_time') return 'Part-Time';
  return 'Full-Time Regular';
}

export function isFullTimeType(type) {
  return normaliseEmploymentType(type).startsWith('full_time');
}

export function getAllowedTeachingHours(type, term = '1st') {
  const norm = normaliseEmploymentType(type);
  const key = normaliseTermKey(term);
  if (norm === 'full_time_probationary') {
    return FULL_TIME_PROBATIONARY_HOURS[key] ?? 24;
  }
  if (norm === 'full_time_regular') {
    return FULL_TIME_REGULAR_HOURS[key] ?? 24;
  }
  return PART_TIME_CEILING_HOURS;
}

/**
 * Calculate consultation hours and office hours cascade deduction for Full-Time faculty:
 * - 6 consultation hours standard allocation
 * - Off-campus: 2.5h (1st term), 5.5h (2nd & 3rd term)
 * - Office: 7.5h (1st term), 8.5h (2nd & 3rd term)
 * - Overload cascade rule:
 *   1. Overload hours must first be deducted from allocated office hours.
 *   2. If overload exceeds available office hours, the remaining excess must then
 *      be deducted from the standard 6.0 consultation hours.
 *   3. If excess overload exceeds 6.0 hours, consultation is clamped to 0.0h and flagged.
 */
export function calculateConsultationWorkload(term = '1st', type = 'full_time_regular', actualOverload = 0) {
  const normTerm = normaliseTermKey(term);
  const normType = normaliseEmploymentType(type);
  if (!isFullTimeType(normType)) {
    return {
      standardConsultation: 0,
      adjustedConsultation: 0,
      allocatedOffice: 0,
      remainingOffice: 0,
      deductedFromOffice: 0,
      deductedFromConsultation: 0,
      excessOverload: 0,
      maxOverload: 0,
      overloadDifference: 0,
      policyReviewFlag: false,
      flagReason: null,
    };
  }

  const stdConsultation = CONSULTATION_HOURS[normTerm] ?? 6.0;
  const allocOffice = ALLOCATED_OFFICE_HOURS[normTerm] ?? 8.5;
  const overload = Math.max(0, Number(actualOverload) || 0);

  // Step 1: Overload hours must first be deducted from allocated office hours
  const deductedFromOffice = Math.min(allocOffice, overload);
  const remainingOffice = Number((allocOffice - deductedFromOffice).toFixed(2));

  // Step 2: If overload exceeds office hours, remaining excess is deducted from consultation
  const excessOverload = Number(Math.max(0, overload - allocOffice).toFixed(2));
  const deductedFromConsultation = Math.min(stdConsultation, excessOverload);
  const remainingConsultation = Number(Math.max(0, stdConsultation - excessOverload).toFixed(2));

  // Step 3: Flag if excess overload exceeds consultation hours
  const policyReviewFlag = excessOverload > stdConsultation;
  const flagReason = policyReviewFlag
    ? `Overload (${overload.toFixed(1)}h) exceeds available office (${allocOffice.toFixed(1)}h) and consultation (${stdConsultation.toFixed(1)}h) hours.`
    : null;

  return {
    standardConsultation: stdConsultation,
    adjustedConsultation: remainingConsultation,
    allocatedOffice: allocOffice,
    remainingOffice: remainingOffice,
    deductedFromOffice: Number(deductedFromOffice.toFixed(2)),
    deductedFromConsultation: Number(deductedFromConsultation.toFixed(2)),
    excessOverload,
    maxOverload: allocOffice,
    overloadDifference: remainingOffice,
    policyReviewFlag,
    flagReason,
  };
}

/**
 * Full-time 40-hour work week breakdown including office and consultation overload cascade adjustments.
 */
export function getWorkWeekBreakdown(term = '1st', type = 'full_time_regular', actualOverload = 0) {
  const normTerm = normaliseTermKey(term);
  const normType = normaliseEmploymentType(type);
  if (!isFullTimeType(normType)) return null;

  const baseTeaching = getAllowedTeachingHours(normType, normTerm);
  const offCampus = OFF_CAMPUS_HOURS[normTerm] ?? 5.5;
  const consultInfo = calculateConsultationWorkload(normTerm, normType, actualOverload);
  const overload = Math.max(0, Number(actualOverload) || 0);
  const teaching = Number((baseTeaching + overload).toFixed(2));

  return {
    term: normTerm,
    teaching_hours: teaching,
    base_teaching_hours: baseTeaching,
    off_campus_hours: offCampus,
    consultation_hours: consultInfo.adjustedConsultation,
    standard_consultation_hours: consultInfo.standardConsultation,
    adjusted_consultation_hours: consultInfo.adjustedConsultation,
    office_hours: consultInfo.remainingOffice,
    allocated_office_hours: consultInfo.allocatedOffice,
    deducted_from_office: consultInfo.deductedFromOffice,
    deducted_from_consultation: consultInfo.deductedFromConsultation,
    excess_overload_hours: consultInfo.excessOverload,
    max_overload_hours: consultInfo.maxOverload,
    actual_overload_hours: overload,
    overload_difference: consultInfo.overloadDifference,
    policy_review_flag: consultInfo.policyReviewFlag,
    flag_reason: consultInfo.flagReason,
    total_hours: TOTAL_WORK_WEEK_HOURS,
  };
}

export function formatHours(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '—';
  }
  return Number(value).toFixed(2);
}

export function formatMinutesLabel(minutes) {
  const mins = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function isCombinedCSubject(subject) {
  if (!subject) return false;
  if (subject.is_combined_c === true) return true;
  const cleanCode = String(subject.code || '').replace(/\s+/g, '').toUpperCase();
  if (/^.*[0-9][_-]?C$/.test(cleanCode)) return true;
  const subType = String(subject.type || '').trim().toLowerCase();
  return subType === 'c' || subType === 'combined' || subType === 'lec_lab' || subType === 'lec/lab';
}

export function isLabBSubject(subject) {
  if (!subject || isCombinedCSubject(subject)) return false;
  const cleanCode = String(subject.code || '').replace(/\s+/g, '').toUpperCase();
  const subType = String(subject.type || '').trim().toLowerCase();
  const lecUnits = Number(subject.lec_units || 0);
  const labUnits = Number(subject.lab_units || 0);
  if (subType === 'lab' || subType === 'computer_lab') return true;
  if (/^.*[0-9][_-]?B$/.test(cleanCode)) return true;
  if (labUnits > 0 && lecUnits === 0) return true;
  return false;
}

/**
 * Compute exact weekly teaching minutes for a subject according to the panelist rules:
 * - Genuine Combined (C): 3 units = 240 min (4h)
 * - Separate Lecture (A) + Lab (B) on same subject: lec_units * 80 + lab_units * 240
 *   (e.g. 2u Lec + 1u Lab = 160 + 240 = 400 min = 6h 40m)
 * - Laboratory (B): 1u = 240 min (4h), 2u = 480 min (8h)
 * - Lecture (A): 1u = 80 min (1h 20m), 2u = 160 min (2h 40m), 3u = 240 min (4h)
 */
export function computeSubjectMinutes(subject) {
  if (!subject) return 0;
  if (Number.isFinite(Number(subject.required_minutes)) && Number(subject.required_minutes) > 0) {
    return Math.round(Number(subject.required_minutes));
  }

  const totalUnits = Number(subject.units || 0);
  const lecUnits = Number(subject.lec_units || 0);
  const labUnits = Number(subject.lab_units || 0);

  if (isCombinedCSubject(subject)) {
    const effUnits = totalUnits > 0 ? totalUnits : (lecUnits + labUnits > 0 ? lecUnits + labUnits : 3);
    return effUnits === 3 ? 240 : Math.round((effUnits / 3) * 240);
  }

  if (lecUnits > 0 && labUnits > 0) {
    return lecUnits * 80 + labUnits * 240;
  }

  if (isLabBSubject(subject)) {
    const effLab = labUnits > 0 ? labUnits : (totalUnits > 0 ? totalUnits : 1);
    return effLab * 240;
  }

  const effLec = lecUnits > 0 ? lecUnits : (totalUnits > 0 ? totalUnits : 3);
  return effLec * 80;
}

export function computeSubjectHours(subject) {
  if (!subject) return 0;
  if (Number.isFinite(Number(subject.required_hours)) && Number(subject.required_hours) > 0) {
    return Number(Number(subject.required_hours).toFixed(2));
  }
  const mins = computeSubjectMinutes(subject);
  return Number((mins / 60).toFixed(2));
}
