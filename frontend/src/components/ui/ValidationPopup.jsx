import React from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle, X } from 'lucide-react';
import { useValidationPopup } from './useValidationPopup';

/**
 * Compact badge on invalid labels/headers so errors stay obvious at a glance without pushing layout down.
 */
export function ValidationErrorBadge({ error, onOpen, onToggle, label, className = '' }) {
  if (!error) return null;
  return (
    <button
      type="button"
      tabIndex={-1}
      data-validation-badge="true"
      onMouseEnter={onOpen}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        (onToggle || onOpen)?.();
      }}
      title={error}
      aria-label={label ? `Show ${label} validation notice` : 'Show validation notice'}
      className={`inline-flex items-center justify-center w-5 h-5 rounded-full bg-sem-conflict-bg
                  border border-sem-conflict/35 text-sem-conflict hover:bg-sem-conflict hover:text-white
                  transition-colors duration-state ease-standard shrink-0 ${className}`}
    >
      <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
    </button>
  );
}

/**
 * Unified floating preview card anchored above or below an invalid field via Portal.
 */
export function ValidationPopup({ anchorRef, popupRef, isOpen, error, label, onDismiss }) {
  const [coords, setCoords] = React.useState(null);

  const updatePosition = React.useCallback(() => {
    const anchorEl = anchorRef.current;
    const popupEl = popupRef.current;
    if (!anchorEl || !popupEl) return;

    const anchorRect = anchorEl.getBoundingClientRect();
    const popupRect = popupEl.getBoundingClientRect();
    if (anchorRect.width === 0 && anchorRect.height === 0) {
      setCoords(null);
      return;
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (anchorRect.bottom < 0 || anchorRect.top > vh) {
      setCoords(null);
      return;
    }

    const margin = 12;
    const gap = 10;
    const spaceAbove = anchorRect.top - margin;
    const spaceBelow = vh - anchorRect.bottom - margin;

    const placement =
      spaceAbove >= popupRect.height + gap || spaceAbove >= spaceBelow ? 'top' : 'bottom';

    const top =
      placement === 'top'
        ? Math.max(margin, anchorRect.top - popupRect.height - gap)
        : Math.min(vh - popupRect.height - margin, anchorRect.bottom + gap);

    const anchorCenterX = anchorRect.left + anchorRect.width / 2;
    let left = anchorCenterX - popupRect.width / 2;
    left = Math.max(margin, Math.min(left, vw - popupRect.width - margin));

    const arrowLeft = Math.max(18, Math.min(anchorCenterX - left, popupRect.width - 18));
    setCoords({ top, left, arrowLeft, placement });
  }, [anchorRef, popupRef]);

  React.useLayoutEffect(() => {
    if (!isOpen || !error) {
      setCoords(null);
      return undefined;
    }
    updatePosition();
    const handleScrollOrResize = () => updatePosition();
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, error, updatePosition]);

  if (!isOpen || !error || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={popupRef}
      role="region"
      aria-label={label ? `${label} validation notice` : 'Input validation notice'}
      style={
        coords
          ? { top: `${coords.top}px`, left: `${coords.left}px` }
          : { top: '-9999px', left: '-9999px', visibility: 'hidden' }
      }
      className={`fixed z-[9999] max-w-[320px] min-w-[230px] rounded-xl bg-white/95 backdrop-blur-md
                  border border-sem-conflict/30 text-left pointer-events-auto select-text
                  shadow-[0_14px_34px_-8px_rgba(179,38,30,0.22),0_4px_14px_-2px_rgba(5,48,31,0.12)]
                  ${coords ? 'atlas-validation-pop' : ''}`}
    >
      {/* Unified preview header bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-t-[11px] bg-sem-conflict-bg border-b border-sem-conflict/15">
        <span className="inline-flex items-center gap-1.5 font-ui text-[11px] font-bold uppercase tracking-wider text-sem-conflict min-w-0 truncate">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{label || 'Input Notice'}</span>
        </span>
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => {
            e.preventDefault();
            onDismiss?.();
          }}
          aria-label="Dismiss validation preview"
          className="w-5 h-5 rounded-md flex items-center justify-center shrink-0
                     text-sem-conflict/70 hover:text-sem-conflict hover:bg-sem-conflict/10
                     transition-colors duration-state ease-standard"
        >
          <X className="w-3 h-3" aria-hidden="true" />
        </button>
      </div>

      {/* Preview body */}
      <div className="px-3.5 py-2.5 font-ui text-xs leading-relaxed font-medium text-slate-800">
        {error}
      </div>

      {/* Caret pointer aligned to target field */}
      {coords && (
        <span
          aria-hidden="true"
          style={{ left: `${coords.arrowLeft}px` }}
          className={`absolute w-2.5 h-2.5 -translate-x-1/2 rotate-45 ${
            coords.placement === 'top'
              ? '-bottom-[6px] bg-white border-r border-b border-sem-conflict/30'
              : '-top-[6px] bg-sem-conflict-bg border-l border-t border-sem-conflict/30'
          }`}
        />
      )}
    </div>,
    document.body
  );
}

/**
 * Convenience wrapper for raw inputs, selects, buttons, and containers outside Field.jsx.
 */
export function ValidationAnchor({
  error,
  label,
  errorId,
  className = '',
  showBadge = false,
  badgeClassName = '',
  children,
}) {
  const anchorRef = React.useRef(null);
  const { popupRef, isOpen, open, dismiss, toggle, anchorHandlers } = useValidationPopup({
    anchorRef,
    error,
  });

  const badge = (
    <ValidationErrorBadge
      error={error}
      label={label}
      onOpen={() => open({ focusControl: false })}
      onToggle={toggle}
      className={badgeClassName}
    />
  );

  const content =
    typeof children === 'function'
      ? children({ isOpen, open, dismiss, toggle, badge })
      : children;

  return (
    <div ref={anchorRef} className={`relative ${className}`} {...anchorHandlers}>
      {content}
      {showBadge && error && (
        <span className={`absolute top-2 right-2 z-10 ${badgeClassName}`}>{badge}</span>
      )}
      {error && errorId && (
        <span id={errorId} className="sr-only">
          {error}
        </span>
      )}
      <ValidationPopup
        anchorRef={anchorRef}
        popupRef={popupRef}
        isOpen={isOpen}
        error={error}
        label={label}
        onDismiss={dismiss}
      />
    </div>
  );
}
