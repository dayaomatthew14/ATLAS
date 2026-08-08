import React from 'react';
import { X } from 'lucide-react';
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
}) {
  const panelRef = React.useRef(null);
  const titleId = React.useId();
  const descId = React.useId();

  useFocusTrap(isOpen, panelRef, dismissible ? onClose : undefined);

  if (!isOpen) return null;

  const width = size === 'confirm' ? 'max-w-[480px]' : 'max-w-[720px]';

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
                    glass-strong rounded-panel
                    transition-opacity duration-overlay ease-standard`}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-section text-atlas-ink">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 font-ui text-body text-atlas-slate">
                {description}
              </p>
            )}
          </div>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-field
                          text-atlas-slate hover:text-atlas-ink hover:bg-white/85
                          transition-colors duration-state ease-standard ${focusRing}`}
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="px-6 pb-6 overflow-y-auto">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/40 bg-white/30 rounded-b-panel">
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
        footer={<Button variant="secondary" onClick={onClose}>Close</Button>}
      >
        <p className="font-ui text-body text-atlas-ink">{blockedReason}</p>
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
