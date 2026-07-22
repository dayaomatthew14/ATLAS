import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, HelpCircle, CheckCircle2, AlertTriangle, Calendar, MapPin, Users, BookOpen, Clock, Download, RotateCcw, ArrowRight, X, Compass, ShieldCheck } from 'lucide-react';
import Modal from './Modal';

export default function SystemGuideModal({ isOpen, onClose, onStartTour }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('workflow'); // 'workflow', 'features', 'faq'

  const steps = [
    {
      step: 1,
      title: '1. Set Active Semester',
      desc: 'Ensure the school year & semester (e.g. 1st Sem 2026-2027) is active.',
      link: '/dashboard',
      linkText: 'Go to Dashboard',
      icon: Clock,
      color: 'bg-purple-100 text-purple-700'
    },
    {
      step: 2,
      title: '2. Set Up Campus Rooms',
      desc: 'List lecture halls and computer labs with accurate student capacities.',
      link: '/dashboard/rooms',
      linkText: 'Manage Rooms',
      icon: MapPin,
      color: 'bg-cyan-100 text-cyan-700'
    },
    {
      step: 3,
      title: '3. Assign Subject Offerings',
      desc: 'Verify department subjects and lecture/lab units in the flowchart.',
      link: '/dashboard/curriculum',
      linkText: 'View Curriculum',
      icon: BookOpen,
      color: 'bg-blue-100 text-blue-700'
    },
    {
      step: 4,
      title: '4. Configure Faculty',
      desc: 'Set max unit caps (e.g. 18 units) and day/time unavailability blocks.',
      link: '/dashboard/teachers',
      linkText: 'Manage Faculty',
      icon: Users,
      color: 'bg-emerald-100 text-emerald-700'
    },
    {
      step: 5,
      title: '5. Run AI & Auto-Solve',
      desc: 'Click Generate to schedule subjects. Click Solve Issue ✨ for conflicts.',
      link: '/dashboard/schedules',
      linkText: 'Go to Schedules',
      icon: Sparkles,
      color: 'bg-amber-100 text-amber-700'
    }
  ];

  const features = [
    {
      name: 'AI Schedule Generator',
      icon: Sparkles,
      color: 'text-amber-500',
      text: 'Auto-schedules lecture (1.5h) and lab (2.0h) subjects across Mon/Wed, Tue/Thu, and Fri/Sat slot pairs.'
    },
    {
      name: 'Conflict Auto-Solver ✨',
      icon: ShieldCheck,
      color: 'text-emerald-500',
      text: 'Click "Solve Issue ✨" or "Auto-Solve All" to automatically adjust workload caps or find open rooms.'
    },
    {
      name: '1-Click Restore 🔄',
      icon: RotateCcw,
      color: 'text-rose-500',
      text: 'Accidentally deleted a subject or cleared schedules? Click "Undo / Restore ✨" in the dark banner to restore.'
    },
    {
      name: 'Export CSV & Print PDF 📊',
      icon: Download,
      color: 'text-indigo-500',
      text: 'Download formatted Excel/CSV files or print clean PDF calendar reports from the Schedules tab.'
    }
  ];

  const faqs = [
    {
      q: 'Why is a subject marked "Unplaced"?',
      a: 'This happens if a professor reached their max unit cap or if rooms are booked. Click "Solve Issue ✨" to auto-resolve.'
    },
    {
      q: 'How do I edit or delete a schedule entry?',
      a: 'Go to Schedules → Hover over any schedule box and click the Trash 🗑️ icon to delete or "+ Create" to add manually.'
    },
    {
      q: 'Can I restore cleared schedules?',
      a: 'Yes! Clicking "Clear All" or deleting a slot shows an instant "Undo / Restore ✨" banner at the bottom right.'
    },
    {
      q: 'Are changes saved automatically?',
      a: 'Yes, all schedule generation and conflict resolutions are saved to the database in real-time.'
    }
  ];

  const handleNavigate = (path) => {
    onClose();
    navigate(path);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="ATLAS User Guide 📖" maxWidth="sm:max-w-2xl">
      <div className="space-y-4">
        {/* Banner Header with Guided Tour CTA */}
        <div className="bg-gradient-to-r from-green-800 to-emerald-700 text-white rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black tracking-tight flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-300" />
              Interactive Guided Navigation
            </h3>
            <p className="text-xs text-green-100 mt-0.5 font-medium">
              Want a step-by-step tour? Click below to let ATLAS guide you page by page!
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onClose();
              if (onStartTour) onStartTour();
            }}
            className="px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-900 text-xs font-black rounded-xl uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md shrink-0 transform hover:scale-105"
          >
            <Compass className="w-4 h-4" /> Start Tour 🎯
          </button>
        </div>

        {/* Tab Selection (Scrollable to prevent any text cropping) */}
        <div className="flex items-center gap-1 sm:gap-2 border-b border-slate-100 pb-1 overflow-x-auto">
          {[
            { id: 'workflow', label: '🚀 Recommended Steps' },
            { id: 'features', label: '⚙️ Feature Guide' },
            { id: 'faq', label: '❓ FAQ & Answers' }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 text-xs font-black uppercase tracking-wider transition-all border-b-2 shrink-0 ${
                activeTab === t.id
                  ? 'border-green-600 text-green-800 font-bold bg-green-50/50 rounded-t-xl'
                  : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-t-xl'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Scrollable Container with max-h-[60vh] to prevent cropping */}
        <div className="max-h-[55vh] overflow-y-auto pr-1 space-y-3">
          {/* Tab 1: Workflow */}
          {activeTab === 'workflow' && (
            <div className="space-y-2.5">
              {steps.map(s => (
                <div key={s.step} className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between gap-3 hover:bg-slate-100/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${s.color}`}>
                      {s.step}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">{s.title}</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{s.desc}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleNavigate(s.link)}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-[11px] font-bold shrink-0 transition-all flex items-center gap-1 shadow-2xs"
                  >
                    {s.linkText} <ArrowRight className="w-3 h-3 text-slate-400" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Tab 2: Feature Guide */}
          {activeTab === 'features' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {features.map((f, i) => {
                const Icon = f.icon;
                return (
                  <div key={i} className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex flex-col">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Icon className={`w-4 h-4 ${f.color}`} />
                      <h4 className="text-xs font-bold text-slate-800">{f.name}</h4>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">{f.text}</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tab 3: FAQ */}
          {activeTab === 'faq' && (
            <div className="space-y-2.5">
              {faqs.map((faq, i) => (
                <div key={i} className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1">
                  <h4 className="text-xs font-bold text-slate-800 flex items-start gap-2">
                    <HelpCircle className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                    <span>{faq.q}</span>
                  </h4>
                  <p className="text-[11px] text-slate-600 leading-relaxed pl-6">{faq.a}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">ATLAS Guide System</span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-green-700 hover:bg-green-800 text-white text-xs font-bold rounded-xl uppercase tracking-wider shadow-sm transition-all"
          >
            Close Guide
          </button>
        </div>
      </div>
    </Modal>
  );
}
