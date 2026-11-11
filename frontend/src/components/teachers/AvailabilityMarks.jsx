import { DAY_ORDER } from '../../utils/scheduleHelpers';

/**
 * Six-day week availability indicator marks (fill + strikethrough + accessible summary).
 */
export default function AvailabilityMarks({ unavailability }) {
  const blocked = new Set((unavailability || []).map((u) => u.day_of_week.substring(0, 3)));
  const blockedList = DAY_ORDER.filter((d) => blocked.has(d));

  return (
    <span
      className="inline-flex items-center gap-1"
      role="img"
      aria-label={
        blockedList.length === 0 ? 'Available every day' : `Unavailable ${blockedList.join(', ')}`
      }
    >
      {DAY_ORDER.map((day) => {
        const isBlocked = blocked.has(day);
        return (
          <span
            key={day}
            aria-hidden="true"
            className={`w-7 h-7 rounded-lg inline-flex items-center justify-center font-data text-xs font-bold shadow-2xs transition-all ${
              isBlocked
                ? 'bg-rose-50 text-rose-600 border border-rose-200/80 line-through decoration-rose-400 opacity-75'
                : 'bg-emerald-50 text-emerald-900 border border-emerald-200/80'
            }`}
          >
            {day[0]}
          </span>
        );
      })}
    </span>
  );
}
