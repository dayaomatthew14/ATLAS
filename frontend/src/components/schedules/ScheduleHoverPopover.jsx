import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AlertTriangle, Clock, MapPin, Trash2, User } from 'lucide-react';
import { DAY_LABEL, durationHours, formatSubjectCode, to12h } from '../../utils/scheduleHelpers';
import { ctTierShortLabel } from '../../utils/load';

function getPopoverStyle(rect) {
  if (!rect) return { display: 'none' };
  const popoverWidth = 300;
  const popoverHeight = 250;
  const padding = 12;

  let left = rect.right + 12;
  if (left + popoverWidth > window.innerWidth - padding) {
    left = rect.left - popoverWidth - 12;
  }
  if (left < padding) {
    left = Math.max(padding, window.innerWidth - popoverWidth - padding);
  }

  let top = rect.top;
  if (top + popoverHeight > window.innerHeight - padding) {
    top = Math.max(padding, window.innerHeight - popoverHeight - padding);
  }
  if (top < padding) {
    top = padding;
  }

  return {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    width: `${popoverWidth}px`,
    zIndex: 60,
  };
}

/**
 * Floating detail preview popover shown on hover/focus of a grid schedule card.
 * Owns its own hover state and debounce timer so hovering cards never re-renders
 * the parent Schedules page or its modals.
 */
const ScheduleHoverPopover = forwardRef(function ScheduleHoverPopover(
  { canManageSchedules, onDeleteSchedule },
  ref
) {
  const [hoveredSchedule, setHoveredSchedule] = useState(null);
  const hoverTimerRef = useRef(null);

  useImperativeHandle(
    ref,
    () => ({
      show(sched, color, day, inConflict, target) {
        if (hoverTimerRef.current) {
          clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = null;
        }
        hoverTimerRef.current = setTimeout(() => {
          if (!target || !target.isConnected) return;
          const rect = target.getBoundingClientRect();
          setHoveredSchedule({ sched, color, day, rect, inConflict });
        }, 200);
      },
      scheduleHide() {
        if (hoverTimerRef.current) {
          clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = null;
        }
        hoverTimerRef.current = setTimeout(() => {
          setHoveredSchedule(null);
        }, 120);
      },
      hideNow() {
        if (hoverTimerRef.current) {
          clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = null;
        }
        setHoveredSchedule(null);
      },
    }),
    []
  );

  useEffect(() => {
    const handleScroll = () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      setHoveredSchedule((prev) => (prev ? null : prev));
    };
    window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    return () => {
      window.removeEventListener('scroll', handleScroll, { capture: true });
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  if (!hoveredSchedule) return null;

  const { sched, color, day, inConflict, rect } = hoveredSchedule;
  const dur = durationHours(sched);

  const handlePopoverMouseEnter = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  };

  const handlePopoverMouseLeave = () => {
    hoverTimerRef.current = setTimeout(() => {
      setHoveredSchedule(null);
    }, 120);
  };

  return (
    <div
      style={getPopoverStyle(rect)}
      onMouseEnter={handlePopoverMouseEnter}
      onMouseLeave={handlePopoverMouseLeave}
      className="no-print pointer-events-auto bg-white/95 rounded-2xl shadow-2xl border border-[#AEC3B0]/60 overflow-hidden z-50"
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
              onClick={() => {
                onDeleteSchedule(sched);
                setHoveredSchedule(null);
              }}
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
});

export default ScheduleHoverPopover;

