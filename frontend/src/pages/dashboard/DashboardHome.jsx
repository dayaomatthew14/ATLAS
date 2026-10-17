import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Users, MapPin, AlertTriangle, Clock, Sparkles,
  CheckCircle2, FileDown, Send, Calendar, BookOpen,
  RefreshCw, ChevronRight, User, Filter, ArrowUpRight,
} from 'lucide-react';
import { api, API_BASE } from '../../utils/api';
import { getUserName, getDepartment } from '../../utils/session';
import { useToast } from '../../components/ToastProvider';
import { pluralize, resolveDepartment } from '../../components/ui/tokens';
import Button from '../../components/ui/Button';
import { Page, PageHeader, Panel, StatTile } from '../../components/ui/Page';

/**
 * Overview — Program Chair and Coordinator dashboard.
 *
 * Streamlined, high-signal summary of term health, readiness prerequisites,
 * and operational tools.
 */

const formatSemesterTerm = (term) => {
  if (!term) return '';
  if (term === '1st') return '1st Semester';
  if (term === '2nd') return '2nd Semester';
  if (term === '3rd semester' || term === '3rd') return '3rd Semester';
  return term;
};

const FACULTY_COLOR_PALETTES = [
  { name: 'teal', bg: 'bg-teal-50/80 border-teal-200/90', text: 'text-teal-950', badge: 'bg-teal-700 text-white', accent: 'border-l-teal-600', dot: 'bg-teal-500' },
  { name: 'indigo', bg: 'bg-indigo-50/80 border-indigo-200/90', text: 'text-indigo-950', badge: 'bg-indigo-700 text-white', accent: 'border-l-indigo-600', dot: 'bg-indigo-500' },
  { name: 'emerald', bg: 'bg-emerald-50/80 border-emerald-200/90', text: 'text-emerald-950', badge: 'bg-emerald-700 text-white', accent: 'border-l-emerald-600', dot: 'bg-emerald-500' },
  { name: 'violet', bg: 'bg-violet-50/80 border-violet-200/90', text: 'text-violet-950', badge: 'bg-violet-700 text-white', accent: 'border-l-violet-600', dot: 'bg-violet-500' },
  { name: 'sky', bg: 'bg-sky-50/80 border-sky-200/90', text: 'text-sky-950', badge: 'bg-sky-700 text-white', accent: 'border-l-sky-600', dot: 'bg-sky-500' },
  { name: 'purple', bg: 'bg-purple-50/80 border-purple-200/90', text: 'text-purple-950', badge: 'bg-purple-700 text-white', accent: 'border-l-purple-600', dot: 'bg-purple-500' },
  { name: 'cyan', bg: 'bg-cyan-50/80 border-cyan-200/90', text: 'text-cyan-950', badge: 'bg-cyan-700 text-white', accent: 'border-l-cyan-600', dot: 'bg-cyan-500' },
  { name: 'blue', bg: 'bg-blue-50/80 border-blue-200/90', text: 'text-blue-950', badge: 'bg-blue-700 text-white', accent: 'border-l-blue-600', dot: 'bg-blue-500' },
  { name: 'lime', bg: 'bg-lime-50/80 border-lime-200/90', text: 'text-lime-950', badge: 'bg-lime-700 text-white', accent: 'border-l-lime-600', dot: 'bg-lime-500' },
];

const getFacultyColor = (profName) => {
  if (!profName) return FACULTY_COLOR_PALETTES[0];
  let hash = 0;
  for (let i = 0; i < profName.length; i++) {
    hash = profName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % FACULTY_COLOR_PALETTES.length;
  return FACULTY_COLOR_PALETTES[index];
};

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LABELS = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
};

const to12h = (t) => {
  if (!t) return '';
  const [h, m] = String(t).split(':');
  const hr = parseInt(h, 10);
  if (Number.isNaN(hr)) return '';
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
};

