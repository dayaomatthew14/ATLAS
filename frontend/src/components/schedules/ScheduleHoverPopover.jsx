import { AlertTriangle, Clock, MapPin, Trash2, User } from 'lucide-react';
import { DAY_LABEL, durationHours, formatSubjectCode, to12h } from '../../utils/scheduleHelpers';
import { ctTierShortLabel } from '../../utils/load';

/**
 * Floating detail preview popover shown on hover/focus of a grid schedule card.
 */
export default function ScheduleHoverPopover({
  hoveredSchedule,
  getPopoverStyle,
  onMouseEnter,
  onMouseLeave,
  canManageSchedules,
  onDeleteSchedule,
}) {
  if (!hoveredSchedule) return null;

  const { sched, color, day, inConflict, rect } = hoveredSchedule;
  const dur = durationHours(sched);

  return (
    <div
      style={getPopoverStyle(rect)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="no-print pointer-events-auto bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-[#AEC3B0]/60 overflow-hidden transition-all duration-150 animate-in fade-in zoom-in-95 z-50"
    >
      <div className="h-1.5 w-full shrink-0" style={{ backgroundColor: color.accent }} />

      <div className="p-4 space-y-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="text-[11px] font-mono font-bold px-2 py-0.5 rounded shadow-2xs"
            style={{ backgroundColor: color.badgeBg, color: color.badgeText }}
          >
            {formatSubjectCode(sched)}
          </span>
          {(sched.is_ct || (sched.ct_tier && sched.ct_tier !== 'regular')) && (
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-300">
              {ctTierShortLabel(sched.ct_tier, sched.enrolled_students)}
            </span>
          )}
          {inConflict && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-700 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
              Conflict
            </span>
          )}
        </div>

        <h4 className="font-ui text-xs font-bold text-[#0F2A1D] leading-snug break-words">
          {sched.subject_name}
        </h4>

        <div className="border-t border-[#E8EFE8] pt-2.5 space-y-2 text-xs">
          <div className="flex items-start gap-2 text-[#0F2A1D]">
            <Clock className="w-3.5 h-3.5 text-[#375534] shrink-0 mt-0.5" />
            <div className="flex flex-col">
              <span className="font-semibold text-[#0F2A1D]">{DAY_LABEL[day] || day}</span>
              <span className="font-data font-medium text-[#375534] tabular-nums">
                {to12h(sched.start_time)} – {to12h(sched.end_time)}
                {dur > 0 && (
                  <span className="ml-1 text-[11px] font-semibold text-[#6B9071]">
                    ({dur === 1 ? '1 hr' : `${dur} hrs`})
                  </span>
                )}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[#0F2A1D]">
            <User className="w-3.5 h-3.5 text-[#375534] shrink-0" />
            <span className="font-medium truncate">
              {sched.faculty_name || 'Unassigned Professor'}
            </span>
          </div>

          <div className="flex items-center gap-2 text-[#0F2A1D]">
            <MapPin className="w-3.5 h-3.5 text-[#6B9071] shrink-0" />
            <span className="font-medium truncate">
              Room: {sched.room_name || sched.room?.name || 'Assigned by Registrar'}
            </span>
          </div>

          {(sched.is_ct || (sched.ct_tier && sched.ct_tier !== 'regular')) &&
            sched.credited_hours_override != null && (
              <div className="rounded-lg bg-teal-50/90 border border-teal-200 px-2.5 py-1.5 text-[11px] text-teal-900">
                <span className="font-bold">CT Credited Load:</span>{' '}
                <span className="font-data font-bold tabular-nums">
                  {Number(sched.credited_hours_override).toFixed(
                    Number(sched.credited_hours_override) % 1 === 0 ? 0 : 2
                  )}{' '}
                  hrs/week
                </span>
              </div>
            )}
        </div>

        {canManageSchedules && (
          <div className="pt-2 border-t border-[#E8EFE8]">
            <button
              type="button"
              onClick={() => onDeleteSchedule(sched)}
              className="w-full py-1.5 px-3 rounded-xl border border-rose-200 bg-rose-50/70 hover:bg-rose-100 text-rose-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Schedule</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

