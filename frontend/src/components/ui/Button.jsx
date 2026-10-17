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
    'bg-emerald-900 text-white hover:bg-emerald-800 active:bg-emerald-950 font-semibold ' +
    'border border-emerald-400/25 shadow-sm shadow-emerald-950/20 ' +
    'disabled:bg-emerald-900/40 disabled:text-white/60 disabled:shadow-none',
  secondary:
    'bg-white text-emerald-950 font-semibold hover:bg-slate-50 hover:text-emerald-950 ' +
    'border border-slate-300 active:bg-slate-100 shadow-xs ' +
    'disabled:bg-slate-100 disabled:text-atlas-disabled disabled:shadow-none',
  ghost:
    'glass-hover text-slate-700 bg-transparent border border-transparent hover:text-emerald-950 ' +
    'active:bg-white/80 disabled:text-atlas-disabled disabled:bg-transparent',
  destructive:
    'bg-rose-50/70 !text-rose-700 !border-rose-300 font-semibold hover:!bg-rose-100 hover:!text-rose-800 hover:!border-rose-400 ' +
    'active:!bg-rose-200/80 disabled:text-atlas-disabled disabled:shadow-none shadow-xs',
};

const SIZES = {
  // 44px is standard accessible control height with generous horizontal pill padding
  // so text and icons are never crowded by the rounded end caps.
  default: 'h-11 px-6 text-body',
  sm: 'h-9 px-5 text-caption',
  row: 'h-8 px-3.5 text-table',
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
    'inline-flex items-center justify-center gap-2.5 rounded-control font-ui font-semibold ' +
    'whitespace-nowrap transition-colors duration-state ease-standard select-none ' +
    'disabled:cursor-not-allowed';

  const iconClass = size === 'row' ? 'w-4 h-4' : 'w-[18px] h-[18px]';

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
            SIZES[size] || SIZES.default,
            'border border-atlas-line bg-atlas-canvas text-atlas-disabled cursor-not-allowed',
            onDark ? focusRingOnDark : focusRing,
            className,
          ].join(' ')}
          {...rest}
        >
          <Lock className={`${size === 'row' ? 'w-3.5 h-3.5' : 'w-4 h-4'} shrink-0`} aria-hidden="true" />
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
        SIZES[size] || SIZES.default,
        VARIANTS[variant] || VARIANTS.primary,
        onDark ? focusRingOnDark : focusRing,
        className,
      ].join(' ')}
      {...rest}
    >
      {loading ? (
        <Loader2 className={`${iconClass} shrink-0 animate-spin motion-reduce:animate-none`} aria-hidden="true" />
      ) : (
        Icon && <Icon className={`${iconClass} shrink-0`} aria-hidden="true" />
      )}
      {/* Label persists while loading so the button width does not jump. */}
      {children}
    </button>
  );
}
