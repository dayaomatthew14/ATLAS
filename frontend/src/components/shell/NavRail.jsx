import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Calendar, BookOpen, Users, Activity, ShieldCheck,
  CalendarRange, Library, BookCheck,
} from 'lucide-react';
import { focusRingOnDark } from '../ui/tokens';
import { ROLES } from '../../utils/session';

/**
 * ATLAS navigation rail.
 *
 * Replaces the horizontal top nav, which forced the page to 1304px at a 946px
 * viewport because six nowrap links in a flex-1 container could not shrink.
 * A rail also frees the horizontal axis for the timetable, which needs 904px.
 *
 * The rail is grouped by *what kind of thing is being managed*, and the two
 * role shapes are genuinely different rather than one list with items hidden.
 * An administrator governs institutional reference data — who may act, what may
 * be taught, when, and where — and does not appear in departmental operations
 * at all. Faculty and schedule editing are therefore absent from their rail,
 * not disabled within it: a control that exists but always refuses is worse
 * than one that was never offered.
 */

const CHAIR_SECTIONS = [
  {
    items: [{ to: '/dashboard', label: 'Overview', icon: LayoutDashboard, end: true }],
  },
  {
    label: 'Scheduling',
    items: [
      { to: '/dashboard/schedules', label: 'Schedule', icon: Calendar, badge: 'conflicts' },
      { to: '/dashboard/assigned-subjects', label: 'Assigned Subjects', icon: BookCheck },
      { to: '/dashboard/teachers', label: 'Faculty', icon: Users },
    ],
  },
  {
    label: 'Reference',
    items: [
      { to: '/dashboard/curriculum', label: 'Curriculum', icon: BookOpen },
    ],
  },
  {
    label: 'Oversight',
    items: [{ to: '/dashboard/logs', label: 'Activity', icon: Activity }],
  },
];

const ADMIN_SECTIONS = [
  {
    items: [{ to: '/dashboard', label: 'Overview', icon: LayoutDashboard, end: true }],
  },
  {
    label: 'People',
    items: [{ to: '/dashboard/users', label: 'Users', icon: ShieldCheck }],
  },
  {
    label: 'Academic structure',
    items: [
      { to: '/dashboard/colleges', label: 'Colleges and Programs', icon: Library },
      { to: '/dashboard/curriculum', label: 'Curriculum', icon: BookOpen },
      { to: '/dashboard/semesters', label: 'Academic Terms', icon: CalendarRange },
    ],
  },
  {
    label: 'Oversight',
    items: [{ to: '/dashboard/logs', label: 'Activity', icon: Activity }],
  },
];

function RailItem({ item, badge, onNavigate, expanded }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        [
          'group relative flex items-center h-10 w-full rounded-xl overflow-hidden',
          'font-ui text-body transition-all duration-state ease-standard',
          focusRingOnDark,
          isActive
            ? 'bg-emerald-800/85 text-white font-semibold border border-emerald-400/35 shadow-sm'
            : 'text-emerald-100/75 hover:bg-white/10 hover:text-white',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span
              className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]"
              aria-hidden="true"
            />
          )}
          <div className="w-10 h-10 shrink-0 flex items-center justify-center">
            <Icon
              className={`w-[18px] h-[18px] shrink-0 transition-colors ${
                isActive ? 'text-amber-300' : 'text-emerald-200/80 group-hover:text-white'
              }`}
              aria-hidden="true"
            />
          </div>

          <span
            className={`font-ui text-body truncate whitespace-nowrap transition-opacity duration-200 ${
              expanded ? 'opacity-100' : 'opacity-0 sr-only'
            }`}
          >
            {item.label}
          </span>

          {badge === null && (
            <span
              className={
                expanded
                  ? 'ml-auto mr-2.5 shrink-0 min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-sem-warning text-atlas-900 font-data text-caption font-bold'
                  : 'absolute right-1 top-1 shrink-0 min-w-4 h-4 px-1 inline-flex items-center justify-center rounded-full bg-sem-warning text-atlas-900 font-data text-micro leading-none font-bold'
              }
              title="Conflict count unavailable"
            >
              ?
              <span className="sr-only"> conflict count unavailable</span>
            </span>
          )}

          {badge > 0 && (
            <span
              className={
                expanded
                  ? 'ml-auto mr-2.5 shrink-0 min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-sem-conflict text-white font-data text-caption font-bold tabular-nums shadow-sm'
                  : 'absolute right-1 top-1 shrink-0 min-w-4 h-4 px-1 inline-flex items-center justify-center rounded-full bg-sem-conflict text-white font-data text-micro leading-none font-bold tabular-nums shadow-sm'
              }
            >
              {badge}
              <span className="sr-only">
                {badge === 1 ? ' unresolved conflict' : ' unresolved conflicts'}
              </span>
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

export default function NavRail({ role, conflictCount = 0, onNavigate, expanded = false }) {
  const sections = role === ROLES.ADMIN ? ADMIN_SECTIONS : CHAIR_SECTIONS;

  return (
    <nav
      id="primary-nav"
      aria-label="Primary"
      className="h-full w-full px-3 py-3 flex flex-col gap-1 overflow-y-auto"
    >
      {sections.map((section, i) => (
        <div key={section.label || `top-${i}`} className="flex flex-col gap-1">
          {section.label && (
            <>
              <hr className="my-2 border-emerald-500/20" aria-hidden="true" />
              <p
                className={`px-2 pb-1 font-ui text-caption font-bold tracking-wider uppercase text-emerald-300/80 truncate whitespace-nowrap transition-opacity duration-200 ${
                  expanded ? 'opacity-100' : 'sr-only'
                }`}
              >
                {section.label}
              </p>
            </>
          )}
          {section.items.map((item) => (
            <RailItem
              key={item.to}
              item={item}
              badge={item.badge === 'conflicts' ? conflictCount : 0}
              onNavigate={onNavigate}
              expanded={expanded}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}
