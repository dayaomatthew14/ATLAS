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
