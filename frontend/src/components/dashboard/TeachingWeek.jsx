import { useMemo, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { Panel } from '../ui/Page';
import { pluralize } from '../ui/tokens';

/**
 * The term's shape, as one grid.
 *
 * A chair can already read any single class from the Schedule screen. What no
 * screen answered was the question they are actually judged on: is this week
 * balanced? Six numbers on tiles cannot show that everything landed on Monday
 * morning and Friday is empty, or that a college is running classes at 5:30pm
 * because the earlier slots filled up. A density grid shows it before a word
 * has been read.
 *
 * The bands are the generator's own laboratory slots (schedule_generator.py,
 * LAB_SLOTS), so a cell is a real placement boundary rather than a decorative
 * bucket -- what you see here is where classes can actually go.
 */

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LABEL = {
  Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday',
  Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday',
};

const BANDS = [
  { label: '7:30', from: 7.5, to: 9.5 },
  { label: '9:30', from: 9.5, to: 11.5 },
  { label: '11:30', from: 11.5, to: 13.5 },
  { label: '1:30', from: 13.5, to: 15.5 },
  { label: '3:30', from: 15.5, to: 17.5 },
  { label: '5:30', from: 17.5, to: 19.5 },
];

/** The API writes either "Mon" or "Monday" depending on the path that saved it. */
const dayKey = (value) => String(value || '').slice(0, 3);

const hoursOf = (t) => {
  const [h, m] = String(t || '').split(':').map(Number);
  if (!Number.isFinite(h)) return null;
  return h + (Number.isFinite(m) ? m / 60 : 0);
};

export default function TeachingWeek({ schedules = [] }) {
  const [hovered, setHovered] = useState(null);

  const { grid, busiest, total, emptyDays } = useMemo(() => {
    const g = DAYS.map(() => BANDS.map(() => 0));
    let counted = 0;

    schedules.forEach((s) => {
      const d = DAYS.indexOf(dayKey(s.day_of_week || s.dayOfWeek));
      if (d < 0) return;
      const start = hoursOf(s.start_time || s.startTime);
      if (start === null) return;
      // A class belongs to the band its start time falls in; anything before
      // the teaching day is clamped into the first so it is never invisible.
      let b = BANDS.findIndex((band) => start >= band.from && start < band.to);
      if (b < 0) b = start < BANDS[0].from ? 0 : BANDS.length - 1;
      g[d][b] += 1;
      counted += 1;
    });

    const peak = Math.max(1, ...g.flat());
    return {
      grid: g,
      busiest: peak,
      total: counted,
      emptyDays: DAYS.filter((_, i) => g[i].every((n) => n === 0)),
    };
  }, [schedules]);

  return (
    <Panel
      className="lg:col-span-2 rise"
      style={{ animationDelay: '180ms' }}
      icon={CalendarRange}
      accent
      title="Your teaching week"
      description="Where this term's classes actually sit, across the six teaching days."
      action={
        total > 0 ? (
          <span className="font-ui text-caption text-atlas-slate shrink-0 tabular-nums">
            {pluralize(total, 'class', 'classes')}
          </span>
        ) : null
      }
    >
      {total === 0 ? (
        <p className="px-6 py-12 font-ui text-body text-atlas-slate text-center">
          Nothing is plotted yet. Generate the timetable and the week fills in here.
        </p>
      ) : (
        <div className="p-6">
          <div className="flex gap-2">
            {/* Time gutter */}
            <div className="flex flex-col gap-1.5 pt-7 shrink-0">
              {BANDS.map((b) => (
                <span
                  key={b.label}
                  className="h-9 flex items-center justify-end font-data text-micro text-atlas-slate tabular-nums pr-1"
                >
                  {b.label}
                </span>
              ))}
            </div>

            <div className="flex-1 min-w-0 grid grid-cols-6 gap-1.5">
              {DAYS.map((day, d) => (
                <div key={day} className="flex flex-col gap-1.5 min-w-0">
                  <span className="h-7 flex items-center justify-center font-ui text-micro uppercase text-atlas-slate">
                    <abbr title={DAY_LABEL[day]} className="no-underline">{day}</abbr>
                  </span>
                  {BANDS.map((band, b) => {
                    const n = grid[d][b];
                    // Opacity carries the count, so density reads as weight
                    // rather than as a palette nobody has been taught.
                    const strength = n === 0 ? 0 : 0.18 + (n / busiest) * 0.82;
                    const isHot = n > 0;
                    return (
                      <span
                        key={band.label}
                        className={`cell-in h-9 rounded-field border flex items-center justify-center
                                    font-data text-caption tabular-nums transition-transform duration-state
                                    ease-standard ${isHot
                                      ? 'border-transparent text-white hover:scale-105 motion-reduce:hover:scale-100 cursor-default'
                                      : 'border-atlas-line bg-atlas-canvas text-transparent'}`}
                        style={{
                          '--d': d + b,
                          backgroundColor: isHot
                            ? `rgb(var(--atlas-green-700-rgb) / ${strength})`
                            : undefined,
                        }}
                        onMouseEnter={() => isHot && setHovered({ day, band, n })}
                        onMouseLeave={() => setHovered(null)}
                        title={
                          isHot
                            ? `${DAY_LABEL[day]} from ${band.label} — ${pluralize(n, 'class', 'classes')}`
                            : `${DAY_LABEL[day]} from ${band.label} — free`
                        }
                      >
                        {isHot ? n : '0'}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* One line of plain reading, so the picture is never the only output. */}
          <p className="font-ui text-caption text-atlas-slate mt-4 leading-relaxed" aria-live="polite">
            {hovered
              ? `${DAY_LABEL[hovered.day]} from ${hovered.band.label} — ${pluralize(hovered.n, 'class', 'classes')}.`
              : emptyDays.length > 0
                ? `Nothing is scheduled on ${emptyDays.map((d) => DAY_LABEL[d]).join(', ')}. Darker cells carry more classes.`
                : 'Every teaching day is in use. Darker cells carry more classes.'}
          </p>
        </div>
      )}
    </Panel>
  );
}
