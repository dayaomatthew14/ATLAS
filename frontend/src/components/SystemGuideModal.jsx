import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, HelpCircle, MapPin, Users, BookOpen, Clock, Download, RotateCcw, ArrowRight, Compass, ShieldCheck, Library, CalendarRange, FileSpreadsheet } from 'lucide-react';
import Modal from './Modal';
import { isAdmin as isAdminRole } from '../utils/session';

/**
 * The guide is written twice, once per role shape, for the same reason the rail
 * and the tour are: the single version walked everyone through Faculty and
 * Generate the Schedule, and both of those buttons sent an administrator to
 * "You do not have access to this page". A guide that links where you cannot go
 * is worse than no guide, because it is read as instructions.
 */

const CHAIR_STEPS = [
  {
    step: 1,
    title: '1. Check the Active Semester',
    desc: 'The school year & semester (e.g. 1st Sem 2026-2027) shown in the top bar is the one you are working in.',
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
    title: '5. Generate the Schedule',
    desc: 'Generate the timetable, then work through any conflicts one at a time.',
    link: '/dashboard/schedules',
    linkText: 'Go to Schedules',
    icon: Sparkles,
    color: 'bg-amber-100 text-amber-700'
  }
];

const ADMIN_STEPS = [
  {
    step: 1,
    title: '1. Set the Active Academic Term',
    desc: 'Exactly one term is active at a time. No department can generate a timetable until one is.',
    link: '/dashboard/semesters',
    linkText: 'Academic Terms',
    icon: CalendarRange,
    color: 'bg-purple-100 text-purple-700'
  },
  {
    step: 2,
    title: '2. Verify Accounts',
    desc: 'New registrations cannot sign in until you verify them, and each one needs a role and a college.',
    link: '/dashboard/users',
    linkText: 'Manage Users',
    icon: ShieldCheck,
    color: 'bg-emerald-100 text-emerald-700'
  },
  {
    step: 3,
    title: '3. Maintain Colleges & Programmes',
    desc: 'Keep the colleges and the programmes each one offers up to date.',
    link: '/dashboard/colleges',
    linkText: 'Colleges & Programmes',
    icon: Library,
    color: 'bg-blue-100 text-blue-700'
  },
  {
    step: 4,
    title: '4. Import Each Curriculum',
    desc: 'Import the catalog a programme is taught from, term by term.',
    link: '/dashboard/curriculum',
    linkText: 'View Curriculum',
    icon: BookOpen,
    color: 'bg-amber-100 text-amber-700'
  },
  {
    step: 5,
    title: '5. Register Campus Rooms',
    desc: 'Rooms are shared campus infrastructure. List lecture halls and labs with accurate capacities.',
    link: '/dashboard/rooms',
    linkText: 'Manage Rooms',
    icon: MapPin,
    color: 'bg-cyan-100 text-cyan-700'
  }
];

const CHAIR_FEATURES = [
  {
    name: 'AI Schedule Generator',
    icon: Sparkles,
    color: 'text-amber-500',
    text: 'Auto-schedules lecture (1.5h) and lab (2.0h) subjects across Mon/Wed, Tue/Thu, and Fri/Sat slot pairs.'
  },
  {
    // "Auto-Solve All" was described here after the button was removed. It
    // looped a resolver that force-placed on failure, so it could double-book
    // a whole term and report success. Conflicts are stepped through one at a
    // time now, and the guide has to say so.
    name: 'Conflict resolution',
    icon: ShieldCheck,
    color: 'text-emerald-500',
    text: 'Open the conflict view from the Schedule screen and resolve them one at a time, so each change is a decision you made.'
  },
  {
    name: 'Undo and restore',
    icon: RotateCcw,
    color: 'text-rose-500',
    text: 'Deleted a class or cleared the schedule? Use Undo / Restore in the banner that appears at the bottom right.'
  },
  {
    name: 'Export and print',
    icon: Download,
    color: 'text-indigo-500',
    text: 'Download a CSV for Excel, or print to PDF. Unpublished schedules print with a DRAFT watermark.'
  }
];

const ADMIN_FEATURES = [
  {
    name: 'Curriculum import',
    icon: FileSpreadsheet,
    color: 'text-emerald-500',
    text: 'Import a curriculum from an Excel file. The wizard shows the detected sheet and column mapping before anything is saved.'
  },
  {
    name: 'Account verification',
    icon: ShieldCheck,
    color: 'text-indigo-500',
    text: 'Registrations arrive unverified. Verify from Overview or the Users screen; nobody can sign in until you do.'
  },
  {
    name: 'One active term',
    icon: CalendarRange,
    color: 'text-amber-500',
    text: 'Activating a term sets the one every department works in, and it is shown in the top bar on every screen.'
  },
  {
    name: 'Activity log',
    icon: Clock,
    color: 'text-rose-500',
    text: 'Every change is recorded with who made it and when, across all colleges.'
  }
];

