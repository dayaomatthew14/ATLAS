import React from 'react';
import { X, AlertTriangle } from 'lucide-react';
import Button from './Button';
import { TextInput } from './Field';
import { focusRing } from './tokens';
// Focus management lives in one place — the legacy Modal needs the same
// behaviour, and two copies would drift.
import useFocusTrap from './useFocusTrap';

/**
 * ATLAS dialog. Phase 1 §1.2.
 *
 * Replaces both the existing Modal (no focus trap, no Escape, no dialog role —
 * audit finding A11Y-04) and the 9 native window.confirm() calls (HEU-04),
 * which cannot name the entity being destroyed or be styled or translated.
 *
 * Sizes: entity forms 720px / 2 columns, confirmations 480px / 1 column.
 */

export default function Dialog({
  isOpen,
  onClose,
  title,
  description,
  size = 'entity', // 'entity' | 'confirm'
  footer,
  children,
  dismissible = true,
  icon: Icon,
  iconClassName,
}) {
  const panelRef = React.useRef(null);
  const titleId = React.useId();
  const descId = React.useId();

  useFocusTrap(isOpen, panelRef, dismissible ? onClose : undefined);

  if (!isOpen) return null;

  const width =
    size === 'confirm'
      ? 'max-w-[480px]'
      : size === 'wide'
      ? 'max-w-5xl'
      : size === 'large'
      ? 'max-w-4xl'
      : 'max-w-[720px]';

  return (
    <div className="fixed inset-0 z-overlay flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-atlas-900/40 backdrop-blur-sm transition-opacity duration-overlay ease-standard"
        onClick={dismissible ? onClose : undefined}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`relative w-full ${width} max-h-[calc(100vh-2rem)] flex flex-col
                    glass-strong rounded-panel border border-emerald-900/15 shadow-2xl
                    transition-opacity duration-overlay ease-standard`}
      >
        <header className="flex items-start justify-between gap-4 px-6 py-5 border-b border-emerald-900/10 bg-white/40 rounded-t-panel">
          <div className="flex items-start gap-3.5 min-w-0">
            {Icon && (
              <span
                aria-hidden="true"
                className={
                  iconClassName ||
                  'w-10 h-10 rounded-xl bg-emerald-800/10 text-emerald-800 border border-emerald-800/15 flex items-center justify-center shrink-0 shadow-xs mt-0.5'
                }
              >
                <Icon className="w-5 h-5 stroke-[2.2]" />
              </span>
            )}
            <div className="min-w-0">
              <h2 id={titleId} className="text-xl sm:text-2xl font-extrabold text-emerald-950 tracking-tight leading-snug">
                {title}
              </h2>
              {description && (
                <p id={descId} className="mt-1 font-ui text-caption sm:text-body text-slate-700 font-medium leading-relaxed">
                  {description}
                </p>
              )}
            </div>
          </div>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-lg
                          text-slate-500 hover:text-slate-900 hover:bg-white/80 border border-transparent hover:border-slate-200
                          transition-colors duration-state ease-standard ${focusRing}`}
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </header>

        <div className="px-6 py-6 overflow-y-auto">{children}</div>

        {/* The footer wraps: three actions at 375px pushed the first button off
            the left edge of the panel, and a control you cannot reach is worse
            than one that costs a second row. */}
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-3 px-6 py-4 border-t border-emerald-900/10 bg-white/30 rounded-b-panel">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Confirmation dialog.
 *
 * `confirmPhrase` turns this into a type-to-confirm gate for high-impact
 * destructive actions. Naming the entity is the point — "Are you sure?" gives
 * the user nothing to check their intent against.
 *
 * `blocked` renders the refusal case: the action cannot proceed and the reason
 * is stated, rather than offering a button that will fail.
 */
export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  confirmPhrase,
  destructive = false,
  blocked = false,
  blockedReason,
  loading = false,
}) {
  const [typed, setTyped] = React.useState('');

  React.useEffect(() => {
    if (isOpen) setTyped('');
  }, [isOpen]);

  const phraseMatches =
    !confirmPhrase || typed.trim().toLowerCase() === confirmPhrase.trim().toLowerCase();

  if (blocked) {
    return (
      <Dialog
        isOpen={isOpen}
        onClose={onClose}
        title={title}
        size="confirm"
        icon={AlertTriangle}
        iconClassName="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-800 border border-amber-500/25 flex items-center justify-center shrink-0 shadow-xs mt-0.5"
        footer={<Button variant="secondary" onClick={onClose}>Close</Button>}
      >
        <p className="font-ui text-body text-slate-700 font-medium">{blockedReason}</p>
      </Dialog>
    );
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={description}
      size="confirm"
      dismissible={!loading}
      icon={destructive ? AlertTriangle : undefined}
      iconClassName={
        destructive
          ? 'w-10 h-10 rounded-xl bg-rose-500/15 text-rose-700 border border-rose-500/20 flex items-center justify-center shrink-0 shadow-xs mt-0.5'
          : undefined
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'primary'}
            onClick={onConfirm}
            disabled={!phraseMatches}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {confirmPhrase && (
        <TextInput
          label={
            <>
              Type <span className="font-data normal-case">{confirmPhrase}</span> to confirm
            </>
          }
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
        />
      )}
    </Dialog>
  );
}
