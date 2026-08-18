import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, MapPin, AlertTriangle, Clock, Activity, Sparkles, Check,
  FileDown, Send, Calendar, BookOpen,
} from 'lucide-react';
import { api, API_BASE } from '../../utils/api';
import { getUserName, getDepartment } from '../../utils/session';
import { useToast } from '../../components/ToastProvider';
import { pluralize, resolveDepartment } from '../../components/ui/tokens';
import Button from '../../components/ui/Button';
import { Page, PageHeader, Panel, StatTile, LinkRow } from '../../components/ui/Page';

/**
 * Overview — program chair and coordinator.
 *
 * Rewritten onto the design system. What was here was a marketing page: a
 * gradient hero with two blurred colour orbs, a pinging halo behind a shield
 * icon, "Master the Schedule." in gradient text, and a "Workspace Health"
 * card that displayed a heading and a badge reading "Diagnostics" and no
 * measurement of anything. None of it told a chair what to do next, which is
 * the only question this screen exists to answer.
 *
 * What replaced it is the same data in the system's own language: four
 * numbers, a readiness checklist that says whether you can generate yet, the
 * things blocking you, and the recent activity.
 */

const formatSemesterTerm = (term) => {
  if (!term) return '';
  if (term === '1st') return '1st Semester';
  if (term === '2nd') return '2nd Semester';
  if (term === '3rd semester') return '3rd Semester';
  return term;
};

