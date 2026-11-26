import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, BookOpen, CalendarRange, Clock, Compass, Download,
  HelpCircle, ShieldCheck, Sliders, Users,
} from 'lucide-react';
import Dialog from './ui/Dialog';
import Button from './ui/Button';
import { focusRing } from './ui/tokens';
import { getRole, ROLES } from '../utils/session';

/**
 * The user guide, for program chairs and coordinators.
 *
 * It is not offered on the admin side, so the administrator half of this file —
 * a second set of steps, features and FAQs, and the role branch that chose
 * between them — has been removed rather than left to rot behind a condition
 * that can no longer be true.
 *
 * Everything asserted here is checked against the code that implements it, and
 * every link goes somewhere this role may actually open. A guide that describes
 * a screen you cannot reach, or a rule the generator does not follow, is worse
 * than no guide at all, because it is read as instructions. The previous
 * version had drifted on four counts:
 *
 *   - it sent chairs to Curriculum to "assign subject offerings", which happens
 *     on the Faculty screen; their curriculum screen is two GETs and a table
 *   - it told them to register lecture halls, which only an administrator may do
 *   - it described teaching load as "unit caps (e.g. 18 units)"; load is REG.
 *     HOURS per week and has been since utils/load.js was written
 *   - it offered "print to PDF", after the print control was removed in favour
 *     of Export writing a real file
 */

/**
 * Which subjects this role assigns. A program chair holds their programme's
 * major subjects; a coordinator holds General Education. Same split as
 * Teachers.jsx, and it is a fact about the role rather than a choice.
 */
const SUBJECT_SCOPE = {
  [ROLES.PROGRAM_CHAIR]: 'your programme’s curriculum subjects',
  [ROLES.DEAN]: 'your college’s curriculum subjects',
};

/**
 * The order is the readiness checklist on Overview, deliberately: a chair who
 * follows this guide top to bottom is ticking that list off in the order it
 * asks. The two lists drifting apart is what makes a guide stop being trusted.
 */
const buildSteps = (subjectScope) => [
  {
    n: 1,
    title: 'Confirm the active term',
    desc:
      'The academic year and term in the top bar is the one everything you build belongs to. ' +
      'Only an administrator can change it, and nothing can be generated while none is active.',
    to: '/dashboard',
    linkText: 'Overview',
    icon: CalendarRange,
  },
  {
    n: 2,
    title: 'Add your faculty',
    desc:
      'Add each member of your college, set the teaching hours they may carry in a week, and mark ' +
      'the days and times they are unavailable. Generation cannot respect a limit that is not set.',
    to: '/dashboard/teachers',
    linkText: 'Faculty',
    icon: Users,
  },
  {
    n: 3,
    title: 'Assign subjects & lab rooms',
    desc:
      `On Subjects & Rooms (or Faculty), assign ${subjectScope} to professors, set Converted Tutorial (CT) tiers, ` +
      'and assign CAST laboratory rooms (CS/COE labs confirm immediately; Psychology requests go for review).',
    to: '/dashboard/assigned-subjects',
    linkText: 'Subjects & Rooms',
    icon: BookOpen,
  },
  {
    n: 4,
    title: 'Generate, check unassigned, then export',
    desc:
      'Generate schedules for selected professors, optionally plot remaining unassigned subjects into the ' +
      'UNASSIGNED PROFESSOR reference grid to match free slots, resolve any conflicts, and export once clean.',
    to: '/dashboard/schedules',
    linkText: 'Schedules',
    icon: Sliders,
  },
];

/**
 * How the system behaves. Every figure here comes from
 * services/schedule_generator.py or utils/load.js.
 */
