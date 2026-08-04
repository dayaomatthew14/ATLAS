import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Calendar, BookOpen, Users, MapPin, Activity, ShieldCheck, CalendarRange,
} from 'lucide-react';
import { focusRingOnDark } from '../ui/tokens';

/**
 * ATLAS navigation rail. Phase 2 Screen 1.
 *
 * Replaces the horizontal top nav, which forced the page to 1304px at a 946px
 * viewport because six nowrap links in a flex-1 container could not shrink.
 * A rail also frees the horizontal axis for the timetable, which needs 904px.
 *
 * One label per destination, for every role. The previous nav gave admins
 * "Campus Rooms" and chairs "Rooms" for the same route (IA-02), and omitted
 * Schedule and Faculty from the admin nav entirely (INV-01) even though the
 * router grants admins both.
 */

// Working destinations — every role.
const WORKING = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/dashboard/schedules', label: 'Schedule', icon: Calendar },
  { to: '/dashboard/curriculum', label: 'Curriculum', icon: BookOpen },
  { to: '/dashboard/teachers', label: 'Faculty', icon: Users },
  { to: '/dashboard/rooms', label: 'Rooms', icon: MapPin },
  { to: '/dashboard/logs', label: 'Activity', icon: Activity },
];

// Administration — admin only. Absent, not disabled: these are whole
// capabilities outside a chair's remit, so they should not appear at all.
const ADMINISTRATION = [
  { to: '/dashboard/users', label: 'Users', icon: ShieldCheck },
  { to: '/dashboard/semesters', label: 'Terms', icon: CalendarRange },
];

function RailItem({ item, badge, onNavigate, expanded }) {
  const Icon = item.icon;
  // `expanded` forces labels on regardless of viewport — the drawer is always
  // 240px wide even on a phone, so it should never render as an icon rail.
  const labelClass = expanded ? 'truncate' : 'truncate hidden wide:inline';
  const srLabelClass = expanded ? 'hidden' : 'sr-only wide:hidden';
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        [
          'group relative flex items-center gap-3 h-10 px-3 rounded-field',
          'font-ui text-body transition-colors duration-state ease-standard',
          focusRingOnDark,
          isActive
            ? 'bg-white text-atlas-900 font-semibold'
            : 'text-atlas-100 hover:bg-white/10 hover:text-white',
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
              : 'absolute right-1 top-1 wide:static wide:ml-auto shrink-0 min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-sem-conflict text-white font-data text-caption tabular-nums'
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
          className="wide:hidden pointer-events-none absolute left-full ml-2 px-2 py-1 rounded-field
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
  const isAdmin = role === 'admin';

  return (
    <nav
      aria-label="Primary"
      className="h-full w-full bg-atlas-900 px-3 py-4 flex flex-col gap-1 overflow-y-auto"
    >
      {WORKING.map((item) => (
        <RailItem
          key={item.to}
          item={item}
          badge={item.to === '/dashboard/schedules' ? conflictCount : 0}
          onNavigate={onNavigate}
          expanded={expanded}
        />
      ))}

      {isAdmin && (
        <>
          <hr className="my-3 border-white/15" />
          <p className={`px-3 pb-1 font-ui text-micro uppercase text-atlas-300 ${expanded ? '' : 'hidden wide:block'}`}>
            Administration
          </p>
          {ADMINISTRATION.map((item) => (
            <RailItem key={item.to} item={item} onNavigate={onNavigate} expanded={expanded} />
          ))}
        </>
      )}
    </nav>
  );
}