const timeAgo = (value) => {
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return '';
  const mins = Math.round((Date.now() - then.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} ${hrs === 1 ? 'hour' : 'hours'} ago`;
  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

export default function DashboardHome() {
  const { addToast } = useToast();
  const navigate = useNavigate();

  const college = resolveDepartment(getDepartment());

  const [activeSemester, setActiveSemester] = useState(null);
  const [recentLogs, setRecentLogs] = useState([]);
  const [isProcessing, setIsProcessing] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const [schedulesCount, setSchedulesCount] = useState(0);
  const [conflictsCount, setConflictsCount] = useState(0);
  const [roomsCount, setRoomsCount] = useState(0);
  const [facultyCount, setFacultyCount] = useState(0);
  const [facultyMissingAvail, setFacultyMissingAvail] = useState(0);
  const [offeringsCount, setOfferingsCount] = useState(0);

  const fetchStats = async () => {
    setIsLoading(true);
    try {
      const [schedules, semesters, faculty, conflicts, logsData, rooms] = await Promise.all([
        api.get('/schedules').catch(() => []),
        api.get('/semesters').catch(() => []),
        api.get('/professors').catch(() => []),
        // Not `.catch(() => ({ count: 0 }))`. Zero paints the Conflicts tile
        // green; a request that failed has not established that anything is
        // clean. `null` flows through as the "unknown" state below.
        api.get('/conflicts/count').catch((err) => {
          console.error('ATLAS: conflict count could not be read.', err);
          return { count: null };
        }),
        api.get('/logs?limit=5').catch(() => []),
        api.get('/rooms').catch(() => []),
      ]);

      const safeSemesters = Array.isArray(semesters) ? semesters : [];
      const safeSchedules = Array.isArray(schedules) ? schedules : [];
      const safeFaculty = Array.isArray(faculty) ? faculty : [];
      const safeRooms = Array.isArray(rooms) ? rooms : [];
      const safeLogs = Array.isArray(logsData) ? logsData : [];

      const activeSem = safeSemesters.find((s) => s.is_active);
      setActiveSemester(activeSem || null);
      setRecentLogs(safeLogs);

      setSchedulesCount(safeSchedules.length);
      setConflictsCount(conflicts?.count ?? null);
      setRoomsCount(safeRooms.length);
      setFacultyCount(safeFaculty.length);
      setFacultyMissingAvail(safeFaculty.filter((f) => !f.max_units || f.max_units === 0).length);

      if (activeSem) {
        const offerings = await api.get(`/subject-offerings?semester_id=${activeSem.id}`).catch(() => []);
        setOfferingsCount(Array.isArray(offerings) ? offerings.length : 0);
      } else {
        setOfferingsCount(0);
      }
    } catch (e) {
      console.error('Failed to fetch dashboard stats', e);
    } finally {
      setIsLoading(false);
    }
  };

  // Load once on mount. This screen only ever serves chairs and coordinators
  // now, so there is no role to re-key the fetch on.
  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      if (e.altKey) {
        switch (e.key.toLowerCase()) {
          case 's': e.preventDefault(); navigate('/dashboard/schedules'); break;
          case 't': e.preventDefault(); navigate('/dashboard/teachers'); break;
          case 'r': e.preventDefault(); navigate('/dashboard/rooms'); break;
          case 'c': e.preventDefault(); navigate('/dashboard/curriculum'); break;
          case 'p': e.preventDefault(); navigate('/dashboard/profile'); break;
          default: break;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  const handleQuickAction = async (action) => {
    setIsProcessing(action);
    try {
      if (action === 'pdf') {
        // HEU-03: `api` is a plain object with no `defaults`, so this threw a
        // TypeError the moment the button was clicked. It also hardcoded
        // semester_id=1 rather than using the active term.
        if (!activeSemester) {
          addToast('Set an active term before exporting a schedule.', 'warning');
          return;
        }
        window.open(`${API_BASE}/schedules/export/pdf?semester_id=${activeSemester.id}`, '_blank');
        addToast('Preparing the schedule PDF.', 'success');
      } else if (action === 'resolve') {
        await api.post('/ai-scheduler/resolve-conflicts', []);
        addToast('Conflict resolution completed.', 'success');
        fetchStats();
      } else if (action === 'notify') {
        if (activeSemester) {
          await api.post(`/notifications/notify-faculty?semester_id=${activeSemester.id}`);
          addToast('All faculty members notified.', 'success');
        } else {
          addToast('No active semester found.', 'error');
        }
      }
    } catch (e) {
      addToast('Action failed: the service is unavailable.', 'error');
    } finally {
      setIsProcessing('');
    }
  };

  /* ---------------------------------------------------------------- derived */

  const readiness = [
    { label: 'Academic term', ready: Boolean(activeSemester), to: '/dashboard/semesters',
      detail: activeSemester ? `${activeSemester.academic_year} ${formatSemesterTerm(activeSemester.term)}` : 'None active' },
    { label: 'Rooms', ready: roomsCount > 0, to: '/dashboard/rooms',
      detail: roomsCount > 0 ? pluralize(roomsCount, 'room') : 'None registered' },
    { label: 'Faculty', ready: facultyCount > 0 && facultyMissingAvail === 0, to: '/dashboard/teachers',
      detail: facultyCount === 0 ? 'None added'
        : facultyMissingAvail > 0 ? `${facultyMissingAvail} without a unit cap`
        : pluralize(facultyCount, 'member') },
    { label: 'Subject offerings', ready: offeringsCount > 0, to: '/dashboard/teachers',
      detail: offeringsCount > 0 ? pluralize(offeringsCount, 'offering') : 'None assigned' },
    { label: 'Schedule', ready: schedulesCount > 0, to: '/dashboard/schedules',
      detail: schedulesCount > 0 ? pluralize(schedulesCount, 'class', 'classes') : 'Not generated' },
  ];

  const blockers = [
    conflictsCount === null && {
      id: 'conflicts-unknown', to: '/dashboard/schedules', icon: AlertTriangle, iconClass: 'text-sem-warning',
      label: 'Conflict check unavailable',
      detail: 'The number of conflicts could not be read, so this timetable is unverified — not clean.',
    },
    conflictsCount > 0 && {
      id: 'conflicts', to: '/dashboard/schedules', icon: AlertTriangle, iconClass: 'text-sem-conflict',
      label: `${pluralize(conflictsCount, 'unresolved conflict')}`,
      detail: 'Resolve these before the timetable can be relied on.',
    },
    facultyMissingAvail > 0 && {
      id: 'avail', to: '/dashboard/teachers', icon: Users, iconClass: 'text-sem-warning',
      label: `${pluralize(facultyMissingAvail, 'faculty member')} without a teaching cap`,
      detail: 'Generation cannot respect a limit that is not set.',
    },
    offeringsCount === 0 && {
      id: 'offerings', to: '/dashboard/teachers', icon: BookOpen, iconClass: 'text-sem-warning',
      label: 'No subjects assigned to anyone',
      detail: 'Assign subjects to professors before generating.',
    },
    roomsCount === 0 && {
      id: 'rooms', to: '/dashboard/rooms', icon: MapPin, iconClass: 'text-sem-warning',
      label: 'No rooms registered',
      detail: 'Laboratories need a room to be scheduled into.',
    },
    !activeSemester && {
      id: 'term', to: '/dashboard/semesters', icon: Calendar, iconClass: 'text-sem-warning',
      label: 'No active academic term',
      detail: 'Nothing can be generated until one is active.',
    },
  ].filter(Boolean);

  const quickActions = [
    { id: 'resolve', label: 'Resolve conflicts', icon: Sparkles },
    { id: 'pdf', label: 'Export schedule PDF', icon: FileDown },
    { id: 'notify', label: 'Notify faculty', icon: Send },
  ];

  if (isLoading) {
    return (
      <Page>
        <div className="flex flex-col gap-6" aria-busy="true">
          <div className="h-10 w-64 rounded-field bg-atlas-line animate-pulse motion-reduce:animate-none" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-28 glass rounded-panel animate-pulse motion-reduce:animate-none" />
            ))}
          </div>
          <div className="h-64 glass rounded-panel animate-pulse motion-reduce:animate-none" />
          <span className="sr-only">Loading…</span>
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title={`Good to see you, ${getUserName() || 'there'}`}
        meta={
          activeSemester
            ? `${college.code} · ${activeSemester.academic_year} ${formatSemesterTerm(activeSemester.term)}`
            : `${college.code} · no active academic term`
        }
        note={
          blockers.length === 0
            ? 'Everything is in place. You can generate the timetable.'
            : `${pluralize(blockers.length, 'thing')} to sort out before generating.`
        }
        actions={
          <Button icon={Calendar} onClick={() => navigate('/dashboard/schedules')}>
            Open Schedule
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Classes scheduled', value: schedulesCount, icon: Calendar, to: '/dashboard/schedules' },
          { label: 'Faculty', value: facultyCount, icon: Users, to: '/dashboard/teachers',
            hint: facultyMissingAvail > 0 ? `${facultyMissingAvail} without a cap` : undefined,
            tone: facultyMissingAvail > 0 ? 'warning' : 'default' },
          { label: 'Rooms', value: roomsCount, icon: MapPin, to: '/dashboard/rooms' },
          // A green "0" is a claim that the timetable is clean. Only make it
          // when the count actually came back; unknown reads as a warning "—".
          { label: 'Conflicts', value: conflictsCount === null ? '—' : conflictsCount,
            icon: AlertTriangle, to: '/dashboard/schedules',
            hint: conflictsCount === null ? 'Count unavailable' : undefined,
            tone: conflictsCount === null ? 'warning' : conflictsCount > 0 ? 'conflict' : 'good' },
        ].map((s, i) => (
          // 60ms apart, per the Standard stagger tier — the grid settles in
          // reading order instead of all four landing at once.
          <div key={s.label} className="rise" style={{ animationDelay: `${i * 60}ms` }}>
            <StatTile {...s} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Panel
          className="lg:col-span-2 rise"
          style={{ animationDelay: '240ms' }}
          icon={Check}
          accent
          title="Before you generate"
          description="Each of these has to be in place for the timetable to come out right."
        >
          <ul className="divide-y divide-white/45">
            {readiness.map((item) => (
              <li key={item.label}>
                <button
                  type="button"
                  onClick={() => navigate(item.to)}
                  className="group w-full flex items-center gap-4 px-5 py-3.5 text-left transition-colors
                             duration-state ease-standard hover:bg-atlas-50
                             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atlas-700 focus-visible:ring-inset"
                >
                  <span
                    aria-hidden="true"
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0
                                transition-transform duration-overlay ease-emphasis group-hover:scale-110 ${
                      item.ready ? 'bg-atlas-100 text-atlas-700' : 'bg-sem-warning-bg text-sem-warning'
                    }`}
                  >
                    {item.ready ? <Check className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-ui text-body text-atlas-ink">{item.label}</span>
                    <span className="block font-ui text-caption text-atlas-slate truncate">{item.detail}</span>
                  </span>
                  <span
                    className={`font-ui text-caption shrink-0 ${
                      item.ready ? 'text-atlas-700' : 'text-sem-warning'
                    }`}
                  >
                    {item.ready ? 'Ready' : 'Pending'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          className="rise"
          style={{ animationDelay: '300ms' }}
          icon={blockers.length ? AlertTriangle : Check}
          accent={blockers.length ? 'warning' : undefined}
          title={blockers.length ? `Needs attention (${blockers.length})` : 'Needs attention'}
        >
          {blockers.length === 0 ? (
            <p className="px-5 py-10 font-ui text-body text-atlas-slate text-center">
              Nothing is blocking you.
            </p>
          ) : (
            <ul className="divide-y divide-white/45">
              {blockers.map((b) => (
                <LinkRow
                  key={b.id}
                  to={b.to}
                  icon={b.icon}
                  iconClass={b.iconClass}
                  label={b.label}
                  detail={b.detail}
                />
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-5">
        <Panel
          className="lg:col-span-2 rise"
          style={{ animationDelay: '360ms' }}
          icon={Activity}
          title="Recent activity"
          description="The last few changes in your college."
        >
          {recentLogs.length === 0 ? (
            <p className="px-5 py-10 font-ui text-body text-atlas-slate text-center">
              Nothing has happened yet.
            </p>
          ) : (
            <ul className="divide-y divide-white/45">
              {recentLogs.map((log) => (
                <li key={log.id} className="flex items-start gap-3 px-5 py-3.5">
                  <span
                    aria-hidden="true"
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      log.status === 'error' ? 'bg-sem-conflict-bg text-sem-conflict'
                      : log.status === 'warning' ? 'bg-sem-warning-bg text-sem-warning'
                      : 'bg-atlas-100 text-atlas-700'
                    }`}
                  >
                    <Activity className="w-3.5 h-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-ui text-body text-atlas-ink">{log.action}</span>
                    {log.details && (
                      <span className="block font-ui text-caption text-atlas-slate mt-0.5">{log.details}</span>
                    )}
                  </span>
                  <span className="font-ui text-caption text-atlas-slate shrink-0 tabular-nums">
                    {timeAgo(log.timestamp)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="rise" style={{ animationDelay: '420ms' }} icon={Sparkles} title="Quick actions">
          <div className="p-4 flex flex-col gap-2">
            {quickActions.map((a) => (
              <Button
                key={a.id}
                variant="secondary"
                icon={a.icon}
                loading={isProcessing === a.id}
                disabled={Boolean(isProcessing) && isProcessing !== a.id}
                onClick={() => handleQuickAction(a.id)}
                className="justify-start w-full"
              >
                {a.label}
              </Button>
            ))}
          </div>
        </Panel>
      </div>
    </Page>
  );
}