const RULES = [
  {
    name: 'Every class meets twice a week',
    icon: CalendarRange,
    text:
      'Classes are placed on a day pair — Mon/Wed, Tue/Thu or Fri/Sat — so the weekly total is ' +
      'always the slot length doubled.',
  },
  {
    name: 'Weekly teaching hours & CT auto-adjust',
    icon: Clock,
    text:
      '3-unit lectures and 1-unit labs run 4.00 hrs/week, 2-unit lectures run 2.67 hrs/week, and 1-unit ' +
      'lectures run 1.33 hrs/week. Setting a Converted Tutorial (CT) tier automatically adjusts plotted ' +
      'timetable durations immediately.',
  },
  {
    name: 'Unassigned subjects reference grid',
    icon: Users,
    text:
      'Use Plot Unassigned Subjects in Generate to view remaining unassigned subjects under UNASSIGNED ' +
      'PROFESSOR (7:30 AM – 5:30 PM). Click back cards in a Solitaire stack to bring them forward; ' +
      'assigning a free professor transfers that exact slot automatically.',
  },
  {
    name: 'Load is hours, not units',
    icon: Users,
    text:
      'Teaching load is REG. HOURS per week — class duration times meetings — shown to two decimals. ' +
      'A part-time member must stay under 20 hours.',
  },
  {
    name: 'The curriculum is read-only',
    icon: BookOpen,
    text:
      'The administrator authors the catalog. You read the published curricula for your own college ' +
      'and assign offerings from them.',
  },
  {
    name: 'Conflicts are resolved one at a time',
    icon: ShieldCheck,
    text:
      'The grid dims and only the clashing classes stay lit. There is no bulk auto-solve, so every ' +
      'change to a timetable is a decision somebody made.',
  },
  {
    name: 'Export writes an official Excel file',
    icon: Download,
    text:
      'Exports directly to an official Excel spreadsheet (.xlsx). The exact rows and columns the ' +
      'file will contain are previewed before anything downloads.',
  },
];

const FAQS = [
  {
    q: 'Why could a subject not be placed?',
    a:
      'The faculty member has reached their maximum teaching load, ' +
      'or every slot in their available times was already taken. The conflict view names which.',
  },
  {
    q: 'Why can I not edit the curriculum?',
    a:
      'The curriculum is the institutional catalog and the administrator authors it. Your screen shows ' +
      'the published curricula for your college; ask an administrator for a correction.',
  },
  {
    q: 'Why can I not change the academic term?',
    a:
      'One term is active across the whole university at a time, and only an administrator sets it. ' +
      'The active one is in the top bar on every screen.',
  },
  {
    q: 'How do I add or remove a single class?',
    a:
      'On Schedules, Create adds one by hand. To remove one, hover it and use the delete icon, or give ' +
      'it keyboard focus and press Delete or Backspace.',
  },
  {
    q: 'Can I clear just one professor’s schedule or undo a clear?',
    a:
      'Yes. Click Clear schedule in any professor’s board header (including UNASSIGNED PROFESSOR) to ' +
      'clear only that board. Deleting a class or clearing a schedule shows an Undo / Restore banner in ' +
      'the bottom-right corner that restores classes along with CT and room metadata.',
  },
  {
    q: 'Do I need to save my work?',
    a: 'No. Generation, manual edits and conflict resolutions are all saved as they happen.',
  },
  {
    q: 'Who publishes the timetable?',
    a:
      'Publishing is an administrator action. Your part is complete once the term generates without ' +
      'unresolved conflicts.',
  },
];

const TABS = [
  { id: 'steps', label: 'Getting started' },
  { id: 'rules', label: 'How it works' },
  { id: 'faq', label: 'Questions' },
];

