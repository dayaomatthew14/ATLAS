import React from 'react';
import { focusRing } from './tokens';
import { DAYS, SLOT_COUNT, slotMinutes, cellKey, label12h } from '../../utils/availability';
/**
 * Weekly unavailability editor. Phase 2 Screen 6.
 *
 * Replaces a day dropdown plus two time fields, one block at a time. Uses the
 * same time axis and --tt-hour tokens as the schedule grid so the two surfaces
 * read as the same instrument.
 *
 * Keyboard-complete by design: pointer drag is the primary interaction, so it
 * cannot be the only one. Arrow keys move, Space toggles, Shift+Arrow extends.
 *
 * Model: a Set of "Day-HHMM" half-hour cell keys, converted to contiguous
 * {day_of_week, start_time, end_time} blocks on save.
 */

export default function UnavailabilityGrid({ cells, onChange, disabled = false }) {
  const [focus, setFocus] = React.useState({ day: 0, slot: 0 });
  const [dragging, setDragging] = React.useState(null); // 'add' | 'remove'
  const gridRef = React.useRef(null);

  React.useEffect(() => {
    if (!dragging) return;
    const stop = () => setDragging(null);
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, [dragging]);

  const isOn = (day, slot) => cells.has(cellKey(DAYS[day], slot));

  const apply = (day, slot, mode) => {
    if (disabled) return;
    const key = cellKey(DAYS[day], slot);
    const next = new Set(cells);
    if (mode === 'add') next.add(key);
    else next.delete(key);
    onChange(next);
  };

  const toggle = (day, slot) => apply(day, slot, isOn(day, slot) ? 'remove' : 'add');

  const onKeyDown = (e) => {
    if (disabled) return;
    const { day, slot } = focus;
    let next = null;

    if (e.key === 'ArrowRight') next = { day: Math.min(day + 1, DAYS.length - 1), slot };
    else if (e.key === 'ArrowLeft') next = { day: Math.max(day - 1, 0), slot };
    else if (e.key === 'ArrowDown') next = { day, slot: Math.min(slot + 1, SLOT_COUNT - 1) };
    else if (e.key === 'ArrowUp') next = { day, slot: Math.max(slot - 1, 0) };
    else if (e.key === 'Home') next = { day, slot: 0 };
    else if (e.key === 'End') next = { day, slot: SLOT_COUNT - 1 };
    else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggle(day, slot);
      return;
    } else {
      return;
    }

    e.preventDefault();
    // Shift+Arrow paints while moving, so a range can be marked without a mouse.
    if (e.shiftKey) apply(next.day, next.slot, isOn(day, slot) ? 'add' : 'remove');
    setFocus(next);
    gridRef.current
      ?.querySelector(`[data-cell="${cellKey(DAYS[next.day], next.slot)}"]`)
      ?.focus();
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2" ref={gridRef} onKeyDown={onKeyDown}>
        {/* Time axis */}
        <div className="w-16 shrink-0 pt-6" aria-hidden="true">
          {Array.from({ length: SLOT_COUNT }).map((_, i) =>
            i % 2 === 0 ? (
              <div
                key={i}
                className="font-data text-caption text-atlas-slate text-right pr-2 leading-none"
                style={{ height: 'calc(var(--tt-halfhour) * 2)' }}
              >
                {label12h(slotMinutes(i))}
              </div>
            ) : null
          )}
        </div>

        <div
          role="grid"
          aria-label="Weekly unavailability"
          aria-readonly={disabled || undefined}
          className="flex-1 grid"
          style={{ gridTemplateColumns: `repeat(${DAYS.length}, minmax(0, 1fr))` }}
        >
          {DAYS.map((day) => (
            <div key={day} role="row" className="flex flex-col">
              <div className="h-6 flex items-center justify-center font-ui text-micro uppercase text-atlas-slate">
                {day}
              </div>
              {Array.from({ length: SLOT_COUNT }).map((_, i) => {
                const on = cells.has(cellKey(day, i));
                const dayIndex = DAYS.indexOf(day);
                const isFocusCell = focus.day === dayIndex && focus.slot === i;
                return (
                  <button
                    key={i}
                    type="button"
                    role="gridcell"
                    data-cell={cellKey(day, i)}
                    aria-selected={on}
                    disabled={disabled}
                    // Roving tabindex: one stop for the whole grid.
                    tabIndex={isFocusCell ? 0 : -1}
                    onFocus={() => setFocus({ day: dayIndex, slot: i })}
                    onMouseDown={() => {
                      const mode = on ? 'remove' : 'add';
                      setDragging(mode);
                      apply(dayIndex, i, mode);
                    }}
                    onMouseEnter={() => { if (dragging) apply(dayIndex, i, dragging); }}
                    className={[
                      'w-full border-b border-r border-atlas-line transition-colors duration-state ease-standard',
                      i % 2 === 1 ? 'border-b-atlas-line' : 'border-b-transparent',
                      on ? 'bg-sem-warning' : 'bg-atlas-surface hover:bg-white/85',
                      disabled ? 'cursor-not-allowed' : 'cursor-pointer',
                      focusRing,
                    ].join(' ')}
                    style={{ height: 'var(--tt-halfhour)' }}
                  >
                    <span className="sr-only">
                      {on ? 'Unavailable' : 'Available'}, {day} {label12h(slotMinutes(i))}.
                      {disabled ? '' : on ? ' Press Space to clear.' : ' Press Space to mark unavailable.'}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <p className="font-ui text-caption text-atlas-slate">
        Click and drag to mark unavailable time, or use the arrow keys and Space.
        Hold Shift with an arrow key to extend a range.
      </p>
    </div>
  );
}
