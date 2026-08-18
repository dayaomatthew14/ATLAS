import React from 'react';
import { AlertTriangle, ChevronLeft, X } from 'lucide-react';
import Button from './Button';
import { focusRing } from './tokens';

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
          className="pointer-events-auto w-full max-w-3xl rounded-panel bg-atlas-surface border
                     border-atlas-line shadow-overlay p-4 animate-in slide-in-from-bottom-2
                     motion-reduce:animate-none duration-lens ease-standard"
        >
          {triageMode ? (
            <>
              <div className="flex items-start justify-between gap-4">
                <h2 className="font-display text-section text-atlas-ink flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-sem-conflict shrink-0" aria-hidden="true" />
                  {conflicts.length} conflicts — the schedule needs regenerating, not patching
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Dismiss conflict resolver"
                  className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-field
                              text-atlas-slate hover:bg-white/85 ${focusRing}`}
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              <ul className="mt-3 divide-y divide-white/45">
                {groupByCause(conflicts).map((g) => (
                  <li key={g.cause} className="flex items-center justify-between py-2">
                    <span className="font-ui text-body text-atlas-ink">{g.cause}</span>
                    <span className="flex items-center gap-3">
                      <span className="font-data text-table tabular-nums text-atlas-slate">{g.count}</span>
                      <Button size="row" variant="secondary" onClick={() => onFilterCause(g.cause)}>
                        Review
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex justify-end gap-2">
                <Button variant="ghost" onClick={onClose}>Adjust constraints</Button>
                {onRegenerate && <Button onClick={onRegenerate}>Regenerate</Button>}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-ui text-micro uppercase text-atlas-slate flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-sem-conflict shrink-0" aria-hidden="true" />
                    Conflict {visible.length ? index + 1 : 0} of {visible.length}
                    {causeFilter && ` · ${causeFilter}`}
                  </p>
                  <p className="font-ui text-body text-atlas-ink mt-1">
                    {current?.reason || 'Overlapping time or resource constraint.'}
                  </p>
                  <p className="font-ui text-caption text-atlas-slate mt-0.5">
                    {[current?.curriculum, current?.faculty_name].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Dismiss conflict resolver"
                  className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-field
                              text-atlas-slate hover:bg-white/85 ${focusRing}`}
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="font-ui text-caption text-atlas-slate">
                  <kbd className="font-data">J</kbd> next · <kbd className="font-data">K</kbd> previous ·{' '}
                  <kbd className="font-data">Esc</kbd> dismiss
                </p>
                <div className="flex gap-2">
                  {causeFilter && (
                    <Button variant="ghost" onClick={() => onFilterCause(null)}>All causes</Button>
                  )}
                  <Button
                    variant="secondary"
                    icon={ChevronLeft}
                    onClick={() => step(-1)}
                    disabled={visible.length < 2}
                    aria-label="Previous conflict"
                  >
                    Prev
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => step(1)}
                    disabled={visible.length < 2}
                    aria-label="Next conflict"
                  >
                    Next
                  </Button>
                  {/*
                    Some entries are grid overlaps the server has not recorded
                    as conflicts. There is no conflict row for /solve-conflict
                    to act on, so offering the action would fail; say what to do
                    instead.
                  */}
                  <Button
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
