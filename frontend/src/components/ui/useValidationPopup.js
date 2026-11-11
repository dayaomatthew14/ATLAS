import React from 'react';

// Shared active-popup coordinator so only one preview message box is shown at a time.
let activePopupId = null;
let batchClaimLocked = false;
let globalSubmitWatcherInstalled = false;
const popupSubscribers = new Set();

function notifySubscribers() {
  popupSubscribers.forEach((cb) => cb(activePopupId));
}

function setActivePopup(id) {
  if (activePopupId === id) return;
  activePopupId = id;
  notifySubscribers();
}

function clearActivePopup(id) {
  if (activePopupId !== id) return;
  activePopupId = null;
  notifySubscribers();
}

function claimPopupOnNewError(id, hasFocus) {
  if (hasFocus) {
    setActivePopup(id);
    return true;
  }
  if (!batchClaimLocked) {
    batchClaimLocked = true;
    setActivePopup(id);
    Promise.resolve().then(() => {
      batchClaimLocked = false;
    });
    return true;
  }
  return false;
}

function installGlobalSubmitWatcher() {
  if (globalSubmitWatcherInstalled || typeof document === 'undefined') return;
  globalSubmitWatcherInstalled = true;
  document.addEventListener(
    'submit',
    (event) => {
      const formEl = event.target;
      if (!(formEl instanceof HTMLFormElement)) return;
      requestAnimationFrame(() => {
        const firstInvalid = formEl.querySelector('[data-validation-has-error="true"]');
        if (firstInvalid) {
          firstInvalid.dispatchEvent(
            new CustomEvent('atlas:open-validation-preview', { bubbles: false })
          );
        }
      });
    },
    true
  );
}

/**
 * Coordinates when an anchored preview error message box opens, flips, or closes.
 */
export function useValidationPopup({ anchorRef, error }) {
  const popupId = React.useId();
  const popupRef = React.useRef(null);
  const prevErrorRef = React.useRef('');
  const [activeId, setActiveId] = React.useState(activePopupId);
  const [dismissedError, setDismissedError] = React.useState(null);

  React.useEffect(() => {
    installGlobalSubmitWatcher();
    popupSubscribers.add(setActiveId);
    setActiveId(activePopupId);
    return () => {
      popupSubscribers.delete(setActiveId);
      if (activePopupId === popupId) {
        activePopupId = null;
        notifySubscribers();
      }
    };
  }, [popupId]);

  React.useEffect(() => {
    const errText = error ? String(error) : '';
    if (!errText) {
      prevErrorRef.current = '';
      setDismissedError(null);
      clearActivePopup(popupId);
      return;
    }

    if (errText !== prevErrorRef.current) {
      prevErrorRef.current = errText;
      setDismissedError(null);
      const anchorEl = anchorRef.current;
      const hasFocus = Boolean(anchorEl && anchorEl.contains(document.activeElement));
      claimPopupOnNewError(popupId, hasFocus);
    }
  }, [error, popupId, anchorRef]);

  React.useEffect(() => {
    const anchorEl = anchorRef.current;
    if (!anchorEl) return undefined;

    const handleFormSubmitReveal = () => {
      setDismissedError(null);
      setActivePopup(popupId);
      anchorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const target = anchorEl.querySelector(
        'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]):not([tabindex="-1"])'
      );
      if (target instanceof HTMLElement && document.activeElement !== target) {
        target.focus({ preventScroll: true });
      }
    };

    anchorEl.addEventListener('atlas:open-validation-preview', handleFormSubmitReveal);
    return () => {
      anchorEl.removeEventListener('atlas:open-validation-preview', handleFormSubmitReveal);
    };
  }, [anchorRef, popupId]);

  const isOpen = Boolean(error) && activeId === popupId && dismissedError !== error;

  React.useEffect(() => {
    if (!isOpen) return undefined;
    const handleOutsideMouseDown = (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (anchorRef.current?.contains(target)) return;
      if (popupRef.current?.contains(target)) return;
      if (target instanceof Element) {
        if (target.closest('[data-validation-badge="true"]')) return;
        if (target.closest('button[type="submit"], input[type="submit"]')) return;
      }
      clearActivePopup(popupId);
    };
    document.addEventListener('mousedown', handleOutsideMouseDown);
    return () => document.removeEventListener('mousedown', handleOutsideMouseDown);
  }, [isOpen, anchorRef, popupRef, popupId]);

  const open = React.useCallback(
    ({ focusControl = false } = {}) => {
      if (!error) return;
      setDismissedError(null);
      setActivePopup(popupId);
      if (focusControl && anchorRef.current) {
        const target = anchorRef.current.querySelector(
          'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]):not([tabindex="-1"])'
        );
        if (target instanceof HTMLElement && document.activeElement !== target) {
          target.focus({ preventScroll: true });
        }
      }
    },
    [error, popupId, anchorRef]
  );

  const dismiss = React.useCallback(() => {
    setDismissedError(error || null);
    clearActivePopup(popupId);
  }, [error, popupId]);

  const toggle = React.useCallback(() => {
    if (isOpen) {
      dismiss();
    } else {
      open({ focusControl: true });
    }
  }, [isOpen, dismiss, open]);

  const anchorHandlers = React.useMemo(
    () => ({
      'data-validation-has-error': error ? 'true' : undefined,
      onFocusCapture: () => {
        if (error) {
          setDismissedError(null);
          setActivePopup(popupId);
        }
      },
      onBlurCapture: (e) => {
        const nextFocused = e.relatedTarget;
        if (
          !anchorRef.current?.contains(nextFocused) &&
          !popupRef.current?.contains(nextFocused)
        ) {
          clearActivePopup(popupId);
        }
      },
      onMouseEnter: () => {
        if (error) {
          setDismissedError(null);
          setActivePopup(popupId);
        }
      },
      onMouseLeave: () => {
        const hasFocus = Boolean(anchorRef.current?.contains(document.activeElement));
        if (!hasFocus) {
          clearActivePopup(popupId);
        }
      },
    }),
    [error, popupId, anchorRef]
  );

  return {
    popupRef,
    isOpen,
    open,
    dismiss,
    toggle,
    anchorHandlers,
  };
}

