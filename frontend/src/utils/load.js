/**
 * Teaching-load formatting.
 *
 * Load is REG. HOURS per week -- class duration x meetings per week, off the
 * plotted schedule -- and not subject units. Hours are fractional by nature: an
 * 80-minute lecture meeting twice a week is 2.67 hrs, so they are always shown
 * to two decimals rather than rounded to whole numbers, which would lose the
 * difference between a complete load and an underload.
 */

/** Weekly hours a Part-Time faculty member must stay under. */
export const PART_TIME_CEILING_HOURS = 20;

export const formatHours = (value) =>
  Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '—';

/**
 * Teaching load hours for a subject derived from institutional lecture/lab rules.
 */
export const computeSubjectHours = (sub) => {
  if (!sub) return 0;
  const isEng = String(sub.program_code || '').toUpperCase() === 'BSCPE';
  const isLab = sub.type === 'lab' || (sub.lab_units > 0 && sub.lec_units === 0) || String(sub.code || '').toUpperCase().endsWith('B');
  const isLec = sub.type === 'lecture' || (sub.lec_units > 0 && sub.lab_units === 0) || String(sub.code || '').toUpperCase().endsWith('A');

  if (isLab) return 4.0;
  if (isLec) return isEng ? 4.0 : 2.67;

  let hours = 0;
  if (sub.lec_units > 0) hours += isEng ? 4.0 : 2.67;
  if (sub.lab_units > 0) hours += 4.0;
  if (hours > 0) return hours;

  return Number(sub.units) || 0;
};
