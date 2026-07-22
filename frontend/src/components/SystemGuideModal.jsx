import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, HelpCircle, CheckCircle2, AlertTriangle, Calendar, MapPin, Users, BookOpen, Clock, Download, Trash2, RotateCcw, ArrowRight, X, Keyboard, ShieldCheck } from 'lucide-react';
import Modal from './Modal';

export default function SystemGuideModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('workflow'); // 'workflow', 'features', 'faq', 'shortcuts'

  const steps = [
    {
      step: 1,
      title: 'Set Active Academic Semester',
      desc: 'Ensure the target school year and semester (e.g. 1st Semester 2026-2027) is marked active in the Semester Manager.',
      link: '/dashboard',
      linkText: 'Go to Dashboard',
      icon: Clock,
      color: 'bg-purple-100 text-purple-700 border-purple-200'
    },
    {
      step: 2,
      title: 'Set Up Campus Rooms',
      desc: 'Verify lecture halls and computer labs are listed with accurate student capacities and building locations.',
      link: '/dashboard/rooms',
      linkText: 'Manage Rooms',
      icon: MapPin,
      color: 'bg-cyan-100 text-cyan-700 border-cyan-200'
    },
    {
      step: 3,
      title: 'Review Subject Offerings',
      desc: 'Ensure department curriculum subjects and credit units are correctly configured in the flowchart.',
      link: '/dashboard/curriculum',
      linkText: 'View Curriculum',
      icon: BookOpen,
      color: 'bg-blue-100 text-blue-700 border-blue-200'
    },
    {
      step: 4,
      title: 'Configure Faculty & Availability',
      desc: 'Set max unit caps for full-time/part-time professors and input any day/time unavailability blocks.',
      link: '/dashboard/teachers',
      linkText: 'Manage Professors',
      icon: Users,
      color: 'bg-emerald-100 text-emerald-700 border-emerald-200'
    },
    {
      step: 5,
      title: 'Run AI Generation & Auto-Solve',
      desc: 'Click Generate to automatically produce conflict-free schedule slots. Use Solve Issue ✨ if workload caps are reached.',
      link: '/dashboard/schedules',
      linkText: 'Go to Schedules',
      icon: Sparkles,
      color: 'bg-amber-100 text-amber-700 border-amber-200'
    }
  ];

  const features = [
    {
      name: 'AI Schedule Generator',
      icon: Sparkles,
      color: 'text-amber-500',
      text: 'Automatically places lecture (1.5h) and lab (2.0h) subjects across Mon/Wed, Tue/Thu, and Fri/Sat slot pairs based on professor availability and room types.'
    },
    {
      name: 'Conflict Solver ✨',
      icon: ShieldCheck,
      color: 'text-emerald-500',
      text: 'If a professor reaches max units or a room is unavailable, click "Solve Issue ✨" or "Auto-Solve All" to auto-bump unit limits or find open rooms.'
    },
    {
      name: 'Delete & 1-Click Restore 🔄',
      icon: RotateCcw,
      color: 'text-rose-500',
      text: 'Accidentally deleted a subject or cleared the entire schedule? A dark banner pops up with an "Undo / Restore ✨" button to instantly restore deleted schedules.'
    },
    {
      name: 'Export CSV & Print PDF 📊',
      icon: Download,
      color: 'text-indigo-500',
      text: 'Click the "Export" button on the Schedules page to download formatted CSV files for Excel or open print-ready PDF calendar views for faculty distribution.'
    }
  ];

  const faqs = [
    {
      q: 'Why does AI Generation mark a subject as "Unplaced"?',
      a: 'A subject is marked unplaced if the assigned professor has reached their maximum workload units, or if all suitable rooms are occupied during the professor\'s available hours. Click "Solve Issue ✨" to auto-adjust caps or assign open slots.'
    },
    {
      q: 'How do I change a professor\'s schedule manually?',
      a: 'Go to Schedules → Click "+ Create" to manually add a schedule entry, or hover over any schedule card on the grid and click the trash icon to delete and replace it.'
    },
    {
      q: 'What happens if I click "Clear All Schedules"?',
      a: 'All generated schedules for the active semester will be removed. You can immediately click the floating "Undo / Restore ✨" banner to restore them intact.'
    },
    {
      q: 'Are my changes saved automatically?',
      a: 'Yes! All schedule updates, conflict resolutions, and room assignments are saved directly to the database in real-time.'
    }
  ];

  const shortcuts = [
    { key: 'Alt + S', desc: 'Jump to Schedules' },
    { key: 'Alt + T', desc: 'Jump to Professors' },
    { key: 'Alt + R', desc: 'Jump to Rooms' },
    { key: 'Alt + C', desc: 'Jump to Curriculum Flowchart' },
    { key: 'Alt + E', desc: 'Open Semester Manager' }
  ];

  const handleNavigate = (path) => {
    onClose();
    navigate(path);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="ATLAS User Guide & System Manual 📖">
      <div className="space-y-6">
        {/* Banner Header */}
        <div className="bg-gradient-to-r from-green-800 to-emerald-700 text-white rounded-2xl p-5 shadow-sm relative overflow-hidden flex items-center justify-between">
          <div className="relative z-10">
            <h3 className="text-xl font-black tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-300" />
              Welcome to ATLAS System Guide
            </h3>
            <p className="text-xs text-green-100 mt-1 font-medium max-w-lg">
              Learn how to navigate the system, run AI schedule generation, resolve conflicts, and export reports step-by-step.
            </p>
          </div>
          <div className="hidden sm:block opacity-20 transform translate-x-4 translate-y-2">
            <BookOpen className="w-28 h-28 text-white" />
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-100 space-x-2">
          {[
            { id: 'workflow', label: '🚀 Recommended Workflow', icon: ArrowRight },
            { id: 'features', label: '⚙️ Feature Guide', icon: Sparkles },
            { id: 'faq', label: '❓ FAQ & Answers', icon: HelpCircle },
            { id: 'shortcuts', label: '⌨️ Shortcuts', icon: Keyboard }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`pb-3 px-3 text-xs font-black uppercase tracking-wider transition-all border-b-2 whitespace-nowrap ${
                activeTab === t.id
                  ? 'border-green-600 text-green-800 font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab 1: Workflow */}
        {activeTab === 'workflow' && (
          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
            <p className="text-xs text-slate-500 font-medium">Follow this 5-step recommended order of operations for effortless schedule generation:</p>
            {steps.map(s => (
              <div key={s.step} className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-start justify-between gap-4 hover:bg-slate-100/50 transition-colors">
                <div className="flex items-start gap-3.5">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs shrink-0 border ${s.color}`}>
                    {s.step}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                      {s.title}
                    </h4>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">{s.desc}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleNavigate(s.link)}
                  className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold shrink-0 transition-all flex items-center gap-1 shadow-xs"
                >
                  {s.linkText} <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Tab 2: Feature Guide */}
        {activeTab === 'features' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[420px] overflow-y-auto pr-1">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <div key={i} className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl flex flex-col">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`w-5 h-5 ${f.color}`} />
                    <h4 className="text-sm font-bold text-slate-800">{f.name}</h4>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{f.text}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 3: FAQ */}
        {activeTab === 'faq' && (
          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
            {faqs.map((faq, i) => (
              <div key={i} className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-1.5">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-green-600 shrink-0" />
                  {faq.q}
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed pl-6">{faq.a}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tab 4: Shortcuts */}
        {activeTab === 'shortcuts' && (
          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
            <p className="text-xs text-slate-500 font-medium">Use these keyboard shortcuts anywhere in the portal for quick navigation:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {shortcuts.map((sc, i) => (
                <div key={i} className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between">
                  <span className="text-xs text-slate-600 font-medium">{sc.desc}</span>
                  <span className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800 shadow-2xs">
                    {sc.key}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
          <span className="text-[11px] text-slate-400 font-medium">ATLAS v1.4 • DLSAU Scheduling Portal</span>
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 bg-green-700 hover:bg-green-800 text-white text-xs font-bold rounded-xl uppercase tracking-wider shadow-sm transition-all"
          >
            Got it, thanks!
          </button>
        </div>
      </div>
    </Modal>
  );
}
