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
  /**
   * Held in a ref so the trap does not depend on the handler's identity.
   *
   * Every call site passes an inline arrow — `onClose={() => setOpen(false)}` —
   * which is a new function on each render. With `onDismiss` in the dependency
   * array the whole effect tore down and re-ran on *every keystroke inside the
   * dialog*: the cleanup restored focus to whatever opened it, then the setup
   * moved focus to the first focusable element, which is the close button. The
   * symptom was a field that lost focus after each character typed.
   */
  const dismissRef = React.useRef(onDismiss);
  React.useEffect(() => { dismissRef.current = onDismiss; }, [onDismiss]);

  React.useEffect(() => {
    if (!active) return;

    const previouslyFocused = document.activeElement;
    const container = containerRef.current;

    /**
     * Focus the dialog itself rather than its first control.
     *
     * The first focusable is the close button, so opening a form dialog used to
     * land on "Close". Both are permitted by the ARIA authoring practices, but
     * focusing the container announces the dialog's title and description, and
     * Tab still steps straight into the content from there.
     */
    if (container) {
      (container.hasAttribute('tabindex')
        ? container
        : container.querySelector(FOCUSABLE) || container
      ).focus();
    }

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        dismissRef.current?.();
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
    // `containerRef` is a ref object and is stable, so this effect now runs
    // exactly twice per dialog: once on open, once on close.
  }, [active, containerRef]);
}