export default function SystemGuideModal({ isOpen, onClose, onStartTour }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('steps');
  const tabRefs = useRef({});

  const steps = buildSteps(SUBJECT_SCOPE[getRole()] || 'the subjects you are responsible for');

  const handleNavigate = (path) => {
    onClose();
    navigate(path);
  };

  /* Arrow keys move between tabs, which is what a tablist is expected to do
     and what makes the three panels reachable without a pointer. */
  const onTabKeyDown = (e) => {
    const i = TABS.findIndex((t) => t.id === activeTab);
    const next =
      e.key === 'ArrowRight' ? (i + 1) % TABS.length
        : e.key === 'ArrowLeft' ? (i - 1 + TABS.length) % TABS.length
          : e.key === 'Home' ? 0
            : e.key === 'End' ? TABS.length - 1
              : null;
    if (next === null) return;
    e.preventDefault();
    setActiveTab(TABS[next].id);
    tabRefs.current[TABS[next].id]?.focus();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="ATLAS user guide"
      description="How to build a term timetable for your college, start to finish."
      footer={<Button variant="primary" onClick={onClose}>Close</Button>}
    >
      <div className="space-y-5">
        {/* The tour walks the same five screens this guide names, in the same
            order, so it is offered beside them rather than as a rival path. */}
        <div className="rounded-panel accent-edge bg-atlas-50 border border-atlas-line px-4 py-3.5
                        flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-ui text-body font-semibold text-atlas-ink flex items-center gap-2">
              <Compass className="w-4 h-4 text-atlas-700 shrink-0" aria-hidden="true" />
              Prefer to be shown?
            </p>
            <p className="font-ui text-caption text-atlas-slate mt-0.5 leading-relaxed">
              The guided tour opens each screen in turn and explains it in place.
            </p>
          </div>
          {onStartTour && (
            <Button
              variant="secondary"
              icon={Compass}
              className="shrink-0 self-start sm:self-auto"
              onClick={() => { onClose(); onStartTour(); }}
            >
              Start tour
            </Button>
          )}
        </div>

        <div
          role="tablist"
          aria-label="User guide sections"
          onKeyDown={onTabKeyDown}
          className="flex items-center gap-1 border-b border-atlas-line overflow-x-auto"
        >
          {TABS.map((t) => {
            const selected = activeTab === t.id;
            return (
              <button
                key={t.id}
                ref={(el) => { tabRefs.current[t.id] = el; }}
                type="button"
                role="tab"
                id={`guide-tab-${t.id}`}
                aria-selected={selected}
                aria-controls={`guide-panel-${t.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(t.id)}
                className={`shrink-0 -mb-px px-3 py-2 border-b-2 font-ui text-body rounded-t-field
                            transition-colors duration-state ease-standard ${focusRing} ${
                  selected
                    ? 'border-atlas-700 text-atlas-800 font-semibold'
                    : 'border-transparent text-atlas-slate hover:text-atlas-ink'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {activeTab === 'steps' && (
          <div
            role="tabpanel"
            id="guide-panel-steps"
            aria-labelledby="guide-tab-steps"
            tabIndex={0}
            className={`space-y-2.5 ${focusRing}`}
          >
            <ol className="space-y-2.5">
              {steps.map((s) => {
                const Icon = s.icon;
                return (
                  <li
                    key={s.n}
                    className="rounded-panel border border-atlas-line bg-white/60 px-4 py-3.5
                               flex flex-col sm:flex-row sm:items-start gap-3"
                  >
                    <span
                      className="shrink-0 w-7 h-7 rounded-full bg-atlas-100 text-atlas-800
                                 font-ui text-caption font-semibold flex items-center justify-center"
                      aria-hidden="true"
                    >
                      {s.n}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-ui text-body font-semibold text-atlas-ink flex items-center gap-2">
                        <Icon className="w-4 h-4 text-atlas-700 shrink-0" aria-hidden="true" />
                        {s.title}
                      </h3>
                      <p className="font-ui text-caption text-atlas-slate mt-1 leading-relaxed">
                        {s.desc}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="row"
                      icon={ArrowRight}
                      className="shrink-0 self-start"
                      onClick={() => handleNavigate(s.to)}
                    >
                      {s.linkText}
                    </Button>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {activeTab === 'rules' && (
          <div
            role="tabpanel"
            id="guide-panel-rules"
            aria-labelledby="guide-tab-rules"
            tabIndex={0}
            className={`grid grid-cols-1 sm:grid-cols-2 gap-2.5 ${focusRing}`}
          >
            {RULES.map((r) => {
              const Icon = r.icon;
              return (
                <div
                  key={r.name}
                  className="rounded-panel border border-atlas-line bg-white/60 px-4 py-3.5"
                >
                  <h3 className="font-ui text-body font-semibold text-atlas-ink flex items-start gap-2">
                    <Icon className="w-4 h-4 text-atlas-700 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{r.name}</span>
                  </h3>
                  <p className="font-ui text-caption text-atlas-slate mt-1.5 leading-relaxed">
                    {r.text}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'faq' && (
          <div
            role="tabpanel"
            id="guide-panel-faq"
            aria-labelledby="guide-tab-faq"
            tabIndex={0}
            className={`space-y-2.5 ${focusRing}`}
          >
            <dl className="space-y-2.5">
              {FAQS.map((f) => (
                <div
                  key={f.q}
                  className="rounded-panel border border-atlas-line bg-white/60 px-4 py-3.5"
                >
                  <dt className="font-ui text-body font-semibold text-atlas-ink flex items-start gap-2">
                    <HelpCircle className="w-4 h-4 text-atlas-700 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{f.q}</span>
                  </dt>
                  <dd className="font-ui text-caption text-atlas-slate mt-1.5 leading-relaxed pl-6">
                    {f.a}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </Dialog>
  );
}
