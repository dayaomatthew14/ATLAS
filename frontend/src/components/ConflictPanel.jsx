import React from 'react';
import { AlertTriangle, X, ChevronRight, Wand2 } from 'lucide-react';

export default function ConflictPanel({ conflicts, isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-white shadow-2xl z-40 border-l border-gray-200 flex flex-col animate-in slide-in-from-right duration-300">
      <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/80 sticky top-0 z-10">
        <div>
          <h2 className="text-base font-black text-gray-800 flex items-center tracking-tight">
            <AlertTriangle className="w-4 h-4 text-red-600 mr-2" />
            Active Conflicts
          </h2>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{conflicts.length} Issues Found</p>
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
            <div key={idx} className="bg-white border border-red-200 rounded-lg p-3 shadow-sm hover:border-red-400 transition-colors group">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                  {item.type} Conflict
                </span>
                <span className="text-[10px] text-gray-400 font-medium">
                  {item.dayOfWeek} {item.startTime}
                </span>
              </div>
              <h4 className="font-bold text-gray-800 text-sm group-hover:text-red-700 transition-colors">
                {item.curriculum} vs {item.conflictWith?.curriculum || 'Another Class'}
              </h4>
              <p className="text-[11px] text-gray-500 mt-1 italic">
                Reason: {item.reason || 'Overlapping schedules in the same location or teacher.'}
              </p>
              <div className="mt-3 pt-3 border-t border-red-100 flex justify-end space-x-2">
                <button className="text-xs text-gray-500 hover:text-gray-800 font-medium px-2 py-1">Ignore</button>
                <button className="text-xs bg-red-50 hover:bg-red-100 text-red-700 font-bold px-3 py-1 rounded transition-colors">
                  Resolve
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-4 border-t border-gray-100 bg-gray-50 space-y-3">
        <button
          disabled={conflicts.length === 0}
          className="w-full py-2 bg-gray-800 hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-bold flex items-center justify-center transition-colors shadow-sm"
        >
          <Wand2 className="w-4 h-4 mr-2" />
          Auto-Resolve All
        </button>
        <p className="text-[10px] text-gray-400 text-center leading-relaxed">
          Auto-resolve will attempt to shift conflicting classes to the nearest available open time slots.
        </p>
      </div>
    </div>
  );
}
