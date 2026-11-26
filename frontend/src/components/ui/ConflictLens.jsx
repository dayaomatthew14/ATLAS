import React from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Sliders, X } from 'lucide-react';
import Button from './Button';

/**
 * The conflict lens. Phase 1 §1.5 — the one place the system is allowed to be
 * loud, which is why everything around it stays quiet.
 *
 * When the generator returns conflicts the grid does NOT fill with red. It
 * drops to 15% opacity and only the conflicting blocks stay at full ink, drawn
 * with a diagonal hatch and a glyph so the conflict reads without relying on
 * hue — roughly 8% of men cannot depend on the red.
 *
 * This is a MODELESS dialog: it deliberately does not trap focus, because the
 * user has to reach the grid to fix anything.
 */

const TRIAGE_THRESHOLD = 20;

/** Group conflicts by cause for triage mode. */
function groupByCause(conflicts) {
  const groups = new Map();
  conflicts.forEach((c) => {
    const key = c.type || 'Conflict';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  });
  return [...groups.entries()]
    .map(([cause, items]) => ({ cause, count: items.length }))
    .sort((a, b) => b.count - a.count);
}

export default function ConflictLens({
  conflicts = [],
  isOpen,
  onClose,
  onResolve,
  onRegenerate,
  resolvingId,
  causeFilter,
  onFilterCause,
}) {
  const [index, setIndex] = React.useState(0);
  const [announcement, setAnnouncement] = React.useState('');
  const announceTimer = React.useRef(null);

  const visible = React.useMemo(
    () => (causeFilter ? conflicts.filter((c) => (c.type || 'Conflict') === causeFilter) : conflicts),
    [conflicts, causeFilter]
  );

  // Above the threshold, dimming 200 blocks to reveal 40 is not a lens, it is
  // a broken schedule. Triage names the causes instead.
  const triageMode = conflicts.length > TRIAGE_THRESHOLD && !causeFilter;

  React.useEffect(() => {
    if (index >= visible.length) setIndex(0);
  }, [visible.length, index]);

  const current = visible[index];

  const describe = React.useCallback(
    (c, i) => {
      if (!c) return '';
      const where = [c.curriculum, c.faculty_name].filter(Boolean).join(', ');
      return `Conflict ${i + 1} of ${visible.length}. ${c.type || 'Conflict'}. ${c.reason || ''} ${where}`.trim();
    },
    [visible.length]
  );

  // Debounced so fast stepping does not flood the screen-reader buffer.
  React.useEffect(() => {
    if (!isOpen || triageMode || !current) return;
    clearTimeout(announceTimer.current);
    announceTimer.current = setTimeout(() => setAnnouncement(describe(current, index)), 300);
    return () => clearTimeout(announceTimer.current);
  }, [isOpen, triageMode, current, index, describe]);

  const step = React.useCallback(
    (delta) => {
      if (!visible.length) return;
      setIndex((i) => (i + delta + visible.length) % visible.length);
    },
    [visible.length]
  );

  React.useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      // Never hijack keys while the user is typing.
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'j' || e.key === 'J') { e.preventDefault(); step(1); }
      else if (e.key === 'k' || e.key === 'K') { e.preventDefault(); step(-1); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, step]);

  if (!isOpen || conflicts.length === 0) return null;

  return (
    <>
      {/* Persistent live region: mounted for the life of the lens so
          announcements are reliably picked up. */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      <section
        role="region"
        aria-label="Conflict resolver"
        className="no-print fixed bottom-0 left-0 right-0 z-lens flex justify-center p-4 pointer-events-none"
      >
        <div
          className="relative pointer-events-auto w-full max-w-2xl rounded-2xl bg-white/95 backdrop-blur-md border
                     border-[#AEC3B0]/60 shadow-2xl p-5 rise-bottom
                     motion-reduce:animate-none duration-lens ease-standard overflow-hidden"
        >
          {/* Top Rose-Amber Accent Stripe */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 via-amber-500 to-rose-600 pointer-events-none" />

          {triageMode ? (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 border border-rose-300 flex items-center justify-center shrink-0 shadow-2xs">
                    <AlertTriangle className="w-4 h-4 text-rose-600" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="font-ui text-[15px] font-black text-[#0F2A1D]">
                      {conflicts.length} Conflicts Detected
                    </h2>
                    <p className="font-ui text-xs text-slate-500 font-medium">
                      The timetable requires regenerating rather than manual patching.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Dismiss conflict resolver"
                  className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              <ul className="mt-3.5 divide-y divide-slate-100 max-h-56 overflow-y-auto pr-1">
                {groupByCause(conflicts).map((g) => (
                  <li key={g.cause} className="flex items-center justify-between py-2">
                    <span className="font-ui text-xs font-bold text-[#0F2A1D]">{g.cause}</span>
                    <span className="flex items-center gap-2.5">
                      <span className="font-data text-xs font-black tabular-nums px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                        {g.count}
                      </span>
                      <Button size="row" variant="secondary" onClick={() => onFilterCause(g.cause)}>
                        Review
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-4 pt-3 border-t border-[#AEC3B0]/30 flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={onClose}>Adjust constraints</Button>
                {onRegenerate && <Button size="sm" onClick={onRegenerate}>Regenerate</Button>}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  {/* Badge & Type Row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" aria-hidden="true" />
                      Conflict {visible.length ? index + 1 : 0} of {visible.length}
                    </span>
                    {current?.type && (
                      <span className="px-2.5 py-1 rounded-full font-ui text-[11px] font-black bg-[#E3EED4] text-[#0F2A1D] border border-[#AEC3B0]/70">
                        {current.type}
                      </span>
                    )}
                    {causeFilter && (
                      <span className="text-xs font-semibold text-slate-500 font-ui">
                        · {causeFilter}
                      </span>
                    )}
                  </div>

                  {/* Conflict Description / Reason */}
                  <p className="font-ui text-[14px] font-bold text-[#0F2A1D] mt-2.5 leading-snug break-words">
                    {current?.reason || 'Overlapping time or resource constraint.'}
                  </p>

                  {/* DLSAU Overload Cascade Rule Callout */}
                  {Boolean(
                    current?.conflict_type === 'overload' ||
                    /overload/i.test(String(current?.type || '')) ||
                    /overload/i.test(String(current?.reason || ''))
                  ) && (
                      <div className="mt-2.5 p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-[12px] font-ui text-amber-950 leading-relaxed">
                        <span className="font-black text-amber-900 block mb-0.5">DLSAU Workload Cascade Rule:</span>
                        <span>
                          Overload teaching hours are deducted first from allocated office hours (max 7.5h 1st term / 8.5h 2nd–3rd term). Any excess is then deducted from the 6 allotted consultation hours. Off-campus hours remain protected.
                        </span>
                      </div>
                    )}

                  {/* Metadata Chips (Subject, Faculty, Dean Approval) */}
                  <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                    {current?.curriculum && (
                      <span className="font-mono text-[12px] font-black px-2.5 py-0.5 rounded-md bg-[#E3EED4] text-[#0F2A1D] border border-[#AEC3B0]/60 shadow-2xs">
                        {current.curriculum}
                      </span>
                    )}
                    {current?.faculty_name && (
                      <span className="font-ui text-[12px] font-bold px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-800 border border-slate-200">
                        {current.faculty_name}
                      </span>
                    )}
                    {Boolean(
                      current?.conflict_type === 'overload' ||
                      current?.conflict_type === 'part_time_ceiling' ||
                      /overload|part[- ]time/i.test(String(current?.type || '')) ||
                      /overload|part[- ]time/i.test(String(current?.reason || ''))
                    ) && (
                        <span className="font-ui text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-300">
                          Overload
                        </span>
                      )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Dismiss conflict resolver"
                  className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              {/* Bottom Controls */}
              <div className="mt-4 pt-3.5 border-t border-[#AEC3B0]/30 flex items-center justify-between gap-3 flex-wrap">
                <div className="text-[12px] font-semibold text-slate-500 font-ui hidden sm:flex items-center gap-1.5">
                  <span>Use keyboard</span>
                  <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[11px] font-mono text-slate-700">J</kbd>
                  <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[11px] font-mono text-slate-700">K</kbd>
                  <span>to step</span>
                </div>

                <div className="flex items-center gap-2 ml-auto">
                  {causeFilter && (
                    <Button variant="ghost" size="sm" onClick={() => onFilterCause(null)}>
                      All causes
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={ChevronLeft}
                    onClick={() => step(-1)}
                    disabled={visible.length < 2}
                    aria-label="Previous conflict"
                  >
                    Prev
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={ChevronRight}
                    onClick={() => step(1)}
                    disabled={visible.length < 2}
                    aria-label="Next conflict"
                  >
                    Next
                  </Button>
                  <Button
                    size="sm"
                    icon={Sliders}
                    onClick={() => current && !current.unresolvable && onResolve(current)}
                    loading={resolvingId != null && resolvingId === (current?.conflict_id ?? current?.id)}
                    disabled={!current || Boolean(current.unresolvable)}
                    title={current?.unresolvable ? 'Save or regenerate the schedule to record this conflict' : undefined}
                  >
                    Resolve
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}

/** Grid dimming, applied by the Schedule screen while the lens is active. */
export const lensGridClass =
  'transition-opacity duration-lens ease-standard motion-reduce:transition-none';
