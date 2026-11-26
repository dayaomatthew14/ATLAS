import { useEffect } from 'react';
import { AlertTriangle, RotateCcw, X } from 'lucide-react';
import Modal from '../Modal';

/**
 * Confirmation modal before clearing all generated schedules for the term
 * or clearing a single professor's (or UNASSIGNED PROFESSOR's) schedule.
 */
export function ClearSchedulesDialog({ isOpen, onClose, onConfirm, targetBoard = null }) {
  const isSingle = Boolean(targetBoard?.name);
  const title = isSingle ? 'Clear Professor Schedule' : 'Clear All Schedules';
  const countLabel = targetBoard?.count === 1 ? '1 class' : `${targetBoard?.count || 0} classes`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-4">
        <p className="text-sm font-bold text-slate-700">
          {isSingle
            ? `Are you sure you want to delete all ${countLabel} scheduled for ${targetBoard.name} in this semester?`
            : 'Are you sure you want to delete all generated schedules for this semester?'}
        </p>
        <p className="text-xs text-slate-500 font-medium">
          {isSingle
            ? 'Other professors’ schedules and all subject assignments will remain untouched. You can restore immediately using Undo.'
            : 'You will be able to restore them immediately using the Undo button after clearing.'}
        </p>
        <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-4 rounded-control font-ui font-medium text-body text-atlas-slate hover:text-atlas-ink transition-colors duration-state ease-standard"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-10 px-4 rounded-control glass font-ui font-medium text-body text-sem-conflict !border-sem-conflict/40 hover:bg-sem-conflict-bg/80 transition-colors duration-state ease-standard"
          >
            {isSingle ? 'Yes, Clear Schedule' : 'Yes, Clear All'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Floating restore banner shown immediately after deleting/clearing schedules.
 * Automatically auto-dismisses after duration ms (default 5000ms / 5s).
 */
export function UndoBackupToast({ undoBackup, onRestore, onDismiss, duration = 5000 }) {
  useEffect(() => {
    if (!undoBackup) return;
    const timer = setTimeout(() => {
      onDismiss?.();
    }, duration);
    return () => clearTimeout(timer);
  }, [undoBackup, onDismiss, duration]);

  if (!undoBackup) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[250] bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 rise-bottom border border-slate-800">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-amber-400" />
        <span className="text-sm font-bold">{undoBackup.label}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRestore}
          className="h-9 px-4 rounded-control font-ui font-medium text-table text-atlas-900 bg-white hover:bg-atlas-100 transition-colors duration-state ease-standard flex items-center gap-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Undo / Restore
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss undo notification"
          className="text-slate-400 hover:text-white p-1"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

