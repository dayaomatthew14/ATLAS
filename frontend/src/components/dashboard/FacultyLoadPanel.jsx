import { useMemo } from 'react';
import { Users } from 'lucide-react';
import { Panel } from '../ui/Page';
import { formatHours, PART_TIME_CEILING_HOURS } from '../../utils/load';
import { pluralize } from '../ui/tokens';

/**
 * Who is carrying how much.
 *
 * Teaching load is the thing a chair is answerable for, and until now the only
 * way to see it was to open Faculty and read a table row by row. That works for
 * checking one person and fails at the question that actually matters: is the
 * load spread fairly, and is anyone over?
 *
 * Sorted by how far each member sits from where they should be, so whoever
 * needs attention is at the top rather than wherever the alphabet put them. A
 * chair with twenty faculty sees the two that matter without scrolling.
 */

const isPartTime = (f) => f.type === 'part_time' || f.type === 'Part-Time';

/** The figure this person is measured against, and what to call it. */
const targetOf = (f) => {
  if (isPartTime(f)) return { value: f.part_time_ceiling_hours || PART_TIME_CEILING_HOURS, kind: 'ceiling' };
  return { value: f.required_hours || 0, kind: 'required' };
};

export default function FacultyLoadPanel({ faculty = [] }) {
  const rows = useMemo(() => {
    const mapped = faculty.map((f) => {
      const used = Number(f.reg_hours) || 0;
      const { value: target, kind } = targetOf(f);
      const pct = target > 0 ? Math.min(100, (used / target) * 100) : 0;
      const over = f.exceeds_part_time_ceiling || f.load_status === 'OVERLOAD' || (target > 0 && used > target);
      const under = f.load_status === 'UNDERLOAD';
      const notPlotted = f.load_status === 'NOT_PLOTTED' || used === 0;

      return {
        id: f.id,
        name: f.name || `${f.first_name || ''} ${f.last_name || ''}`.trim() || 'Faculty',
        used, target, kind, pct, over, under, notPlotted,
        // Distance from the target, so the sort surfaces the outliers.
        distance: target > 0 ? Math.abs(used - target) / target : 0,
      };
    });

    return mapped
      .sort((a, b) => {
        // Over the line first, then furthest from target, then by name.
        if (a.over !== b.over) return a.over ? -1 : 1;
        if (b.distance !== a.distance) return b.distance - a.distance;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 8);
  }, [faculty]);

  const overCount = rows.filter((r) => r.over).length;

  return (
    <Panel
      className="rise"
      style={{ animationDelay: '240ms' }}
      icon={Users}
      accent={overCount > 0 ? 'warning' : undefined}
      title="Teaching load"
      description="Weekly REG. hours against what each member should carry."
    >
      {rows.length === 0 ? (
        <p className="px-6 py-12 font-ui text-body text-atlas-slate text-center">
          No faculty yet. Add your college&rsquo;s professors to see their load here.
        </p>
      ) : (
        <ul className="p-6 pt-5 flex flex-col gap-4">
          {rows.map((r, i) => (
            <li key={r.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-ui text-caption font-medium text-atlas-ink truncate min-w-0">
                  {r.name}
                </span>
                <span className={`font-data text-caption tabular-nums shrink-0 ${
                  r.over ? 'text-sem-warning' : r.notPlotted ? 'text-atlas-disabled' : 'text-atlas-slate'
                }`}>
                  {formatHours(r.used)}
                  {r.target > 0 && (
                    <span className="text-atlas-disabled">
                      {r.kind === 'ceiling' ? ' / under ' : ' / '}{formatHours(r.target)}
                    </span>
                  )}
                </span>
              </div>

              <div className="mt-1.5 h-2 rounded-full bg-atlas-line/70 overflow-hidden">
                <span
                  className={`bar-grow block h-full rounded-full ${
                    r.over ? 'bg-sem-warning'
                      : r.notPlotted ? 'bg-atlas-disabled/50'
                        : r.under ? 'bg-atlas-300'
                          : 'bg-atlas-700'
                  }`}
                  style={{ width: `${r.pct}%`, '--d': i }}
                />
              </div>

              {(r.over || r.notPlotted) && (
                <p className={`font-ui text-micro uppercase mt-1.5 ${
                  r.over ? 'text-sem-warning' : 'text-atlas-disabled'
                }`}>
                  {r.over
                    ? (r.kind === 'ceiling' ? 'At the part-time ceiling' : 'Over required load')
                    : 'Not yet plotted'}
                </p>
              )}
            </li>
          ))}

          {faculty.length > rows.length && (
            <li className="font-ui text-caption text-atlas-slate pt-1">
              {pluralize(faculty.length - rows.length, 'other member')} not shown — the
              furthest from target are listed first.
            </li>
          )}
        </ul>
      )}
    </Panel>
  );
}
