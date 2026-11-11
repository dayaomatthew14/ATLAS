import { Trash2 } from 'lucide-react';
import { formatSubjectCode, isLabSession, to12h } from '../../utils/scheduleHelpers';

/**
 * One class in the by-professor board.
 * Laid out to be read rather than to fit: subject name wraps in full, time
 * range gets its own line, and delete triggers on click or keyboard Delete.
 */
export default function ClassCard({ sched, color, dayLabel, lensDim, lensLit, canManage, onDelete }) {
  const code = formatSubjectCode(sched);
  const label =
    `${code}, ${sched.subject_name}, ${dayLabel} ` +
    `${to12h(sched.start_time)} to ${to12h(sched.end_time)}` +
    (sched.section ? `, Section ${sched.section}` : '') +
    (canManage ? '. Press Delete to remove this class.' : '');

  return (
    <div
      role="button"
      tabIndex={lensDim ? -1 : 0}
      aria-hidden={lensDim || undefined}
      aria-label={label}
      onKeyDown={(e) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && canManage) {
          e.preventDefault();
          onDelete(sched);
        }
      }}
      style={{
        backgroundColor: color.bg,
        borderColor: color.border,
      }}
      className={`print-block group relative rounded-2xl border p-4 shadow-xs hover:shadow-lg transition-all duration-200 overflow-hidden
                  focus-visible:outline-none
                  focus-visible:ring-2 focus-visible:ring-[#375534] focus-visible:ring-offset-2
                  ${lensDim ? 'lens-dimmed' : ''} ${lensLit ? 'lens-conflict' : ''}`}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-[5px] rounded-l-md pointer-events-none transition-all group-hover:w-[6px]"
        style={{ backgroundColor: color.accent }}
      />

      {lensLit && (
        <span className="absolute top-2 right-2 text-rose-600 font-extrabold text-sm z-10" aria-hidden="true">
          ▲
        </span>
      )}

      <div className="flex items-start justify-between gap-2 pl-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="font-mono text-caption font-bold px-2 py-0.5 rounded shadow-2xs"
            style={{ backgroundColor: color.badgeBg, color: color.badgeText }}
          >
            {code}
          </span>
          <span
            className={`font-mono text-[9.5px] font-extrabold px-1.5 py-0.5 rounded shadow-2xs ${
              isLabSession(sched)
                ? 'bg-amber-100 text-amber-900 border border-amber-300/80'
                : 'bg-emerald-100 text-emerald-900 border border-emerald-300/80'
            }`}
          >
            {isLabSession(sched) ? 'LAB' : 'LEC'}
          </span>
          {sched.section && (
            <span className="font-mono text-caption font-semibold text-[#375534]">
              Sec {sched.section}
            </span>
          )}
        </div>
        {canManage && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(sched);
            }}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 -m-1 shrink-0 text-slate-400
                       hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all no-print"
            aria-label={`Delete ${code} on ${dayLabel}`}
            title="Delete this class"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <h4
        className="mt-2 pl-1.5 font-ui text-body font-bold leading-snug break-words"
        style={{ color: color.title }}
      >
        {sched.subject_name}
      </h4>

      <div className="mt-3 pt-2.5 border-t border-[#AEC3B0]/30 pl-1.5 flex items-center">
        <span
          className="font-data text-caption font-bold tabular-nums whitespace-nowrap"
          style={{ color: color.time }}
        >
          {to12h(sched.start_time)} – {to12h(sched.end_time)}
        </span>
      </div>
    </div>
  );
}

