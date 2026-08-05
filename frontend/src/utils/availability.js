/**
 * Availability time model.
 *
 * The half-hour cell grid the availability editor manipulates, and the
 * conversion to and from the {day_of_week, start_time, end_time} blocks the API
 * stores. Extracted from UnavailabilityGrid.jsx: these are pure functions with
 * no rendering, and Teachers.jsx imports them without needing the component.
 */

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// 07:30-19:30, matching schedule_generator's slot range.
export const START_MINUTES = 7 * 60 + 30;
export const SLOT_COUNT = 24; // 12 hours in half-hour steps

export const slotMinutes = (i) => START_MINUTES + i * 30;
export const toHHMM = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
export const cellKey = (day, i) => `${day}-${i}`;

export const label12h = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${period}`;
};

/** Blocks from the API -> the cell Set the editor works on. */
export function blocksToCells(blocks = []) {
  const cells = new Set();
  blocks.forEach((b) => {
    const day = String(b.day_of_week || '').substring(0, 3);
    if (!DAYS.includes(day)) return;
    const [sh, sm] = String(b.start_time).split(':').map(Number);
    const [eh, em] = String(b.end_time).split(':').map(Number);
    const from = sh * 60 + sm;
    const to = eh * 60 + em;
    for (let i = 0; i < SLOT_COUNT; i += 1) {
      const t = slotMinutes(i);
      if (t >= from && t < to) cells.add(cellKey(day, i));
    }
  });
  return cells;
}

/** The cell Set -> contiguous blocks for the API. */
export function cellsToBlocks(cells) {
  const blocks = [];
  DAYS.forEach((day) => {
    let runStart = null;
    for (let i = 0; i <= SLOT_COUNT; i += 1) {
      const filled = i < SLOT_COUNT && cells.has(cellKey(day, i));
      if (filled && runStart === null) runStart = i;
      if (!filled && runStart !== null) {
        blocks.push({
          day_of_week: day,
          start_time: `${toHHMM(slotMinutes(runStart))}:00`,
          end_time: `${toHHMM(slotMinutes(i))}:00`,
        });
        runStart = null;
      }
    }
  });
  return blocks;
}
