import React from 'react';
import { AlertTriangle, X, ChevronRight } from 'lucide-react';

export default function ConflictPanel({ conflicts, isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-white shadow-2xl z-40 border-l border-gray-200 flex flex-col animate-in slide-in-from-right duration-300">
      <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-red-50">
        <div className="flex items-center text-red-700">
          <AlertTriangle className="w-5 h-5 mr-2" />
          <h3 className="font-bold">Conflicts ({conflicts.length})</h3>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {conflicts.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <ChevronRight className="w-6 h-6 text-green-600" />
            </div>
            <p className="text-gray-500 text-sm">No conflicts detected.</p>
          </div>
        ) : (
          conflicts.map((item, idx) => (
            <div key={idx} className="bg-white border border-red-200 rounded-lg p-3 shadow-sm hover:border-red-400 transition-colors cursor-pointer group">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                  {item.type} Conflict
                </span>
                <span className="text-[10px] text-gray-400 font-medium">
                  {item.dayOfWeek} {item.startTime}
                </span>
              </div>
              <h4 className="font-bold text-gray-800 text-sm group-hover:text-red-700 transition-colors">
                {item.subject} vs {item.conflictWith?.subject || 'Another Class'}
              </h4>
              <p className="text-[11px] text-gray-500 mt-1 italic">
                Reason: {item.reason || 'Overlapping schedules in the same location or teacher.'}
              </p>
            </div>
          ))
        )}
      </div>

      <div className="p-4 border-t border-gray-100 bg-gray-50">
        <p className="text-[11px] text-gray-400 text-center">
          Resolve conflicts by editing the schedules on the calendar grid.
        </p>
      </div>
    </div>
  );
}
