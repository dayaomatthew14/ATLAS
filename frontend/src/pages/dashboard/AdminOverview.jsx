import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  UserCheck,
  GraduationCap,
  RefreshCw,
  Layers,
  ChevronRight,
} from 'lucide-react';
import { api } from '../../utils/api';
import Button from '../../components/ui/Button';
import useCountUp from '../../components/ui/useCountUp';
import { pluralize, focusRing } from '../../components/ui/tokens';

const STAT_VARIANTS = {
  classes: {
    card: 'stat-card-classes',
    chip: 'bg-[#714E03]/12 border-[#714E03]/20',
    hover: 'hover:border-[#CA8A04]/60',
  },
  faculty: {
    card: 'stat-card-faculty',
    chip: 'bg-[#476033]/12 border-[#476033]/20',
    hover: 'hover:border-[#789A5B]/60',
  },
  rooms: {
    card: 'stat-card-rooms',
    chip: 'bg-[#304832]/12 border-[#304832]/20',
    hover: 'hover:border-[#57775A]/60',
  },
  health: {
    card: 'stat-card-health',
    chip: 'bg-[#1D3220]/15 border-[#1D3220]/25',
    hover: 'hover:border-[#36543A]/60',
  },
};

/** Executive KPI stat card with ombre styling and count-up display */
function StatCard({ label, value, hint, icon: Icon, to, variant }) {
  const shown = useCountUp(value);

  const key = variant || (
    label?.toLowerCase().includes('account') || label?.toLowerCase().includes('faculty') ? 'faculty' :
    label?.toLowerCase().includes('curriculum') || label?.toLowerCase().includes('room') ? 'rooms' :
    label?.toLowerCase().includes('facility') || label?.toLowerCase().includes('health') ? 'health' :
    'classes'
  );
  const v = STAT_VARIANTS[key] || STAT_VARIANTS.classes;

  const content = (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <span className="block font-ui text-xs font-bold text-[#0F2A1D] tracking-wider uppercase truncate">
          {label}
        </span>
        <span className="block text-2xl lg:text-3xl font-extrabold mt-1 tabular-nums tracking-tight leading-none text-[#0F2A1D]">
          {shown}
        </span>
        {hint && (
          <span className="block font-ui text-xs text-[#0F2A1D] mt-1.5 truncate font-semibold">
            {hint}
          </span>
        )}
      </div>
      {Icon && (
        <span className={`w-11 h-11 lg:w-12 lg:h-12 rounded-xl flex items-center justify-center shrink-0 shadow-xs border ${v.chip} text-[#0F2A1D] transition-transform group-hover:scale-105 duration-overlay`}>
          <Icon className="w-5 h-5 stroke-[2.2] text-[#0F2A1D]" />
        </span>
      )}
    </div>
  );

  const base = `${v.card} rounded-panel p-4.5 lg:p-5 block transition-all ${v.hover} hover:shadow-md`;
  return to ? (
    <Link to={to} className={`group ${base} ${focusRing}`}>
      {content}
    </Link>
  ) : (
    <div className={base}>{content}</div>
  );
}

