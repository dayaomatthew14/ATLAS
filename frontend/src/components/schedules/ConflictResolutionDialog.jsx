import { useRef, useMemo } from 'react';
import { CheckCircle2, Sparkles, BookOpen, User, Clock, X } from 'lucide-react';
import useFocusTrap from '../ui/useFocusTrap';
import Button from '../ui/Button';

/**
 * Confirmation summary dialog displayed after an unplaced or overload conflict is resolved.
 * Designed to unify with the ATLAS design system (tokens, soft sage gradients, rounded-2xl surfaces).
 */
export default function ConflictResolutionDialog({ data, onClose }) {
  const panelRef = useRef(null);
  const isOpen = Boolean(data);

  useFocusTrap(isOpen, panelRef, onClose);

  const parsed = useMemo(() => {
    if (!data) return { clean: '', load: null, slot: null, curriculum: null, facultyName: null };

    const text = data.details || data.message || '';
    const msg = data.message || '';
    const combined = `${text} ${msg}`;

    // 1. Detect load numbers (e.g., "20.0 + 8.0 hrs/week exceeds the 20.0 hrs/week allowed load by 8.0 hrs")
    const loadMatch = text.match(/(\d+(?:\.\d+)?)\s*\+\s*(\d+(?:\.\d+)?)\s*hrs\/week/i);
    const load = loadMatch
      ? {
          base: parseFloat(loadMatch[1]),
          overload: parseFloat(loadMatch[2]),
          total: parseFloat(loadMatch[1]) + parseFloat(loadMatch[2]),
        }
      : null;

    // 2. Detect scheduled slot if unplaced/relocated
    const slotMatch = text.match(/(?:time slot|moved to|relocated to)\s+([A-Za-z0-9,\s–-]+?\d{1,2}:\d{2}(?:[–-]\d{1,2}:\d{2})?)/i);
    const slot = slotMatch ? slotMatch[1].trim() : null;

    // 3. Extract curriculum code
    const curriculum =
      data.curriculum ||
      combined.match(/\b([A-Z]{3,5}\d{3}[A-Z]?)\b/)?.[1] ||
      null;

    // 4. Extract faculty name
    const facultyName =
      data.faculty_name ||
      combined.match(/(?:for|on)\s+((?:Engr\.|Dr\.|Prof\.|Mr\.|Ms\.)\s+[A-Za-z\s.]+?)(?=\s*(?:\(|$|\bon\b|\bexceeds\b|\bis\b))/i)?.[1]?.trim() ||
      null;

    // 5. Clean up duplicate "Recorded in the Activity Log."
    const clean = text
      .replace(/\s*(?:and\s+)?recorded in the (?:system\s+)?activity log\.?/gi, '')
      .trim()
      .replace(/[\s,]+$/, '')
      ? text
          .replace(/\s*(?:and\s+)?recorded in the (?:system\s+)?activity log\.?/gi, '')
          .trim()
          .replace(/[\s,]+$/, '') + '.'
      : '';

    return { clean, load, slot, curriculum, facultyName };
  }, [data]);

  if (!isOpen) return null;

  const titleLower = (data.title || '').toLowerCase();
  const actionLower = (data.action_taken || '').toLowerCase();
  const isOverload =
    actionLower.includes('overload') ||
    titleLower.includes('overload') ||
    (data.details || '').toLowerCase().includes('overload');

  const isAutoScheduled =
    actionLower.includes('subject_scheduled') ||
    actionLower.includes('schedule_relocated') ||
    titleLower.includes('scheduled');

  return (
    <div className="fixed inset-0 z-overlay flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-atlas-900/40 backdrop-blur-sm transition-opacity duration-overlay ease-standard"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Box */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="conflict-resolution-title"
        tabIndex={-1}
        className="relative w-full max-w-[500px] flex flex-col bg-white/95 backdrop-blur-md rounded-2xl border border-[#AEC3B0]/60 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Top Accent Stripe */}
        <div className="h-1.5 w-full bg-gradient-to-r from-[#2D6A4F] via-[#52B788] to-[#AEC3B0]" />

        {/* Header */}
        <header className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-[#AEC3B0]/30 bg-slate-50/60 shrink-0">
          <div className="flex items-start gap-3.5 min-w-0">
            <span
              aria-hidden="true"
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-2xs mt-0.5 border bg-[#E3EED4] text-[#0F2A1D] border-[#AEC3B0]/70"
            >
              {isAutoScheduled ? (
                <Sparkles className="w-5 h-5 text-[#2D6A4F] stroke-[2.2]" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-[#2D6A4F] stroke-[2.2]" />
              )}
            </span>
            <div className="min-w-0">
              <h2
                id="conflict-resolution-title"
                className="text-lg sm:text-xl font-black text-[#0F2A1D] tracking-tight leading-snug font-ui"
              >
                {data.title || 'Conflict Resolved'}
              </h2>
              {data.message && (
                <p className="mt-1 font-ui text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
                  {data.message}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </header>

        {/* Content Body */}
        <div className="px-6 py-5 space-y-4 font-ui">
          {/* Metadata Chips Row */}
          {(parsed.curriculum || parsed.facultyName || isOverload) && (
            <div className="flex items-center gap-2 flex-wrap">
              {parsed.curriculum && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-[#E3EED4] text-[#0F2A1D] border border-[#AEC3B0]/70 shadow-2xs">
                  <BookOpen className="w-3.5 h-3.5 text-[#2D6A4F]" />
                  {parsed.curriculum}
                </span>
              )}
              {parsed.facultyName && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-ui font-bold bg-slate-100 text-slate-800 border border-slate-200 shadow-2xs">
                  <User className="w-3.5 h-3.5 text-slate-500" />
                  {parsed.facultyName}
                </span>
              )}
              {isOverload ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-emerald-50 text-emerald-900 border border-emerald-300 shadow-2xs">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Overload Overridden
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-emerald-50 text-emerald-900 border border-emerald-300 shadow-2xs">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Resolution Confirmed
                </span>
              )}
            </div>
          )}

          {/* Structured Resolution Card */}
          <div className="rounded-2xl border border-[#AEC3B0]/50 bg-gradient-to-br from-[#E3EED4]/25 via-white to-emerald-50/20 p-4 shadow-2xs">
            <div className="font-ui text-xs font-black uppercase tracking-wider text-[#0F2A1D] mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#2D6A4F]" />
              What was done
            </div>

            {/* Load metrics pills if available */}
            {parsed.load && (
              <div className="mb-3 grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-white/80 border border-[#AEC3B0]/40 text-center font-ui">
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-500">Regular Cap</div>
                  <div className="text-xs font-black text-slate-800 font-data">{parsed.load.base.toFixed(1)} hrs</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-amber-700">Overload</div>
                  <div className="text-xs font-black text-amber-800 font-data">+{parsed.load.overload.toFixed(1)} hrs</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-[#0F2A1D]">Total Load</div>
                  <div className="text-xs font-black text-[#0F2A1D] font-data">{parsed.load.total.toFixed(1)} hrs</div>
                </div>
              </div>
            )}

            {/* Time Slot pill if available */}
            {parsed.slot && (
              <div className="mb-2.5 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/90 border border-[#AEC3B0]/60 text-xs font-bold text-[#0F2A1D] shadow-2xs">
                <Clock className="w-3.5 h-3.5 text-[#2D6A4F]" />
                <span>Assigned Slot: <strong>{parsed.slot}</strong></span>
              </div>
            )}

            <p className="text-slate-700 text-xs sm:text-sm leading-relaxed font-medium">
              {parsed.clean || data.details || data.message}
            </p>
          </div>

          {/* Activity Log Audit Note */}
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-slate-50/90 border border-slate-200/80 text-xs text-slate-600 font-ui shadow-2xs">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span>This resolution has been recorded in the system <strong className="text-slate-800">Activity Log</strong>.</span>
          </div>
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-end px-6 py-4 border-t border-[#AEC3B0]/30 bg-slate-50/60 rounded-b-2xl shrink-0">
          <Button variant="primary" onClick={onClose} className="rounded-xl px-7 font-ui font-bold shadow-xs">
            Done
          </Button>
        </footer>
      </div>
    </div>
  );
}
