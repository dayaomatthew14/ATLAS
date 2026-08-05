import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext();

// Provider and its consumer hook belong together; splitting them would only
// satisfy Fast Refresh granularity in dev.
// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => useContext(ToastContext);

/**
 * Toast types.
 *
 * `warning` previously had no branch, so addToast(msg, 'warning') — which the
 * app calls in several places — rendered as an error. Adding it is backward
 * compatible: the addToast(message, type) signature is unchanged and any
 * unknown type still falls back to error.
 */
const TYPES = {
  success: { Icon: CheckCircle, accent: 'var(--atlas-green-700)', label: 'Success' },
  error: { Icon: XCircle, accent: 'var(--sem-conflict)', label: 'Error' },
  warning: { Icon: AlertTriangle, accent: 'var(--sem-warning)', label: 'Warning' },
  info: { Icon: Info, accent: 'var(--sem-info)', label: 'Notice' },
};

const MAX_VISIBLE = 3;
const DISMISS_MS = 6000;

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  // Announcement text is kept separate from the visual stack. A live region
  // that is created at the same moment as its content is unreliably announced,
  // so the two regions below are always in the DOM and only their text changes.
  const [politeMsg, setPoliteMsg] = useState('');
  const [assertiveMsg, setAssertiveMsg] = useState('');
  const timers = useRef(new Map());

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const scheduleDismiss = useCallback(
    (id) => {
      const timer = setTimeout(() => removeToast(id), DISMISS_MS);
      timers.current.set(id, timer);
    },
    [removeToast]
  );

  const addToast = useCallback(
    (message, type = 'success') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const safeType = TYPES[type] ? type : 'error';

      setToasts((prev) => {
        const next = [...prev, { id, message, type: safeType }];
        // A fourth toast replaces the oldest rather than stacking off-screen.
        return next.slice(-MAX_VISIBLE);
      });

      // Errors interrupt; everything else waits for a pause in speech.
      const announcement = `${TYPES[safeType].label}: ${message}`;
      if (safeType === 'error') setAssertiveMsg(announcement);
      else setPoliteMsg(announcement);

      scheduleDismiss(id);
    },
    [scheduleDismiss]
  );

  const pause = (id) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  };

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}

      {/*
        Persistent live regions. Without these, no toast was ever announced —
        which compounded the silent-feedback bug on Users and Terms, where the
        only confirmation of a delete was a toast nobody could hear.
        These stay mounted for the life of the app; only their text changes.
      */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {politeMsg}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
        {assertiveMsg}
      </div>

      <div
        className="fixed bottom-5 right-5 z-toast flex flex-col gap-2 max-w-[min(24rem,calc(100vw-2.5rem))]"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((toast) => {
          const { Icon, accent, label } = TYPES[toast.type] || TYPES.error;
          return (
            <div
              key={toast.id}
              // No live role here — announcement is handled by the persistent
              // regions above, so the message is not read twice.
              onMouseEnter={() => pause(toast.id)}
              onMouseLeave={() => scheduleDismiss(toast.id)}
              onFocus={() => pause(toast.id)}
              onBlur={() => scheduleDismiss(toast.id)}
              className="flex items-start gap-3 p-3 pr-2 rounded-panel bg-atlas-surface
                         border border-atlas-line shadow-overlay border-l-4"
              style={{ borderLeftColor: accent }}
            >
              <Icon className="w-4 h-4 shrink-0 mt-0.5" style={{ color: accent }} aria-hidden="true" />
              <span className="sr-only">{label}:</span>
              <span className="font-ui text-body text-atlas-ink flex-1">{toast.message}</span>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                aria-label="Dismiss notification"
                className="shrink-0 w-6 h-6 flex items-center justify-center rounded-field
                           text-atlas-slate hover:text-atlas-ink hover:bg-atlas-50
                           transition-colors duration-state ease-standard
                           focus-visible:outline-none focus-visible:ring-2
                           focus-visible:ring-atlas-700 focus-visible:ring-offset-1"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};
