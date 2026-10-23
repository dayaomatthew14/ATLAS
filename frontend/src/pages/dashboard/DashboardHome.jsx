import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Users, AlertTriangle, Sparkles,
  FileSpreadsheet, Calendar, RefreshCw, ChevronRight,
  CheckCircle2, BookOpen, Clock, Check, ArrowRight,
} from 'lucide-react';
import { api, API_BASE } from '../../utils/api';
import { getUserName, getDepartment } from '../../utils/session';
import { useToast } from '../../components/ToastProvider';
import { pluralize, resolveDepartment } from '../../components/ui/tokens';
import Button from '../../components/ui/Button';
import { Page, PageHeader, StatTile } from '../../components/ui/Page';

/**
 * Overview — Program Chair and Coordinator dashboard.
 *
 * Academic Term Readiness & Action Hub:
 * Provides immediate visibility into scheduling prerequisites (term, curriculum,
 * faculty workload limits, conflicts) paired with quick
 * operational actions (Export PDF, Notify Faculty, Open Schedule Studio).
 */

const formatSemesterTerm = (term) => {
  if (!term) return '';
  if (term === '1st') return '1st Semester';
  if (term === '2nd') return '2nd Semester';
  if (term === '3rd semester' || term === '3rd') return '3rd Semester';
  return term;
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
  const [facultyCount, setFacultyCount] = useState(0);
  const [facultyMissingAvail, setFacultyMissingAvail] = useState(0);
  const [curriculumCount, setCurriculumCount] = useState(0);

  const fetchStats = async () => {
    setIsLoading(true);
    try {
      const [schedules, semesters, faculty, conflicts, curriculum] = await Promise.all([
        api.get('/schedules').catch(() => []),
        api.get('/semesters').catch(() => []),
        api.get('/professors').catch(() => []),
        api.get('/conflicts/count').catch((err) => {
          console.error('ATLAS: conflict count could not be read.', err);
          return { count: null };
        }),
        api.get('/curriculum').catch(() => []),
      ]);

      const safeSemesters = Array.isArray(semesters) ? semesters : [];
      const safeSchedules = Array.isArray(schedules) ? schedules : [];
      const safeFaculty = Array.isArray(faculty) ? faculty : [];
      const safeCurriculum = Array.isArray(curriculum) ? curriculum : [];

      const activeSem = safeSemesters.find((s) => s.is_active);
      setActiveSemester(activeSem || null);

      setSchedulesCount(safeSchedules.length);
      setConflictsCount(conflicts?.count ?? null);
      setFacultyCount(safeFaculty.length);
      setFacultyMissingAvail(safeFaculty.filter((f) => !f.max_units || f.max_units === 0).length);
      setCurriculumCount(safeCurriculum.length);
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
      if (action === 'excel') {
        if (!activeSemester) {
          addToast('Set an active term before exporting a schedule.', 'warning');
          return;
        }
        window.open(`${API_BASE}/schedules/export/excel?semester_id=${activeSemester.id}`, '_blank');
        addToast('Preparing schedule Excel spreadsheet.', 'success');
      } else if (action === 'resolve') {
        await api.post('/ai-scheduler/resolve-conflicts', []);
        addToast('Conflict resolution completed.', 'success');
        fetchStats();
      }
    } catch {
      addToast('Action failed: the service is unavailable.', 'error');
    } finally {
      setIsProcessing('');
    }
  };

  /* ---------------------------------------------------------------- readiness items */

  const readiness = [
    {
      id: 'term',
      label: 'Active Academic Term',
      ready: Boolean(activeSemester),
      detail: activeSemester
        ? `${activeSemester.academic_year} · ${formatSemesterTerm(activeSemester.term)} active`
        : 'No academic term activated yet',
      icon: Calendar,
      to: null,
      statusLabel: Boolean(activeSemester) ? 'Configured' : 'Pending',
    },
    {
      id: 'curriculum',
      label: 'Curriculum & Courses',
      ready: curriculumCount > 0,
      detail: curriculumCount > 0
        ? `${curriculumCount} curriculum subjects available for assignment`
        : 'No curriculum subjects registered',
      icon: BookOpen,
      to: '/dashboard/curriculum',
      statusLabel: curriculumCount > 0 ? 'Ready' : 'Pending',
    },
    {
      id: 'faculty',
      label: 'Faculty & Workload Limits',
      ready: facultyCount > 0 && facultyMissingAvail === 0,
      detail: facultyCount > 0
        ? (facultyMissingAvail > 0
            ? `${facultyCount} faculty registered (${facultyMissingAvail} missing workload caps)`
            : `${pluralize(facultyCount, 'faculty member')} configured with teaching limits`)
        : 'No faculty members registered',
      icon: Users,
      to: '/dashboard/teachers',
      statusLabel: facultyCount > 0 && facultyMissingAvail === 0 ? 'Ready' : 'Action Needed',
    },
    {
      id: 'conflicts',
      label: 'Schedule Quality & Verification',
      ready: schedulesCount > 0 && conflictsCount === 0,
      detail: schedulesCount === 0
        ? 'Timetable not yet plotted'
        : (conflictsCount === 0
            ? '0 clashes detected · Timetable is verified'
            : `${pluralize(conflictsCount, 'conflict')} detected in active timetable`),
      icon: CheckCircle2,
      to: '/dashboard/schedules',
      statusLabel: schedulesCount > 0 && conflictsCount === 0 ? 'Verified' : schedulesCount === 0 ? 'Draft' : 'Conflict',
    },
  ];

  const readyCount = readiness.filter((r) => r.ready).length;
  const progressPercent = Math.round((readyCount / readiness.length) * 100);

  if (isLoading) {
    return (
      <Page>
        <div className="flex flex-col gap-6" aria-busy="true">
          <div className="h-10 w-64 rounded-field bg-atlas-line animate-pulse motion-reduce:animate-none" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 mb-8">
        {[
          {
            label: 'Classes scheduled',
            value: schedulesCount,
            icon: Calendar,
            to: '/dashboard/schedules',
            hint: schedulesCount > 0 ? `${pluralize(schedulesCount, 'class', 'classes')} active` : 'No classes placed',
            variant: 'classes',
          },
          {
            label: 'Faculty',
            value: facultyCount,
            icon: Users,
            to: '/dashboard/teachers',
            hint: facultyMissingAvail > 0 ? `${facultyMissingAvail} without a cap` : 'All caps configured',
            tone: facultyMissingAvail > 0 ? 'warning' : 'default',
            variant: 'faculty',
          },
          {
            label: 'Schedule Health',
            value: conflictsCount === null ? '—' : conflictsCount,
            icon: AlertTriangle,
            to: '/dashboard/schedules',
            hint: conflictsCount === null ? 'Count unavailable' : conflictsCount > 0 ? `${pluralize(conflictsCount, 'conflict')} detected` : 'Zero clashes detected',
            tone: conflictsCount === null ? 'warning' : conflictsCount > 0 ? 'conflict' : 'good',
            variant: 'health',
          },
        ].map((s, i) => (
          <div key={s.label} className="rise" style={{ animationDelay: `${i * 60}ms` }}>
            <StatTile {...s} />
          </div>
        ))}
      </div>

      {/* 2-Column Readiness & Action Hub */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-7 items-start">
        {/* Left 2 Cols: Academic Term Readiness */}
        <section
          className="lg:col-span-2 rise glass sheen rounded-2xl border border-[#AEC3B0]/40 overflow-hidden shadow-xs"
          style={{ animationDelay: '180ms' }}
        >
          {/* Header */}
          <header className="flex flex-wrap items-center justify-between gap-4 px-6 py-5 border-b border-[#AEC3B0]/30 bg-gradient-to-r from-[#E3EED4]/30 via-white/50 to-[#E3EED4]/10">
            <div className="flex items-center gap-3.5 min-w-0">
              <span
                aria-hidden="true"
                className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200/80 flex items-center justify-center shrink-0 shadow-2xs"
              >
                <CheckCircle2 className="w-5 h-5 stroke-[2.2] text-emerald-700" />
              </span>
              <div>
                <h2 className="text-lg sm:text-xl font-extrabold text-[#1E3A2B] tracking-tight">
                  Academic Term Readiness
                </h2>
                <p className="font-ui text-caption text-[#406349] font-medium mt-0.5">
                  Prerequisites check for automated scheduling and timetable publication
                </p>
              </div>
            </div>

            <span className="font-ui text-caption font-bold px-3.5 py-1 rounded-full bg-emerald-50 text-emerald-900 border border-emerald-200/90 tabular-nums shadow-2xs">
              {readyCount} of {readiness.length} ready ({progressPercent}%)
            </span>
          </header>

          {/* Integrated Progress Bar Section */}
          <div className="px-6 py-4 bg-[#E3EED4]/15 border-b border-[#AEC3B0]/20 flex flex-col gap-2">
            <div className="flex items-center justify-between font-ui text-caption font-semibold text-[#406349]">
              <span>Prerequisite Setup Completion</span>
              <span className="font-bold text-[#1E3A2B] tabular-nums">{progressPercent}%</span>
            </div>
            <div
              className="h-2 rounded-full bg-slate-200/80 overflow-hidden"
              role="progressbar"
              aria-valuenow={readyCount}
              aria-valuemin={0}
              aria-valuemax={readiness.length}
              aria-label={`${readyCount} of ${readiness.length} prerequisites ready`}
            >
              <div
                className="h-full rounded-full transition-all duration-700 ease-out bg-gradient-to-r from-emerald-400 to-emerald-600"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Checklist Items */}
          <ul className="divide-y divide-[#AEC3B0]/20">
            {readiness.map((item) => {
              const isGreen = item.ready;
              const isWarning = !item.ready && item.statusLabel !== 'Draft' && item.statusLabel !== 'Pending';

              const content = (
                <div className="flex items-center gap-4 px-6 py-3.5 group">
                  <span
                    aria-hidden="true"
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-150 group-hover:scale-105 shadow-2xs ${
                      isGreen
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : isWarning
                        ? 'bg-amber-50 text-amber-800 border border-amber-200'
                        : 'bg-slate-50 text-slate-600 border border-slate-200'
                    }`}
                  >
                    {isGreen ? (
                      <Check className="w-4.5 h-4.5 stroke-[2.5]" />
                    ) : (
                      <Clock className="w-4.5 h-4.5 stroke-[2]" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-ui text-body font-bold text-[#1E3A2B] group-hover:text-emerald-900 transition-colors">
                        {item.label}
                      </span>
                    </div>
                    <p className="font-ui text-caption text-[#406349] font-medium mt-0.5 leading-relaxed">
                      {item.detail}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`font-ui text-micro font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-2xs border ${
                        isGreen
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : isWarning
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {item.statusLabel}
                    </span>
                    {item.to && (
                      <ChevronRight className="w-4 h-4 text-[#6B9071] group-hover:translate-x-0.5 transition-transform" />
                    )}
                  </div>
                </div>
              );

              return (
                <li key={item.id}>
                  {item.to ? (
                    <Link
                      to={item.to}
                      className="block hover:bg-[#E3EED4]/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                    >
                      {content}
                    </Link>
                  ) : (
                    <div>{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* Right 1 Col: Operations Hub */}
        <section
          className="rise glass sheen rounded-2xl border border-[#AEC3B0]/40 overflow-hidden shadow-xs flex flex-col"
          style={{ animationDelay: '240ms' }}
        >
          {/* Header */}
          <header className="flex items-center gap-3.5 px-6 py-5 border-b border-[#AEC3B0]/30 bg-gradient-to-r from-[#E3EED4]/30 via-white/50 to-[#E3EED4]/10">
            <span
              aria-hidden="true"
              className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200/80 flex items-center justify-center shrink-0 shadow-2xs"
            >
              <Sparkles className="w-5 h-5 text-emerald-700 stroke-[2.2]" />
            </span>
            <div>
              <h2 className="text-lg font-extrabold text-[#1E3A2B] tracking-tight">
                Operational Actions
              </h2>
              <p className="font-ui text-caption text-[#406349] font-medium mt-0.5">
                Direct controls & dispatch
              </p>
            </div>
          </header>

          <div className="p-6 flex flex-col gap-5 flex-1 justify-between">
            {/* Quick Actions Stack */}
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => navigate('/dashboard/schedules')}
                className="w-full flex items-center justify-between px-5 py-3.5 rounded-xl font-ui text-caption font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-xs hover:shadow hover:translate-y-[-1px]"
              >
                <div className="flex items-center gap-3">
                  <Calendar className="w-4.5 h-4.5 text-emerald-100" />
                  <span className="text-sm">Open Schedule Studio</span>
                </div>
                <ArrowRight className="w-4 h-4 text-white" />
              </button>

              <button
                type="button"
                onClick={() => handleQuickAction('excel')}
                disabled={isProcessing === 'excel'}
                className="w-full flex items-center justify-between px-5 py-3 rounded-xl font-ui text-caption font-bold bg-white/95 hover:bg-[#E3EED4]/60 text-[#1E3A2B] border border-[#AEC3B0]/60 hover:border-[#6B9071] transition-all shadow-2xs hover:shadow-xs"
              >
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="w-4.5 h-4.5 text-emerald-700" />
                  <span className="text-sm">Export Timetable (Excel)</span>
                </div>
                <ChevronRight className="w-4 h-4 text-[#6B9071]" />
              </button>


              {conflictsCount > 0 && (
                <button
                  type="button"
                  onClick={() => handleQuickAction('resolve')}
                  disabled={isProcessing === 'resolve'}
                  className="w-full flex items-center justify-between px-5 py-3 rounded-xl font-ui text-caption font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 transition-all shadow-2xs"
                >
                  <div className="flex items-center gap-3">
                    <Sparkles className="w-4.5 h-4.5 text-amber-700" />
                    <span className="text-sm">Resolve Clashes ({conflictsCount})</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-amber-700" />
                </button>
              )}
            </div>

            {/* Operational Guidance Card */}
            <div className="p-4 rounded-xl bg-[#E3EED4]/35 border border-[#AEC3B0]/30 text-caption font-medium text-[#406349] flex items-start gap-2.5 leading-relaxed">
              <span className="font-bold text-[#1E3A2B] shrink-0">Tip:</span>
              <span>
                Verify all faculty teaching limits and room assignments prior to final timetable publication.
              </span>
            </div>
          </div>
        </section>
      </div>
    </Page>
  );
}
