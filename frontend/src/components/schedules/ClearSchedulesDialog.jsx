import { AlertTriangle, RotateCcw, X } from 'lucide-react';
import Modal from '../Modal';

/**
 * Confirmation modal before clearing all generated schedules for the term.
 */
export function ClearSchedulesDialog({ isOpen, onClose, onConfirm }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Clear All Schedules">
      <div className="space-y-4">
        <p className="text-sm font-bold text-slate-700">
          Are you sure you want to delete all generated schedules for this semester?
        </p>
        <p className="text-xs text-slate-500 font-medium">
          You will be able to restore them immediately using the Undo button after clearing.
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
            Yes, Clear All
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Floating restore banner shown immediately after deleting/clearing schedules.
 */
export function UndoBackupToast({ undoBackup, onRestore, onDismiss }) {
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
        <button type="button" onClick={onDismiss} className="text-slate-400 hover:text-white p-1">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

