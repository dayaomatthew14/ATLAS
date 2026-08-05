import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Calendar, BookOpen, Users, MapPin, Activity, ShieldCheck,
  CalendarRange, Library,
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
      { to: '/dashboard/teachers', label: 'Faculty', icon: Users },
    ],
  },
  {
    label: 'Reference',
    items: [
      { to: '/dashboard/curriculum', label: 'Curriculum', icon: BookOpen },
      { to: '/dashboard/rooms', label: 'Rooms', icon: MapPin },
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
      { to: '/dashboard/colleges', label: 'Colleges & Programmes', icon: Library },
      { to: '/dashboard/curriculum', label: 'Curriculum', icon: BookOpen },
      { to: '/dashboard/semesters', label: 'Academic Terms', icon: CalendarRange },
    ],
  },
  {
    label: 'Campus',
    items: [{ to: '/dashboard/rooms', label: 'Rooms', icon: MapPin }],
  },
  {
    label: 'Oversight',
    items: [
      { to: '/dashboard/schedules', label: 'Schedule', icon: Calendar, badge: 'conflicts' },
      { to: '/dashboard/logs', label: 'Activity', icon: Activity },
    ],
  },
];

function RailItem({ item, badge, onNavigate, expanded }) {
  const Icon = item.icon;
  // `expanded` forces labels on regardless of viewport — the drawer is always
  // 240px wide even on a phone, so it should never render as an icon rail.
  const labelClass = expanded ? 'truncate' : 'hidden';
  const srLabelClass = expanded ? 'hidden' : 'sr-only';
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        [
          'group relative flex items-center h-10 rounded-field',
          expanded ? 'gap-3 px-3' : 'justify-center px-0',
          'font-ui text-body transition-colors duration-state ease-standard',
          focusRingOnDark,
          isActive
            ? 'bg-white/95 text-atlas-900 font-semibold shadow-[inset_0_1px_0_0_rgb(255_255_255/0.9)]'
            : 'text-atlas-100 hover:bg-white/[.14] hover:text-white',
        ].join(' ')
      }
      // aria-current is set by NavLink automatically as aria-current="page".
    >
      <Icon className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />

      {/* Label is hidden at collapsed rail width but stays in the accessible name. */}
      <span className={labelClass}>{item.label}</span>
      <span className={srLabelClass}>{item.label}</span>

      {badge > 0 && (
        <span
          className={
            expanded
              ? 'ml-auto shrink-0 min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-sem-conflict text-white font-data text-caption tabular-nums'
              : 'absolute right-1 top-1 shrink-0 min-w-4 h-4 px-1 inline-flex items-center justify-center rounded-full bg-sem-conflict text-white font-data text-[10px] leading-none tabular-nums'
          }
        >
          {badge}
          <span className="sr-only">
            {badge === 1 ? ' unresolved conflict' : ' unresolved conflicts'}
          </span>
        </span>
      )}

      {/* Flyout label for the collapsed rail only. Hover and focus both trigger
          it, so it is reachable without a pointer. */}
      {!expanded && (
        <span
          className="pointer-events-none absolute left-full ml-2 px-2 py-1 rounded-field
                     bg-atlas-900 text-white font-ui text-caption whitespace-nowrap opacity-0
                     group-hover:opacity-100 group-focus-visible:opacity-100
                     transition-opacity duration-state ease-standard z-railflyout shadow-overlay"
          aria-hidden="true"
        >
          {item.label}
        </span>
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
      className="h-full w-full glass-dark border-y-0 border-l-0 px-3 py-4 flex flex-col gap-1 overflow-y-auto"
    >
      {sections.map((section, i) => (
        <div key={section.label || `top-${i}`} className="flex flex-col gap-1">
          {section.label && (
            <>
              <hr className="my-2 border-white/15" aria-hidden="true" />
              <p
                className={`px-3 pb-1 font-ui text-micro uppercase text-atlas-300 ${
                  expanded ? '' : 'sr-only'
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
