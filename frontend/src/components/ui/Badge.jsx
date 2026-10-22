import { AlertTriangle, TrendingDown, Check, Clock } from 'lucide-react';
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
      className={`inline-flex items-center gap-1.5 px-3 h-7 rounded-marker font-ui text-caption font-bold ${s.className} ${className}`}
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
    <span className={`inline-flex items-center gap-2 font-ui text-body font-semibold ${className}`}>
      <span
        aria-hidden="true"
        className="inline-block w-[3.5px] h-4.5 rounded-sm shrink-0"
        style={{ backgroundColor: d.hue }}
      />
      <span className="text-black font-bold">{d.code}</span>
      {showName && <span className="text-black text-caption font-medium">{d.name}</span>}
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
 */
export function LoadMeter({
  used = 0,
  required = null,
  status = null,
  ceiling = null,
  overCeiling = false,
  className = '',
  barWidth = 'w-24',
  height = 'h-2',
  showValues = true,
}) {
  if (status === 'NO_ACTIVE_TERM') {
    return (
      <span className={`font-data text-table tabular-nums text-slate-400 ${className}`}>
        —<span className="sr-only">no active term, teaching load unavailable</span>
      </span>
    );
  }

  const hasTarget = required !== null && required !== undefined && required > 0;
  const over = status === 'OVERLOAD' || overCeiling;
  const under = status === 'UNDERLOAD';
  const notPlotted = status === 'NOT_PLOTTED';

  const scale = hasTarget ? required : ceiling;
  const pct = scale > 0 ? Math.min(100, (used / scale) * 100) : 0;

  // Modern gradient and tone based on status
  let barGradient = 'from-emerald-500 to-teal-600';
  let numberColor = 'text-slate-900';
  if (over) {
    barGradient = 'from-rose-500 to-red-600';
    numberColor = 'text-rose-700';
  } else if (under) {
    barGradient = 'from-amber-400 to-amber-500';
    numberColor = 'text-amber-800';
  } else if (notPlotted) {
    barGradient = 'from-slate-300 to-slate-400';
    numberColor = 'text-slate-600';
  }

  const spoken = notPlotted
    ? 'subjects assigned but the timetable has not been generated yet'
    : hasTarget
      ? `${formatHours(used)} of ${formatHours(required)} required hours per week`
      : `${formatHours(used)} hours per week, no required load set`;

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        className={`inline-block ${barWidth} ${height} rounded-full bg-slate-100 border border-slate-200/80 shadow-inner overflow-hidden shrink-0 relative`}
        aria-hidden="true"
      >
        <span
          className={`block h-full rounded-full bg-gradient-to-r ${barGradient} transition-all duration-300`}
          style={{ width: `${Math.max(pct > 0 ? 4 : 0, pct)}%` }}
        />
      </span>
      {showValues && (
        <span className="font-ui text-sm tabular-nums whitespace-nowrap">
          <span className={`font-extrabold ${numberColor}`}>{formatHours(used)}</span>
          <span className="text-slate-500 font-semibold"> / {hasTarget ? formatHours(required) : formatHours(scale || 0)} hrs</span>
        </span>
      )}
      <span className="sr-only">
        {spoken}
        {status && !notPlotted ? `, ${status.toLowerCase()}` : ''}
        {overCeiling ? ', at or above the part-time ceiling' : ''}
      </span>
    </span>
  );
}

/**
 * The load verdict as a styled badge chip.
 */
export function LoadStatusBadge({ status = null, overCeiling = false, className = '' }) {
  if (status === 'NO_ACTIVE_TERM') {
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-bold tracking-wide uppercase bg-slate-100 text-slate-500 border border-slate-200/80 shadow-2xs ${className}`}>
        NO ACTIVE TERM
      </span>
    );
  }
  if (status === 'NOT_PLOTTED') {
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-bold tracking-wide uppercase bg-slate-100 text-slate-600 border border-slate-200/80 shadow-2xs ${className}`}>
        NOT YET PLOTTED
      </span>
    );
  }
  if (overCeiling) {
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-bold tracking-wide uppercase bg-amber-50 text-amber-800 border border-amber-200/80 shadow-2xs ${className}`}>
        AT PART-TIME CEILING
      </span>
    );
  }
  if (!status) {
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold bg-slate-50 text-slate-500 border border-slate-200/60 shadow-2xs ${className}`}>
        NO REQUIRED LOAD
      </span>
    );
  }

  if (status === 'OVERLOAD') {
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-bold tracking-wide uppercase bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs ${className}`}>
        OVERLOAD
      </span>
    );
  }

  if (status === 'UNDERLOAD') {
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-bold tracking-wide uppercase bg-amber-50 text-amber-800 border border-amber-200/90 shadow-2xs ${className}`}>
        UNDERLOAD
      </span>
    );
  }

  if (status === 'REGULAR') {
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-bold tracking-wide uppercase bg-emerald-50 text-emerald-800 border border-emerald-200/90 shadow-2xs ${className}`}>
        REGULAR LOAD
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 ${className}`}>
      {status}
    </span>
  );
}