const minutesOf = (t) => {
  const [h, m] = String(t || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const dayKey = (value) => {
  const head = String(value || '').trim().slice(0, 3).toLowerCase();
  return DAY_ORDER.find((d) => d.toLowerCase() === head) || '';
};

const formatSubjectCode = (sched) => {
  if (!sched || !sched.subject_code) return '';
  const rawCode = sched.subject_code;
  const abMatch = rawCode.match(/^(.*?)[_\-\s]*A\/B$/i);
  if (abMatch) {
    const baseCode = abMatch[1].trim();
    const isLec = !sched.room_id || sched.room_name === '—' || sched.room_name === '' || sched.part_type === 'lecture';
    return isLec ? `${baseCode}A` : `${baseCode}B`;
  }
  return rawCode;
};

export default function DashboardHome() {
  const { addToast } = useToast();
  const navigate = useNavigate();

  const college = resolveDepartment(getDepartment());

  const [activeSemester, setActiveSemester] = useState(null);
  const [isProcessing, setIsProcessing] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const [schedulesCount, setSchedulesCount] = useState(0);
  const [conflictsCount, setConflictsCount] = useState(0);
  const [roomsCount, setRoomsCount] = useState(0);
  const [facultyCount, setFacultyCount] = useState(0);
  const [facultyMissingAvail, setFacultyMissingAvail] = useState(0);

  const [weeklySchedules, setWeeklySchedules] = useState([]);
  const [selectedDay, setSelectedDay] = useState('Mon');
  const [selectedFacultyFilter, setSelectedFacultyFilter] = useState('all');

  const fetchStats = async () => {
    setIsLoading(true);
    try {
      const [schedules, semesters, faculty, conflicts, rooms] = await Promise.all([
        api.get('/schedules').catch(() => []),
        api.get('/semesters').catch(() => []),
        api.get('/professors').catch(() => []),
        api.get('/conflicts/count').catch((err) => {
          console.error('ATLAS: conflict count could not be read.', err);
          return { count: null };
        }),
        api.get('/rooms').catch(() => []),
      ]);

      const safeSemesters = Array.isArray(semesters) ? semesters : [];
      const safeSchedules = Array.isArray(schedules) ? schedules : [];
      const safeFaculty = Array.isArray(faculty) ? faculty : [];
      const safeRooms = Array.isArray(rooms) ? rooms : [];

      const activeSem = safeSemesters.find((s) => s.is_active);
      setActiveSemester(activeSem || null);

      setSchedulesCount(safeSchedules.length);
      setConflictsCount(conflicts?.count ?? null);
      setRoomsCount(safeRooms.length);
      setFacultyCount(safeFaculty.length);
      setFacultyMissingAvail(safeFaculty.filter((f) => !f.max_units || f.max_units === 0).length);

      if (activeSem) {
        const globalScheds = await api.get(`/ai-scheduler/global-schedule?semester_id=${activeSem.id}`).catch(() => []);
        const validGlobal = Array.isArray(globalScheds) ? globalScheds : [];
        if (validGlobal.length > 0) {
          setWeeklySchedules(validGlobal);
        } else if (safeSchedules.length > 0) {
          const fallback = safeSchedules.map((s) => ({
            id: s.id,
            curriculum_id: s.curriculum_id,
            faculty_id: s.faculty_id,
            subject_code: s.curriculum?.code || s.subject_code || '',
            subject_name: s.curriculum?.name || s.subject_name || '',
            faculty_name: s.faculty ? `${s.faculty.first_name} ${s.faculty.last_name}` : (s.faculty_name || 'TBA'),
            room_name: s.room?.name || s.room_name || '—',
            room_building: s.room?.building || s.room_building || '',
            day_of_week: s.day_of_week,
            start_time: s.start_time,
            end_time: s.end_time,
            section: s.section || '',
          }));
          setWeeklySchedules(fallback);
        } else {
          setWeeklySchedules([]);
        }
      } else {
        setWeeklySchedules([]);
      }
    } catch (e) {
      console.error('Failed to fetch dashboard stats', e);
    } finally {
      setIsLoading(false);
    }
  };

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
          const res = await api.post(`/notifications/notify-faculty?semester_id=${activeSemester.id}`);
          const sent = Number(res?.sent_count) || 0;
          const skipped = Number(res?.skipped_no_contact) || 0;

          if (sent === 0) {
            addToast(
              skipped > 0
                ? `No one was notified. ${pluralize(skipped, 'faculty member')} has no email address on file.`
                : 'No one was notified. Check that email delivery is set up.',
              'warning',
            );
          } else {
            addToast(
              skipped > 0
                ? `Notified ${pluralize(sent, 'faculty member')}. ${skipped} skipped with no email address.`
                : `Notified ${pluralize(sent, 'faculty member')}.`,
              'success',
            );
          }
        } else {
          addToast('No active semester found.', 'error');
        }
      }
    } catch {
      addToast('Action failed: the service is unavailable.', 'error');
    } finally {
      setIsProcessing('');
    }
  };

  /* ---------------------------------------------------------------- derived */

  const todayIndex = new Date().getDay();
  const todayDayKey = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][todayIndex];

  const facultyOptions = useMemo(() => {
    const names = new Set();
    weeklySchedules.forEach((s) => {
      if (s.faculty_name && s.faculty_name !== 'TBA') {
        names.add(s.faculty_name);
      }
    });
    return Array.from(names).sort();
  }, [weeklySchedules]);

  const filteredSchedules = useMemo(() => {
    let result = weeklySchedules;
    if (selectedFacultyFilter !== 'all') {
      result = result.filter((s) => s.faculty_name === selectedFacultyFilter);
    }
    return result;
  }, [weeklySchedules, selectedFacultyFilter]);

  const daySchedulesMap = useMemo(() => {
    const map = {
      Mon: [],
      Tue: [],
      Wed: [],
      Thu: [],
      Fri: [],
      Sat: [],
    };
    filteredSchedules.forEach((s) => {
      const key = dayKey(s.day_of_week);
      if (key && map[key]) {
        map[key].push(s);
      }
    });
    DAY_ORDER.forEach((day) => {
      map[day].sort((a, b) => minutesOf(a.start_time) - minutesOf(b.start_time));
    });
    return map;
  }, [filteredSchedules]);

  const totalWeeklyHours = useMemo(() => {
    return filteredSchedules.reduce((acc, s) => {
      const dur = (minutesOf(s.end_time) - minutesOf(s.start_time)) / 60;
      return acc + (dur > 0 ? dur : 0);
    }, 0);
  }, [filteredSchedules]);

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
        eyebrow={college.code ? `${college.code} · Overview` : 'Overview'}
        title={`Good to see you, ${getUserName() || 'there'}`}
        meta={
          activeSemester
            ? `${activeSemester.academic_year} · ${formatSemesterTerm(activeSemester.term)}`
            : 'No active academic term'
        }
        actions={
          <Button
            variant="secondary"
            icon={RefreshCw}
            loading={isLoading}
            onClick={fetchStats}
          >
            Refresh
          </Button>
        }
      />

      {/* Metric Stat Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mb-6">
        {[
          {
            label: 'Classes scheduled',
            value: schedulesCount,
            icon: Calendar,
            to: '/dashboard/schedules',
            hint: schedulesCount > 0 ? `${pluralize(schedulesCount, 'class', 'classes')} active` : 'No classes placed',
          },
          {
            label: 'Faculty',
            value: facultyCount,
            icon: Users,
            to: '/dashboard/teachers',
            hint: facultyMissingAvail > 0 ? `${facultyMissingAvail} without a cap` : 'All caps configured',
            tone: facultyMissingAvail > 0 ? 'warning' : 'default',
          },
          {
            label: 'Rooms',
            value: roomsCount,
            icon: MapPin,
            to: '/dashboard/rooms',
            hint: roomsCount > 0 ? `${pluralize(roomsCount, 'room')} registered` : 'No rooms registered',
            tone: roomsCount === 0 ? 'warning' : 'default',
          },
          {
            label: 'Schedule Health',
            value: conflictsCount === null ? '—' : conflictsCount,
            icon: AlertTriangle,
            to: '/dashboard/schedules',
            hint: conflictsCount === null ? 'Count unavailable' : conflictsCount > 0 ? `${pluralize(conflictsCount, 'conflict')} detected` : 'Zero clashes detected',
            tone: conflictsCount === null ? 'warning' : conflictsCount > 0 ? 'conflict' : 'good',
          },
        ].map((s, i) => (
          <div key={s.label} className="rise" style={{ animationDelay: `${i * 60}ms` }}>
            <StatTile {...s} />
          </div>
        ))}
      </div>

      {/* Weekly Schedule Calendar Panel — Replacing the old checklist & cards */}
      <Panel
        className="rise"
        style={{ animationDelay: '240ms' }}
        icon={Calendar}
        accent={conflictsCount > 0 ? 'warning' : 'default'}
        title="Weekly Schedule Overview"
        description={
          activeSemester
            ? `Summarized plotted timetable for ${activeSemester.academic_year} · ${formatSemesterTerm(activeSemester.term)}`
            : 'Summarized plotted timetable for the active academic term'
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            {conflictsCount > 0 && (
              <Button
                variant="secondary"
                icon={Sparkles}
                loading={isProcessing === 'resolve'}
                onClick={() => handleQuickAction('resolve')}
                className="text-amber-800 border-amber-500/30 hover:bg-amber-500/10 text-xs px-3 py-1.5"
              >
                Resolve Clashes
              </Button>
            )}
            <Button
              variant="secondary"
              icon={FileDown}
              loading={isProcessing === 'pdf'}
              onClick={() => handleQuickAction('pdf')}
              className="text-xs px-3 py-1.5"
            >
              Export PDF
            </Button>
            <Button
              variant="secondary"
              icon={Send}
              loading={isProcessing === 'notify'}
              onClick={() => handleQuickAction('notify')}
              className="text-xs px-3 py-1.5"
            >
              Notify Faculty
            </Button>
            <Button
              variant="primary"
              icon={ChevronRight}
              onClick={() => navigate('/dashboard/schedules')}
              className="text-xs px-3 py-1.5"
            >
              Full Timetable
            </Button>
          </div>
        }
      >
        {/* Top Control Bar & Filter Tabs */}
        <div className="px-6 pt-5 pb-4 border-b border-emerald-900/10 flex flex-wrap items-center justify-between gap-4 bg-slate-50/50">
          {/* Day selection tabs */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-slate-200/60 border border-slate-200/80">
            {DAY_ORDER.map((day) => {
              const count = daySchedulesMap[day]?.length || 0;
              const isToday = day === todayDayKey;
              const isSelected = selectedDay === day;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className={`px-3.5 py-2 rounded-lg font-ui text-caption font-bold flex items-center gap-2 transition-all ${
                    isSelected
                      ? 'bg-emerald-800 text-white shadow-xs'
                      : 'text-slate-800 hover:text-emerald-950 hover:bg-white/60'
                  }`}
                >
                  <span>{day}</span>
                  {count > 0 && (
                    <span
                      className={`text-micro px-1.5 py-0.5 rounded-full tabular-nums font-bold ${
                        isSelected
                          ? 'bg-emerald-950/40 text-emerald-100'
                          : 'bg-emerald-800/10 text-emerald-900'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                  {isToday && !isSelected && (
                    <span className="w-2 h-2 rounded-full bg-emerald-600" title="Today" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Right side: Faculty filter & KPI summary pill */}
          <div className="flex items-center gap-3">
            {facultyOptions.length > 1 && (
              <div className="flex items-center gap-2">
                <label htmlFor="calendar-faculty-filter" className="font-ui text-caption font-semibold text-slate-700 sr-only">
                  Filter by Faculty
                </label>
                <select
                  id="calendar-faculty-filter"
                  value={selectedFacultyFilter}
                  onChange={(e) => setSelectedFacultyFilter(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-3 py-2 font-ui text-caption font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-800"
                >
                  <option value="all">All Faculty ({facultyOptions.length})</option>
                  {facultyOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="hidden sm:flex items-center gap-2 text-caption font-semibold text-slate-700 bg-white/90 border border-slate-300 rounded-lg px-3.5 py-2 tabular-nums">
              <span className="text-emerald-900 font-bold">{filteredSchedules.length}</span>
              <span>{pluralize(filteredSchedules.length, 'class', 'classes')}</span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-800 font-bold">{totalWeeklyHours.toFixed(1)} hrs/wk</span>
            </div>
          </div>
        </div>

        {/* Calendar Body */}
        {filteredSchedules.length === 0 ? (
          <div className="p-12 sm:p-16 text-center flex flex-col items-center justify-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-800/10 border border-emerald-800/20 text-emerald-800 flex items-center justify-center mb-4">
              <Calendar className="w-7 h-7 stroke-[2]" />
            </div>
            <h3 className="font-display text-lg font-bold text-emerald-950">
              {weeklySchedules.length === 0 ? 'No classes scheduled for this term' : 'No classes match this filter'}
            </h3>
            <p className="font-ui text-body text-slate-600 max-w-md mt-1 mb-6 leading-relaxed">
              {weeklySchedules.length === 0
                ? 'Generate an AI-optimized schedule or plot subjects manually in the Schedule studio to see your weekly timetable overview here.'
                : 'Try resetting the faculty filter to see the other classes scheduled.'}
            </p>
            {weeklySchedules.length === 0 ? (
              <Button variant="primary" icon={Sparkles} onClick={() => navigate('/dashboard/schedules')}>
                Go to Schedule Studio
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() => {
                  setSelectedDay('Mon');
                  setSelectedFacultyFilter('all');
                }}
              >
                Reset Filters
              </Button>
            )}
          </div>
        ) : (
          /* Day Detailed Agenda View */
          <div className="p-6">
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-emerald-900/10">
              <div>
                <h3 className="font-display text-lead font-bold text-emerald-950 flex items-center gap-2.5">
                  <span>{DAY_LABELS[selectedDay]} Schedule</span>
                  {selectedDay === todayDayKey && (
                    <span className="font-ui text-micro font-bold px-2.5 py-0.5 rounded-full bg-emerald-800 text-white uppercase tracking-wider">
                      Today
                    </span>
                  )}
                </h3>
                <p className="font-ui text-caption text-slate-600 mt-1 font-medium">
                  {daySchedulesMap[selectedDay]?.length || 0} {pluralize(daySchedulesMap[selectedDay]?.length || 0, 'class', 'classes')} plotted
                  {daySchedulesMap[selectedDay]?.length > 0 && (
                    <>
                      {' · '}
                      <span className="tabular-nums font-bold text-slate-800">
                        {daySchedulesMap[selectedDay]
                          .reduce((sum, c) => sum + (minutesOf(c.end_time) - minutesOf(c.start_time)) / 60, 0)
                          .toFixed(1)}{' '}
                        hrs
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>

            {daySchedulesMap[selectedDay]?.length === 0 ? (
              <div className="py-16 text-center text-slate-400 font-ui text-body flex flex-col items-center justify-center">
                <Calendar className="w-8 h-8 text-slate-400 stroke-[1.5] mb-2" />
                <p className="font-semibold text-slate-600">No classes scheduled on {DAY_LABELS[selectedDay]}</p>
                <p className="text-caption text-slate-500 mt-1">Select another day above to view scheduled classes.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {daySchedulesMap[selectedDay].map((sched) => {
                  const color = getFacultyColor(sched.faculty_name);
                  return (
                    <div
                      key={sched.id}
                      className={`rounded-2xl border border-l-[6px] p-4.5 shadow-xs hover:shadow-md transition-all duration-150 flex flex-col justify-between gap-3.5 bg-white ${color.bg} ${color.border} ${color.accent}`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-data text-table font-bold text-emerald-950">
                            {formatSubjectCode(sched)}
                          </span>
                          <span className="font-data text-caption font-bold text-slate-800 bg-white/95 border border-slate-200 px-2.5 py-1 rounded tabular-nums shadow-xs">
                            {to12h(sched.start_time)} – {to12h(sched.end_time)}
                          </span>
                        </div>
                        <h4 className="font-ui text-body font-bold text-slate-900 mt-2 leading-snug">
                          {sched.subject_name}
                        </h4>
                      </div>

                      <div className="pt-3 border-t border-black/5 flex flex-col gap-2 text-caption font-medium text-slate-700">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-indigo-700 shrink-0" />
                          <span className="font-bold text-slate-800">{sched.faculty_name || 'TBA'}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-emerald-700 shrink-0" />
                            <span className="text-slate-700">
                              {sched.room_name && sched.room_name !== '—'
                                ? sched.room_name
                                : 'No room assigned'}
                              {sched.room_building ? ` · ${sched.room_building}` : ''}
                            </span>
                          </span>
                          {sched.section && (
                            <span className="font-data text-micro font-bold text-slate-700 bg-slate-200/80 px-2.5 py-0.5 rounded">
                              Section {sched.section}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Panel>
    </Page>
  );
}
