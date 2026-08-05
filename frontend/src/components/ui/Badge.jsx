import { resolveDepartment } from './tokens';

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
 * Teaching load. Shown as used/cap because a bare number means nothing without
 * the cap — full-time caps at 18 units, part-time at 12.
 * Over-cap uses warning + glyph, never colour alone.
 */
export function LoadMeter({ used = 0, cap = 18, className = '' }) {
  const over = used > cap;
  const pct = Math.min(100, cap > 0 ? (used / cap) * 100 : 0);

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span
        className="inline-block w-20 h-1.5 rounded-full bg-atlas-line overflow-hidden shrink-0"
        aria-hidden="true"
      >
        <span
          className="block h-full rounded-full"
          style={{
            width: `${pct}%`,
            backgroundColor: over ? 'var(--sem-warning)' : 'var(--atlas-green-700)',
          }}
        />
      </span>
      <span className={`font-data text-table tabular-nums ${over ? 'text-sem-warning' : 'text-atlas-ink'}`}>
        {used} / {cap}
      </span>
      {over && (
        <span className="text-sem-warning" aria-hidden="true">▲</span>
      )}
      <span className="sr-only">
        {used} of {cap} units{over ? ', over the cap' : ''}
      </span>
    </span>
  );
}
