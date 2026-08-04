import React from 'react';
import { X } from 'lucide-react';
import useFocusTrap from './ui/useFocusTrap';

/**
 * Legacy modal, retained for the nine dialogs on Curriculum, Overview,
 * Schedules and Teachers that have not yet been migrated to ui/Dialog.
 *
 * Its visual styling is deliberately unchanged so those screens keep their
 * current look until they are rebuilt. What has changed is the accessibility,
 * which was broken for every one of them (audit finding A11Y-04): no
 * role="dialog", no aria-modal, no accessible name, no focus trap, no focus
 * restore, and no Escape handler — focus simply stayed on the page behind.
 *
 * Fixing it here rather than at nine call sites means no screen has to be
 * rebuilt to become operable by keyboard.
 */
export default function Modal({ isOpen, onClose, title, children, maxWidth = 'sm:max-w-lg' }) {
  const panelRef = React.useRef(null);
  const titleId = React.useId();

  useFocusTrap(isOpen, panelRef, onClose);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Overlay */}
        <div
          className="fixed inset-0 transition-opacity bg-slate-900/60 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        ></div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        {/* Modal content */}
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={`inline-block overflow-hidden text-left align-bottom transition-all transform bg-white rounded-[2.5rem] shadow-2xl sm:my-8 sm:align-middle ${maxWidth} w-full border border-slate-100`}
        >
          <div className="px-6 pt-8 pb-8 bg-white sm:p-10">
            <div className="flex items-center justify-between mb-8">
              <h3 id={titleId} className="text-3xl font-black text-slate-900 tracking-tighter">{title}</h3>
              <button
                onClick={onClose}
                aria-label="Close dialog"
                className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2"
              >
                <X className="w-6 h-6" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-2">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
