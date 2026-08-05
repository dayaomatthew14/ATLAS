import React from 'react';
import { Loader2, Lock } from 'lucide-react';
import { focusRing, focusRingOnDark } from './tokens';

/**
 * ATLAS button. Phase 1 §1.2.
 *
 * Four variants plus the role-restricted state. 40px tall, pill, 500 weight,
 * 16px side padding. Destructive is an outline, never a solid red fill — a red
 * fill reads as alarm in a dense schedule grid where several may be visible.
 *
 * `restricted` is deliberately NOT the same as `disabled`:
 *   disabled   -> the action is unavailable right now (form invalid, nothing selected)
 *   restricted -> the action exists but this role may not perform it
 * A restricted button stays keyboard-focusable via aria-disabled so the
 * explanation is reachable; a truly disabled one does not.
 */

/**
 * Glass buttons.
 *
 * The primary action stays a solid green fill. That is deliberate: it is the
 * one control on a screen that must be unmistakably the primary action, and a
 * translucent primary competes with everything behind it for legibility.
 * Making *every* button glass is how this pattern turns into a page where
 * nothing looks clickable. The lit top edge does the glass work instead.
 *
 * Secondary, ghost and destructive are true glass — translucent fill, bright
 * top edge, blur — because they sit on panels that are themselves glass and
 * would otherwise read as opaque patches punched through the material.
 */
const VARIANTS = {
  primary:
    'bg-atlas-700 text-white hover:bg-atlas-800 active:bg-atlas-900 ' +
    'shadow-[inset_0_1px_0_0_rgb(255_255_255/0.28),0_2px_8px_-2px_rgb(5_48_31/0.35)] ' +
    'disabled:bg-atlas-700/[.38] disabled:text-white/70 disabled:shadow-none',
  secondary:
    'glass text-atlas-700 hover:bg-white/90 active:bg-white ' +
    'disabled:bg-atlas-canvas/60 disabled:text-atlas-disabled disabled:shadow-none',
  ghost:
    'glass-hover text-atlas-slate bg-transparent border border-transparent hover:text-atlas-ink ' +
    'active:bg-white/80 disabled:text-atlas-disabled disabled:bg-transparent',
  destructive:
    'glass text-sem-conflict !border-sem-conflict/40 hover:bg-sem-conflict-bg/80 ' +
    'active:bg-sem-conflict-bg disabled:text-atlas-disabled disabled:shadow-none',
};

const SIZES = {
  // 40px is the standard control height. `row` exists only for table rows,
  // where the 44px target is met by the row itself being the click area.
  default: 'h-10 px-4 text-body',
  row: 'h-8 px-3 text-table',
};

export default function Button({
  variant = 'primary',
  size = 'default',
  loading = false,
  restricted = false,
  restrictionReason: reason,
  onDark = false,
  icon: Icon,
  className = '',
  children,
  disabled,
  onClick,
  onKeyDown,
  type = 'button',
  ...rest
}) {
  const reasonId = React.useId();

  const base =
    'inline-flex items-center justify-center gap-2 rounded-control font-ui font-medium ' +
    'whitespace-nowrap transition-colors duration-state ease-standard select-none ' +
    'disabled:cursor-not-allowed';

  if (restricted) {
    return (
      <>
        <button
          type={type}
          aria-disabled="true"
          aria-describedby={reason ? reasonId : undefined}
          title={reason}
          // Suppress activation without removing the element from the tab
          // order — the user must be able to reach the explanation.
          onClick={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') e.preventDefault();
          }}
          className={[
            base,
            SIZES[size],
            'border border-atlas-line bg-atlas-canvas text-atlas-disabled cursor-not-allowed',
            onDark ? focusRingOnDark : focusRing,
            className,
          ].join(' ')}
          {...rest}
        >
          <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          {children}
        </button>
        {reason && (
          <span id={reasonId} className="sr-only">
            {reason}
          </span>
        )}
      </>
    );
  }

  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={[
        base,
        SIZES[size],
        VARIANTS[variant] || VARIANTS.primary,
        onDark ? focusRingOnDark : focusRing,
        className,
      ].join(' ')}
      {...rest}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      ) : (
        Icon && <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
      )}
      {/* Label persists while loading so the button width does not jump. */}
      {children}
    </button>
  );
}