const CHAIR_FAQS = [
  {
    q: 'Why is a subject marked "Unplaced"?',
    a: 'The faculty member reached their unit cap, or no free room matched the subject type. Open the conflict view to resolve it.'
  },
  {
    q: 'How do I edit or delete a schedule entry?',
    a: 'On the Schedule screen, hover a class and use the delete icon, or press Delete with it focused. Use Create to add one manually.'
  },
  {
    q: 'Can I restore cleared schedules?',
    a: 'Yes. Clearing or deleting shows an Undo / Restore banner at the bottom right.'
  },
  {
    q: 'Are changes saved automatically?',
    a: 'Yes. Generation and conflict resolutions are saved as they happen.'
  }
];

const ADMIN_FAQS = [
  {
    q: 'Where is the Schedule screen?',
    a: 'Timetables are departmental work. Program chairs and coordinators build the schedule for their own college; your role sets the frame they work inside — accounts, colleges, curriculum, terms, and rooms.'
  },
  {
    q: 'A programme shows no curriculum. What now?',
    a: 'Open Colleges & Programmes and import one for it. If the curriculum was imported before the taxonomy existed it will be listed as unassigned — assign it to the programme rather than importing again.'
  },
  {
    q: 'Why can an account not sign in?',
    a: 'It is most likely unverified. Overview lists everyone awaiting verification, and the Users screen shows the state of every account.'
  },
  {
    q: 'What does activating a different term change?',
    a: 'Only one term is active at a time. Activating another changes the term shown in the top bar and the term departments generate against.'
  }
];

export default function SystemGuideModal({ isOpen, onClose, onStartTour }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('workflow'); // 'workflow', 'features', 'faq'

  const isAdmin = isAdminRole();
  const steps = isAdmin ? ADMIN_STEPS : CHAIR_STEPS;
  const features = isAdmin ? ADMIN_FEATURES : CHAIR_FEATURES;
  const faqs = isAdmin ? ADMIN_FAQS : CHAIR_FAQS;

  const handleNavigate = (path) => {
    onClose();
    navigate(path);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="ATLAS User Guide" maxWidth="sm:max-w-3xl">
      <div className="space-y-6 pt-1">
        {/* Banner Header with Guided Tour CTA */}
        <div className="bg-gradient-to-r from-emerald-900 via-green-800 to-emerald-900 text-white rounded-3xl p-5 sm:p-6 shadow-xl border border-white/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-base sm:text-lg font-extrabold tracking-tight flex items-center gap-2 text-white">
              <Sparkles className="w-5 h-5 text-amber-300" />
              Interactive Guided Navigation
            </h3>
            <p className="text-xs sm:text-sm text-green-100 font-medium max-w-lg leading-relaxed">
              Want a step-by-step tour? Click below to let ATLAS guide you page by page!
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onClose();
              if (onStartTour) onStartTour();
            }}
            className="px-6 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black rounded-full uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg shrink-0 transform hover:scale-105"
          >
            <Compass className="w-4 h-4" /> Start tour
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center gap-4 sm:gap-8 border-b border-slate-100 pb-1 overflow-x-auto">
          {[
            { id: 'workflow', label: 'Setup steps' },
            { id: 'features', label: 'Features' },
            { id: 'faq', label: 'FAQ' }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`pb-3 text-xs sm:text-sm font-extrabold tracking-wider transition-all border-b-4 shrink-0 ${
                activeTab === t.id
                  ? 'border-emerald-600 text-emerald-900 font-black'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Scrollable Content Container */}
        <div className="max-h-[50vh] overflow-y-auto pr-1 space-y-3.5">
          {/* Tab 1: Recommended Steps */}
          {activeTab === 'workflow' && (
            <div className="space-y-3">
              {steps.map(s => (
                <div key={s.step} className="p-4 bg-slate-50/90 border border-slate-200/80 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-white hover:shadow-md transition-all">
                  <div className="flex items-start sm:items-center gap-4">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm shrink-0 shadow-xs ${s.color}`}>
                      {s.step}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{s.title}</h4>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed font-medium">{s.desc}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleNavigate(s.link)}
                    className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-200/90 rounded-2xl text-xs font-bold shrink-0 transition-all flex items-center gap-1.5 shadow-2xs self-end sm:self-center"
                  >
                    {s.linkText} <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Tab 2: Feature Guide */}
          {activeTab === 'features' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {features.map((f, i) => {
                const Icon = f.icon;
                return (
                  <div key={i} className="p-4 bg-slate-50/90 border border-slate-200/80 rounded-2xl flex flex-col hover:bg-white hover:shadow-md transition-all">
                    <div className="flex items-center gap-2.5 mb-2">
                      <Icon className={`w-5 h-5 ${f.color}`} />
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900">{f.name}</h4>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium">{f.text}</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tab 3: FAQ */}
          {activeTab === 'faq' && (
            <div className="space-y-3">
              {faqs.map((faq, i) => (
                <div key={i} className="p-4 bg-slate-50/90 border border-slate-200/80 rounded-2xl space-y-1.5 hover:bg-white hover:shadow-md transition-all">
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900 flex items-start gap-2.5">
                    <HelpCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{faq.q}</span>
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed pl-6 font-medium">{faq.a}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
          <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">ATLAS user guide</span>
          <button
            type="button"
            onClick={onClose}
            className="px-7 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-black rounded-full uppercase tracking-wider shadow-md transition-all transform hover:scale-105"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