export default function AdminOverview() {
  const [users, setUsers] = useState([]);
  const [colleges, setColleges] = useState([]);
  const [faculty, setFaculty] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [
        userData,
        collegeData,
        facultyData,
      ] = await Promise.all([
        api.get('/users').catch(() => []),
        api.get('/colleges').catch(() => []),
        api.get('/professors').catch(() => []),
      ]);

      setUsers(Array.isArray(userData) ? userData : []);
      setColleges(Array.isArray(collegeData) ? collegeData : []);
      setFaculty(Array.isArray(facultyData) ? facultyData : []);
    } catch (err) {
      console.error('Failed to load administrator overview:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pending = users.filter((u) => u.is_verified === false);
  const chairsCount = users.filter((u) => u.role === 'program_chair').length;
  const coordinatorsCount = users.filter((u) => u.role === 'coordinator').length;
  const adminsCount = users.filter((u) => u.role === 'admin').length;

  const allPrograms = colleges.flatMap((c) => c.programs || []);
  const programCount = allPrograms.length;
  const withCurriculum = allPrograms.filter((p) => (p.block_count || 0) > 0).length;

  if (isLoading && users.length === 0) {
    return (
      <div className="min-h-full flex flex-col justify-center p-6 lg:p-8 w-full gap-5 lg:gap-6" aria-busy="true">
        <div className="h-10 w-72 rounded-field bg-slate-200 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 glass rounded-panel animate-pulse" />
          ))}
        </div>
        <div className="h-96 glass rounded-panel animate-pulse" />
      </div>
    );
  }

  return (
    <div className="min-h-full flex flex-col justify-center p-6 lg:p-8 w-full">
      {/* Executive Command Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 mb-5 lg:mb-6">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-emerald-950 border border-emerald-700/40 flex items-center justify-center shadow-md shadow-emerald-950/20 shrink-0">
            <img src="/atlas_logo.png" alt="ATLAS Logo" className="w-7 h-7 object-contain drop-shadow" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-extrabold text-emerald-950 tracking-tight leading-snug">
                Overview
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wider uppercase text-emerald-900 bg-emerald-900/10 border border-emerald-800/25">
                System Admin
              </span>
            </div>
            <p className="font-ui text-sm text-slate-600 mt-0.5 font-medium">
              De La Salle Araneta University
            </p>
          </div>
        </div>

        <Button
          size="sm"
          variant="secondary"
          icon={RefreshCw}
          onClick={load}
          loading={isLoading}
        >
          Refresh
        </Button>
      </header>

      {/* Optional Pending Verifications Notice */}
      {pending.length > 0 && (
        <div className="mb-5 lg:mb-6 p-3.5 rounded-panel border border-amber-500/30 bg-amber-500/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-900 flex items-center justify-center shrink-0">
              <UserCheck className="w-4 h-4" />
            </span>
            <div>
              <span className="font-ui text-sm font-bold text-amber-950">
                {pluralize(pending.length, 'Account')} Awaiting Administrator Clearance
              </span>
              <span className="block font-ui text-xs text-amber-850 font-medium">
                Review and approve pending accounts to enable timetable and departmental scheduling access.
              </span>
            </div>
          </div>
          <Link
            to="/dashboard/users"
            className="px-3 py-1.5 rounded-field bg-amber-900 text-white font-ui text-xs font-semibold hover:bg-amber-950 transition-colors shrink-0"
          >
            Review Accounts →
          </Link>
        </div>
      )}

      {/* Top 3 KPI Metric Tiles — Unified DLSAU Emerald */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5 mb-5 lg:mb-6">
        <StatCard
          label="Awaiting Verification"
          value={pending.length}
          hint={pending.length > 0 ? `${pluralize(pending.length, 'account')} require approval` : 'All accounts verified'}
          icon={UserCheck}
          to="/dashboard/users"
        />
        <StatCard
          label="Registered Accounts"
          value={users.length}
          hint={`${chairsCount} chairs · ${coordinatorsCount} coords · ${adminsCount} admins`}
          icon={Users}
          to="/dashboard/users"
        />
        <StatCard
          label="Curriculum Coverage"
          value={`${withCurriculum}/${programCount}`}
          hint={programCount - withCurriculum > 0 ? `${programCount - withCurriculum} programs missing curriculum` : 'All programs ready'}
          icon={GraduationCap}
          to="/dashboard/colleges"
        />
      </div>

      {/* WIDE Full-Width Section: Colleges and Programs */}
      <section className="glass sheen rounded-panel border border-emerald-900/10 shadow-sm overflow-hidden flex flex-col">
        <header className="px-5 py-4 border-b border-emerald-900/10 flex items-center justify-between gap-3 bg-white/40">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-emerald-800/10 text-emerald-800 flex items-center justify-center shrink-0 border border-emerald-800/20">
              <Layers className="w-4 h-4 stroke-[2.2]" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-emerald-950 tracking-tight truncate">
                Colleges and Programs
              </h2>
              <p className="font-ui text-xs text-slate-500 truncate font-medium">
                Curriculum readiness and degree offerings across all 4 academic units
              </p>
            </div>
          </div>
          <Link
            to="/dashboard/colleges"
            className="font-ui text-xs font-semibold text-emerald-800 hover:text-emerald-950 hover:underline shrink-0 flex items-center gap-1"
          >
            <span>Manage Colleges</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </header>

        {/* 2x2 Grid of Executive College Cards */}
        <div className="p-4 lg:p-5 grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">
          {colleges.length === 0 ? (
            <div className="col-span-full py-12 text-center text-slate-500 font-ui text-xs">
              No colleges configured.
            </div>
          ) : (
            colleges.map((c) => {
              const progs = c.programs || [];
              const readyCount = progs.filter((p) => (p.block_count || 0) > 0).length;
              const pct = progs.length > 0 ? Math.round((readyCount / progs.length) * 100) : 0;
              const isComplete = progs.length > 0 && readyCount === progs.length;
              const collegeFaculty = faculty.filter(
                (f) => f.department === c.code || f.department === c.name
              );

              return (
                <div
                  key={c.id || c.code}
                  className="p-5 rounded-panel border border-emerald-900/10 bg-white/80 hover:bg-white hover:border-emerald-700/30 hover:shadow-md transition-all shadow-xs flex flex-col justify-between gap-4 group"
                >
                  {/* Top: College Identity & Readiness Pill */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-12 h-8 rounded-lg flex items-center justify-center text-xs font-extrabold text-white font-ui tracking-wide bg-emerald-950 shadow-xs border border-emerald-900 shrink-0">
                        {c.code}
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-ui text-sm font-bold text-slate-900 truncate">
                          {c.name}
                        </h3>
                        <span className="block font-ui text-xs text-slate-500 font-medium">
                          {pluralize(progs.length, 'program')} · {collegeFaculty.length} faculty assigned
                        </span>
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold font-ui shrink-0 border ${
                        isComplete
                          ? 'bg-emerald-900/10 text-emerald-900 border-emerald-800/25'
                          : readyCount > 0
                          ? 'bg-emerald-800/5 text-emerald-900 border-emerald-900/15'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {readyCount}/{progs.length} Ready ({pct}%)
                    </span>
                  </div>

                  {/* Middle: Progress Bar */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs font-ui">
                      <span className="text-slate-500 font-medium">Curriculum Readiness</span>
                      <span
                        className={`font-semibold ${
                          isComplete ? 'text-emerald-800' : readyCount > 0 ? 'text-emerald-700' : 'text-slate-500'
                        }`}
                      >
                        {isComplete ? 'Full Coverage' : readyCount > 0 ? `${readyCount} of ${progs.length} Complete` : 'Pending Curriculum'}
                      </span>
                    </div>
                    <div className="w-full bg-slate-200/80 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          isComplete ? 'bg-emerald-600' : readyCount > 0 ? 'bg-emerald-700' : 'bg-slate-300'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Bottom: Degree Programme Badges */}
                  <div className="flex flex-wrap gap-2 pt-1 border-t border-emerald-900/5">
                    {progs.map((p) => {
                      const hasCurr = (p.block_count || 0) > 0;
                      const cleanName = p.name
                        .replace(/^(Bachelor of Science in|Bachelor of Science|Bachelor in|Bachelor of|Doctor of)\s+/i, '')
                        .trim();

                      return (
                        <span
                          key={p.id}
                          title={`${p.name} — ${hasCurr ? `${p.block_count} curriculum blocks configured` : 'Missing curriculum blocks'}`}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-ui border transition-colors ${
                            hasCurr
                              ? 'bg-emerald-900/10 text-emerald-950 border-emerald-800/25 font-semibold'
                              : 'bg-slate-100/80 text-slate-600 border-slate-200 font-medium'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              hasCurr ? 'bg-emerald-700' : 'bg-slate-400'
                            }`}
                          />
                          <span className="font-bold tracking-tight">{p.code}</span>
                          <span className="text-slate-600 font-normal">
                            {cleanName}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}


