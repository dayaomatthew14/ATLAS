import { Check } from 'lucide-react';
import AtlasDialog from '../ui/Dialog';
import AtlasButton from '../ui/Button';

/**
 * Confirmation summary displayed after an unplaced/overload conflict is resolved.
 */
export default function ConflictResolutionDialog({ data, onClose }) {
  return (
    <AtlasDialog
      isOpen={Boolean(data)}
      onClose={onClose}
      title={data?.title || 'Conflict Resolved'}
      description={data?.message || 'The conflict has been resolved successfully.'}
      size="confirm"
      icon={Check}
      dismissible={true}
      footer={<AtlasButton onClick={onClose}>Done</AtlasButton>}
    >
      <div className="space-y-4 font-ui">
        <div className="p-4 rounded-panel bg-emerald-50 border border-emerald-200/70 text-emerald-950 text-sm">
          <p className="font-semibold text-emerald-950 mb-1.5 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block" />
            What was done
          </p>
          <p className="text-emerald-900/90 leading-relaxed text-caption sm:text-body">
            {data?.details || data?.message}
          </p>
        </div>

        <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-panel bg-slate-50 border border-slate-200 text-xs text-slate-600">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          <span>This resolution has been recorded in the system <strong>Activity Log</strong>.</span>
        </div>
      </div>
    </AtlasDialog>
  );
}

