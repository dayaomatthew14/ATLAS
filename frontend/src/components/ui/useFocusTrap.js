import React from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), ' +
  'select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal focus management, shared by the new Dialog and the legacy Modal.
 *
 * Extracted so the older component can be made accessible without migrating
 * its nine remaining call sites first — audit finding A11Y-04 applies to every
 * dialog in the app, not just the ones already rebuilt.
 *
 * Traps Tab within the container, closes on Escape, locks background scroll,
 * and restores focus to whatever opened it. Without the restore, focus falls
 * back to <body> and keyboard users lose their place entirely.
 */
export default function useFocusTrap(active, containerRef, onDismiss) {
  React.useEffect(() => {
    if (!active) return;

    const previouslyFocused = document.activeElement;
    const container = containerRef.current;

    if (container) {
      const first = container.querySelector(FOCUSABLE);
      (first || container).focus();
    }

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onDismiss?.();
        return;
      }
      if (e.key !== 'Tab' || !container) return;

      const items = Array.from(container.querySelectorAll(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null
      );
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = prevOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [active, containerRef, onDismiss]);
}
