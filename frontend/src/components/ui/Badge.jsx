import { resolveDepartment } from './tokens';
import { formatHours } from '../../utils/load';

/**
 * ATLAS status badge. Phase 1 §1.2.
 *
 * Six statuses, each carrying a fill AND a glyph — never colour alone, so the
 * state survives greyscale printing and colour vision deficiency.
 *
 * Only `draft`, `published`, and `conflict` are backed by the data model today
 * (Schedule.status is draft|published; conflicts are their own table). The
 * other three are specified and styled but dormant until the model gains them —
 * see the Phase 2 decision to ship two-state publishing first.
 */

const STATUSES = {
  draft: {
    label: 'Draft',
    glyph: '○',
    className: 'border border-atlas-line bg-transparent text-atlas-slate',
  },
  review: {
    label: 'For Review',
    glyph: '◐',
    className: 'bg-sem-info-bg text-sem-info',
  },
  approved: {
    label: 'Approved',
    glyph: '✓',
    className: 'bg-atlas-100 text-atlas-700',
  },
  // The only green-900 fill in the system. It is the seal, which is why gold
  // is reserved for it — gold is legal on green-900 (5.97) and nowhere else.
  published: {
    label: 'Published',
    glyph: '✦',
    className: 'bg-atlas-900 text-white',
    glyphClassName: 'text-atlas-gold',
  },
  conflict: {
    label: 'Conflict',
    glyph: '▲',
    className: 'bg-sem-conflict-bg text-sem-conflict',
  },
  archived: {
    label: 'Archived',
    glyph: '—',
    className: 'border border-atlas-line bg-transparent text-atlas-slate opacity-60',
  },
};

