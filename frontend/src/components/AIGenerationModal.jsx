import React, { useState } from 'react';
import { Sparkles, Settings2, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import Modal from './Modal';
import { useToast } from './ToastProvider';

export default function AIGenerationModal({ isOpen, onClose, onGenerate }) {
  const { addToast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    semester: '1st Semester 2026-2027',
    targetAudience: 'All Teachers',
    priority: 'balanced', // balanced, compact, relaxed
    avoidGaps: true,
  });

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      // In a production environment, we would fetch the active semester ID. 
      // For now, we target the first created semester (ID 1).
      const response = await api.post('/ai-scheduler/generate/1', formData);
      
      addToast(
        response.msg || `Generated ${response.generated} schedules.`, 
        response.conflicts_count === 0 ? 'success' : 'warning'
      );
      
      if (onGenerate) onGenerate(response);
      onClose();
    } catch (error) {
      console.error('AI Generation Error:', error);
      addToast(error.message || 'Failed to generate schedules. Ensure rooms and faculty are assigned.', 'error');
    } finally {
      setIsGenerating(false);
      setStep(1);
    }
  };

  const resetAndClose = () => {
    if (!isGenerating) {
      setStep(1);
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={resetAndClose} title="Auto-Generate Schedule (AI)">
      {isGenerating ? (
        <div className="py-12 flex flex-col items-center justify-center space-y-6">
          <div className="relative">
            <div className="w-20 h-20 border-4 border-green-100 rounded-full animate-spin border-t-green-600"></div>
            <Sparkles className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-green-600 w-8 h-8 animate-pulse" />
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-xl font-bold text-gray-800 animate-pulse">ATLAS Engine is Processing...</h3>
            <p className="text-sm text-gray-500">Analyzing constraints, faculty loads, and room availability.</p>
          </div>
          <div className="w-64 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-green-400 to-green-600 animate-[shimmer_2s_infinite] w-1/2 rounded-full"></div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-100 rounded-xl p-4 flex items-start space-x-3">
            <div className="bg-green-600 text-white p-2 rounded-lg mt-0.5">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-green-900 text-sm">ATLAS AI Scheduling Engine</h4>
              <p className="text-xs text-green-700 mt-1 leading-relaxed">
                The engine will automatically assign rooms, times, and faculty while strictly preventing overlaps. Review your parameters below before initiating.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Active Semester</label>
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between pointer-events-none select-none">
                <span className="text-xs font-black text-emerald-950">2026-2027 First Semester</span>
                <span className="bg-emerald-700 text-white px-2 py-0.5 rounded text-[9px] font-black uppercase">
                  Status: ACTIVE
                </span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Scope</label>
              <select 
                className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-green-500 focus:border-green-500 sm:text-sm"
                value={formData.targetAudience}
                onChange={e => setFormData({...formData, targetAudience: e.target.value})}
              >
                <option>All Unassigned Curriculum</option>
                <option>1st Year Only</option>
                <option>Missing Faculty Only</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Algorithm Priority</label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'compact', title: 'Compact', desc: 'Back-to-back classes' },
                { id: 'balanced', title: 'Balanced', desc: 'Standard breaks' },
                { id: 'relaxed', title: 'Relaxed', desc: 'More free time' }
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setFormData({...formData, priority: opt.id})}
                  className={`p-3 border rounded-xl text-left transition-all ${
                    formData.priority === opt.id 
                      ? 'border-green-600 bg-green-50 ring-1 ring-green-600' 
                      : 'border-gray-200 hover:border-green-300'
                  }`}
                >
                  <div className="font-bold text-sm text-gray-800">{opt.title}</div>
                  <div className="text-[10px] text-gray-500 mt-1">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center space-x-3 bg-gray-50 p-3 rounded-lg border border-gray-100">
            <input 
              type="checkbox" 
              id="avoidGaps" 
              className="rounded border-gray-300 text-green-600 focus:ring-green-500 w-5 h-5"
              checked={formData.avoidGaps}
              onChange={e => setFormData({...formData, avoidGaps: e.target.checked})}
            />
            <label htmlFor="avoidGaps" className="text-sm font-medium text-gray-700 cursor-pointer">
              Strictly minimize 3+ hour vacant gaps for Faculty
            </label>
          </div>

          <div className="pt-4 flex justify-end space-x-3">
            <button
              type="button"
              onClick={resetAndClose}
              className="px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              className="px-5 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-green-700 to-green-600 hover:from-green-800 hover:to-green-700 rounded-xl shadow-md flex items-center transition-all transform hover:scale-105"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Initiate Engine
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