export default function Badge({ status, label, className = '' }) {
  const s = STATUSES[status] || STATUSES.draft;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 h-6 rounded-marker font-ui text-caption font-medium ${s.className} ${className}`}
    >
      <span aria-hidden="true" className={s.glyphClassName || ''}>
        {s.glyph}
      </span>
      {label || s.label}
    </span>
  );
}

/**
 * Department mark. A 3px rule plus the code — the hue is never alone.
 * Unregistered codes (DEPT_7) render neutral so orphaned workspaces are
 * visible rather than disguised as a real department (audit finding INV-00).
 */
export function DepartmentMark({ code, showName = false, className = '' }) {
  const d = resolveDepartment(code);
  return (
    <span className={`inline-flex items-center gap-2 font-ui text-body ${className}`}>
      <span
        aria-hidden="true"
        className="inline-block w-[3px] h-4 rounded-sm shrink-0"
        style={{ backgroundColor: d.hue }}
      />
      <span className="text-atlas-ink">{d.code}</span>
      {showName && <span className="text-atlas-slate text-caption">{d.name}</span>}
    </span>
  );
}

/**
 * Teaching load, in REG. HOURS per week.
 *
 * Load is hours off the plotted schedule (class duration × meetings per week),
 * not subject units — a bare number means nothing without the required figure,
 * which comes from the term (1st = 24 hrs/week, 2nd and 3rd = 20) and not from
 * a per-faculty setting.
 *
 * `required` is null for a Part-Time member: the institution has not confirmed
 * their figures, so there is nothing to be under. They get the actual hours and
 * a warning only once they reach the 20 hrs/week they must stay below. A null
 * required is never rendered as 0, which would report every part-timer as
 * overloaded. Status is carried by text and glyph, never colour alone.
 */
export function LoadMeter({
  used = 0,
  required = null,
  status = null,
  ceiling = null,
  overCeiling = false,
  className = '',
}) {
  // Without an active term there is no schedule to measure and no required
  // figure to measure it against, so a "0.00 hrs" reading would be a fact about
  // ATLAS's configuration dressed up as a fact about the faculty member.
  if (status === 'NO_ACTIVE_TERM') {
    return (
      <span className={`font-data text-table tabular-nums text-atlas-slate ${className}`}>
        —<span className="sr-only">no active term, teaching load unavailable</span>
      </span>
    );
  }

  const hasTarget = required !== null && required !== undefined && required > 0;
  const over = status === 'OVERLOAD' || overCeiling;
  const under = status === 'UNDERLOAD';
  const notPlotted = status === 'NOT_PLOTTED';

  // With no target, the bar is measured against the Part-Time ceiling so it
  // still means something; with neither, there is nothing to fill against.
  const scale = hasTarget ? required : ceiling;
  const pct = scale > 0 ? Math.min(100, (used / scale) * 100) : 0;

  const barColour = over
    ? 'var(--sem-warning)'
    : under || notPlotted
      ? 'var(--atlas-slate)'
      : 'var(--atlas-green-700)';

  const textClass = over
    ? 'text-sem-warning'
    : under || notPlotted
      ? 'text-atlas-slate'
      : 'text-atlas-ink';

  const spoken = notPlotted
    ? 'subjects assigned but the timetable has not been generated yet'
    : hasTarget
      ? `${formatHours(used)} of ${formatHours(required)} required hours per week`
      : `${formatHours(used)} hours per week, no required load set`;

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span
        className="inline-block w-20 h-1.5 rounded-full bg-atlas-line overflow-hidden shrink-0"
        aria-hidden="true"
      >
        <span
          className="block h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: barColour }}
        />
      </span>
      <span className={`font-data text-table tabular-nums ${textClass}`}>
        {formatHours(used)}
        {hasTarget ? ` / ${formatHours(required)}` : ''} hrs
      </span>
      {over && <span className="text-sem-warning" aria-hidden="true">▲</span>}
      <span className="sr-only">
        {spoken}
        {status && !notPlotted ? `, ${status.toLowerCase()}` : ''}
        {overCeiling ? ', at or above the part-time ceiling' : ''}
      </span>
    </span>
  );
}

/**
 * The load verdict as a word. Kept separate from the meter so a table can show
 * the figure in one column and the standing in another.
 */
export function LoadStatusBadge({ status = null, overCeiling = false, className = '' }) {
  // NOT_PLOTTED and NO_ACTIVE_TERM describe how far the term's planning has
  // got, not the faculty member, so they are worded as instructions to the
  // chair rather than as verdicts. They are checked before the ceiling because
  // a part-timer with nothing plotted cannot be at any ceiling.
  if (status === 'NO_ACTIVE_TERM') {
    return (
      <span className={`font-ui text-caption text-atlas-slate ${className}`}>
        NO ACTIVE TERM
      </span>
    );
  }
  if (status === 'NOT_PLOTTED') {
    return (
      <span className={`font-ui text-caption text-atlas-slate ${className}`}>
        NOT YET PLOTTED
      </span>
    );
  }
  if (overCeiling) {
    return (
      <span className={`inline-flex items-center gap-1 font-ui text-caption text-sem-warning ${className}`}>
        <span aria-hidden="true">▲</span> AT PART-TIME CEILING
      </span>
    );
  }
  if (!status) {
    // A part-timer under the ceiling has no verdict to give, and inventing one
    // would put a figure the institution has not confirmed on screen.
    return (
      <span className={`font-ui text-caption text-atlas-slate ${className}`}>
        NO REQUIRED LOAD
      </span>
    );
  }

  const tone = {
    OVERLOAD: 'text-sem-warning',
    UNDERLOAD: 'text-atlas-slate',
    REGULAR: 'text-atlas-green-700',
  }[status] || 'text-atlas-ink';

  const glyph = { OVERLOAD: '▲', UNDERLOAD: '▽', REGULAR: '✓' }[status] || '';

  return (
    <span className={`inline-flex items-center gap-1 font-ui text-caption ${tone} ${className}`}>
      <span aria-hidden="true">{glyph}</span> {status}
    </span>
  );
}
