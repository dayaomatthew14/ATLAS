import { useMemo } from 'react';
import { BookOpen, CalendarRange, Clock, AlertTriangle, GraduationCap, Activity } from 'lucide-react';
import Dialog from './ui/Dialog';
import Button from './ui/Button';
import { LoadStatusBadge } from './ui/Badge';
import { formatHours, PART_TIME_CEILING_HOURS, employmentTypeLabel, getWorkWeekBreakdown } from '../utils/load';
import { pluralize } from './ui/tokens';

/**
 * One professor, at a glance: what they teach and when they teach it.
 */

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LABEL = {
  Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday',
  Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday',
};

/** The API writes either "Mon" or "Monday" depending on the path that saved it. */
const dayKey = (value) => String(value || '').slice(0, 3);

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

const durationHours = (s) => Math.max(0, (minutesOf(s.end_time) - minutesOf(s.start_time)) / 60);

/** "Lecture + Lab" reads better than two badges saying 3 and 1. */
const subjectKind = (sub) => {
  if (!sub) return null;
  const lec = Number(sub.lec_units) || 0;
  const lab = Number(sub.lab_units) || 0;
  if (lec > 0 && lab > 0) return 'Lecture + Lab';
  if (lab > 0) return 'Laboratory';
  if (lec > 0) return 'Lecture';
  return sub.type ? String(sub.type).replace(/^\w/, (c) => c.toUpperCase()) : null;
};

function Section({ icon: Icon, title, count, children }) {
  return (
    <section className="mt-6 first:mt-0">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-ui text-sm font-bold text-slate-900 flex items-center gap-2 tracking-tight">
          <span className="w-7 h-7 rounded-lg bg-emerald-100/90 text-emerald-800 border border-emerald-200/70 flex items-center justify-center shrink-0 shadow-2xs">
            <Icon className="w-3.5 h-3.5" aria-hidden="true" />
          </span>
          <span>{title}</span>
          {count != null && (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold font-data bg-emerald-50 text-emerald-800 border border-emerald-200/80 tabular-nums shadow-2xs">
              {count}
            </span>
          )}
        </h3>
      </div>
      {children}
    </section>
  );
}

function Empty({ children }) {
  return (
    <div className="font-ui text-xs text-slate-500 rounded-xl border border-dashed border-slate-200 bg-white/40 px-4 py-6 text-center shadow-2xs">
      {children}
    </div>
  );
}

export default function FacultyPreviewDialog({
  isOpen,
  teacher,
  curriculumById,
  schedules = [],
  scheduleUnavailable = false,
  onClose,
  onManageSubjects,
  canManage = false,
}) {
  const subjects = useMemo(() => {
    return (teacher?.subject_offerings || [])
      .map((o) => curriculumById?.get(o.curriculum_id) || null)
      .filter(Boolean)
      .sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));
  }, [teacher?.subject_offerings, curriculumById]);

  const byDay = useMemo(() => {
    return DAY_ORDER.map((day) => ({
      day,
      classes: schedules
        .filter((s) => dayKey(s.day_of_week) === day)
        .sort((a, b) => minutesOf(a.start_time) - minutesOf(b.start_time)),
    })).filter((d) => d.classes.length > 0);
  }, [schedules]);

  const plottedHours = useMemo(() => {
    return schedules.reduce((n, s) => n + durationHours(s), 0);
  }, [schedules]);

  const unavailable = useMemo(() => {
    return (teacher?.unavailability || [])
      .slice()
      .sort((a, b) => DAY_ORDER.indexOf(dayKey(a.day_of_week)) - DAY_ORDER.indexOf(dayKey(b.day_of_week)));
  }, [teacher?.unavailability]);

  if (!teacher) return null;

  const isPartTime = teacher.type === 'part_time' || teacher.type === 'Part-Time';
  const unresolvedSubjects = (teacher.subject_offerings || []).length - subjects.length;

  const targetHours = isPartTime ? PART_TIME_CEILING_HOURS : (teacher.required_hours || 0);
  const usedHours = teacher.reg_hours || 0;
  const pct = targetHours > 0 ? Math.min(100, Math.round((usedHours / targetHours) * 100)) : 0;
  const delta = usedHours - targetHours;
  const actualOverload = Math.max(0, Number((delta > 0 ? delta : (teacher.overload_hours || 0)).toFixed(2)));
  const workWeek =
    teacher.work_week ||
    (!isPartTime
      ? getWorkWeekBreakdown(teacher.term || teacher.semester?.term || '1st', teacher.type, actualOverload)
      : null);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      icon={GraduationCap}
      title={teacher.name}
      description={
        <span className="flex flex-wrap items-center gap-2 mt-1">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border shadow-2xs ${
            isPartTime
              ? 'bg-amber-50 text-amber-800 border-amber-200'
              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
          }`}>
            {employmentTypeLabel(teacher.type)}
          </span>
          {(teacher.allowed_hours || teacher.max_units) && (
            <span className="text-xs font-medium text-slate-600 bg-white/70 px-2 py-0.5 rounded-md border border-slate-200/80">
              Limit: <strong className="text-slate-800">{teacher.allowed_hours || teacher.max_units} hrs/week</strong>
            </span>
          )}
          <span className="text-xs font-medium text-slate-600 bg-white/70 px-2 py-0.5 rounded-md border border-slate-200/80">
            <strong className="text-slate-800">{pluralize(subjects.length + unresolvedSubjects, 'subject')}</strong> assigned
          </span>
        </span>
      }
      footer={
        <>
          {canManage && (
            <Button variant="secondary" icon={BookOpen} onClick={() => onManageSubjects?.(teacher)}>
              Manage subjects
            </Button>
          )}
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      {/* Modern, comprehensive Teaching Load dashboard card */}
      <div className="rounded-2xl border border-emerald-900/10 bg-gradient-to-br from-white via-emerald-50/25 to-teal-50/30 p-5 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-200">
                <Activity className="w-3 h-3 text-emerald-700" />
                Teaching Load
              </span>
              <span className="text-xs text-slate-500 font-medium">
                {employmentTypeLabel(teacher.type)} ({isPartTime ? '20h max ceiling' : 'Active term standard load'})
              </span>
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="font-display text-3xl font-extrabold text-slate-900 tracking-tight tabular-nums">
                {formatHours(usedHours)}
              </span>
              <span className="font-ui text-sm text-slate-600 font-medium">
                / {targetHours ? formatHours(targetHours) : '—'} plotted hrs per week
              </span>
            </div>
            <div className="mt-1 text-xs text-slate-500 font-medium">
              Assigned Subjects Load: <strong className="text-slate-800 font-semibold">{formatHours(teacher.assigned_hours || 0)} hrs/week</strong> (independent stage)
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <LoadStatusBadge
              status={teacher.load_status}
              overCeiling={teacher.exceeds_part_time_ceiling}
            />
            {targetHours > 0 && (
              <span className="text-xs font-semibold text-slate-500 tabular-nums">
                {pct}% of {isPartTime ? 'ceiling' : 'allowed'}
              </span>
            )}
          </div>
        </div>

        {/* Enhanced progress bar */}
        <div className="mt-3.5">
          <div className="h-2.5 w-full rounded-full bg-slate-100 border border-slate-200/80 shadow-inner overflow-hidden p-0.5">
            <div
              className={`h-full rounded-full transition-[width] duration-500 shadow-2xs ${
                teacher.load_status === 'OVERLOAD' || teacher.exceeds_part_time_ceiling
                  ? 'bg-gradient-to-r from-rose-500 to-red-600'
                  : teacher.load_status === 'UNDERLOAD'
                    ? 'bg-gradient-to-r from-amber-400 to-amber-500'
                    : 'bg-gradient-to-r from-emerald-500 to-teal-600'
              }`}
              style={{ width: `${Math.max(pct > 0 ? 3 : 0, pct)}%` }}
            />
          </div>
        </div>

        {/* Detailed stats chips */}
        <div className="mt-3.5 pt-3 border-t border-emerald-900/10 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-slate-600 flex items-center gap-1.5 font-medium">
            <CalendarRange className="w-3.5 h-3.5 text-emerald-700" />
            <strong className="text-slate-900 font-semibold">{schedules.length}</strong> {pluralize(schedules.length, 'class', 'classes')} scheduled
          </span>
          <span className="text-slate-600 flex items-center gap-1.5 font-medium">
            <BookOpen className="w-3.5 h-3.5 text-emerald-700" />
            <strong className="text-slate-900 font-semibold">{subjects.length + unresolvedSubjects}</strong> {pluralize(subjects.length + unresolvedSubjects, 'subject')} assigned
          </span>
          {targetHours > 0 && (
            <span className="text-slate-600 font-medium">
              {delta < 0 ? (
                <span className="text-amber-800 font-semibold">
                  {formatHours(Math.abs(delta))} hrs below target
                </span>
              ) : delta > 0 ? (
                <span className="text-rose-700 font-semibold">
                  +{formatHours(delta)} hrs over target
                </span>
              ) : (
                <span className="text-emerald-700 font-semibold">
                  Balanced load
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* 40-Hour Full-Time Workload & Panelist Requirements (Consultation, Off-Campus, Overload) */}
      {!isPartTime && workWeek && (
        <div className="mt-4 rounded-2xl border border-emerald-900/10 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[#AEC3B0]/30">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-200">
                <Clock className="w-3 h-3 text-emerald-700" />
                40-Hour Full-Time Week
              </span>
              <span className="text-xs text-slate-500 font-medium">
                {workWeek.term ? `${workWeek.term} Term Allocation` : 'Standard Workload'}
              </span>
            </div>
            {workWeek.policy_review_flag ? (
              <span className="px-2.5 py-0.5 rounded-full font-ui text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                ⚠️ Policy Review Required
              </span>
            ) : (
              <span className="font-ui text-xs font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200">
                40.00h Total Obligation
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-center">
            {/* Teaching */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
              <div className="font-ui text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Teaching
              </div>
              <div className="mt-1 font-display text-xl font-extrabold text-[#0F2A1D] tabular-nums">
                {formatHours(workWeek.teaching_hours)}h
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 font-medium">
                {actualOverload > 0 ? `+${formatHours(actualOverload)}h overload` : 'Standard load'}
              </div>
            </div>

            {/* Off-Campus */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
              <div className="font-ui text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Off-Campus
              </div>
              <div className="mt-1 font-display text-xl font-extrabold text-[#0F2A1D] tabular-nums">
                {formatHours(workWeek.off_campus_hours)}h
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 font-medium">
                Outside campus
              </div>
            </div>

            {/* Office / Prep */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
              <div className="font-ui text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Office / Prep
              </div>
              <div className="mt-1 font-display text-xl font-extrabold text-[#0F2A1D] tabular-nums">
                {formatHours(workWeek.office_hours)}h
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 font-medium">
                {actualOverload > 0
                  ? (workWeek.office_hours > 0 ? `Remaining (−${formatHours(workWeek.deducted_from_office)}h)` : 'Absorbed (0.00h)')
                  : 'On-campus duty'}
              </div>
            </div>

            {/* Consultation */}
            <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
              <div className="font-ui text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                Consultation
              </div>
              <div className="mt-1 font-display text-xl font-extrabold text-emerald-900 tabular-nums">
                {formatHours(workWeek.consultation_hours)}h
              </div>
              <div className="text-[11px] text-emerald-700 mt-0.5 font-medium">
                {workWeek.excess_overload_hours > 0
                  ? `Adjusted (−${formatHours(workWeek.deducted_from_consultation)}h)`
                  : 'Standard 6.00h'}
              </div>
            </div>
          </div>

          {/* Overload Cascade Deduction Callout */}
          {actualOverload > 0 && (
            <div className="mt-3.5 p-3.5 rounded-xl bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border border-emerald-200 text-xs text-slate-700 space-y-1.5">
              <div className="font-bold text-[#0F2A1D] flex items-center justify-between">
                <span>Overload Hours Cascade Deduction</span>
                <span className="font-mono text-[11.5px] text-emerald-900 font-extrabold">
                  Actual Overload: +{formatHours(actualOverload)}h
                </span>
              </div>
              <p className="text-slate-600 leading-relaxed font-medium">
                1. <strong>Office Hours Deduction:</strong> {formatHours(workWeek.allocated_office_hours)}h allocated − {formatHours(workWeek.deducted_from_office)}h overload = <code className="px-1.5 py-0.5 rounded bg-white border border-emerald-300 font-mono text-emerald-950">{formatHours(workWeek.office_hours)}h remaining</code>.
              </p>
              {workWeek.excess_overload_hours > 0 ? (
                <p className="text-slate-600 leading-relaxed font-medium">
                  2. <strong>Consultation Hours Deduction:</strong> Overload exceeded office hours by {formatHours(workWeek.excess_overload_hours)}h. Deducted from 6.00h standard consultation = <code className="px-1.5 py-0.5 rounded bg-white border border-emerald-300 font-mono text-emerald-950">{formatHours(workWeek.consultation_hours)}h remaining</code>.
                </p>
              ) : (
                <p className="text-slate-600 leading-relaxed font-medium">
                  2. <strong>Consultation Hours:</strong> Overload was fully absorbed by office hours. Consultation remains untouched at <code className="px-1.5 py-0.5 rounded bg-white border border-emerald-300 font-mono text-emerald-950">6.00h standard</code>.
                </p>
              )}
              {workWeek.policy_review_flag && (
                <p className="font-bold text-amber-900 bg-amber-50 border border-amber-300 rounded-lg p-2 mt-1">
                  ⚠️ {workWeek.flag_reason}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <Section icon={BookOpen} title="Subjects handled" count={subjects.length + unresolvedSubjects}>
        {subjects.length === 0 && unresolvedSubjects === 0 ? (
          <Empty>
            Nothing assigned yet. Subjects come from your college’s published curriculum.
          </Empty>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {subjects.map((sub) => {
              const kind = subjectKind(sub);
              return (
                <div
                  key={sub.id}
                  className="group flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200/80 bg-white/80 hover:bg-white hover:border-emerald-300 hover:shadow-xs transition-colors duration-150"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200/80 shrink-0 tracking-wide shadow-2xs group-hover:bg-emerald-100 transition-colors"
                      title={sub.code}
                    >
                      {sub.code}
                    </span>
                    <div className="min-w-0">
                      <p className="font-ui text-sm font-semibold text-slate-900 break-words leading-snug">
                        {sub.name}
                      </p>
                      {kind && (
                        <span className="inline-flex items-center gap-1 mt-0.5 text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/60">
                          {kind}
                        </span>
                      )}
                    </div>
                  </div>
                  {sub.units != null && (
                    <span className="font-data text-xs font-bold text-emerald-950 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200/80 tabular-nums shrink-0 shadow-2xs">
                      {sub.units} {sub.units === 1 ? 'unit' : 'units'}
                    </span>
                  )}
                </div>
              );
            })}
            {unresolvedSubjects > 0 && (
              <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/70 font-ui text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                <span>
                  {pluralize(unresolvedSubjects, 'other assignment')} could not be matched to an active curriculum entry — it may have been revised since it was assigned.
                </span>
              </div>
            )}
          </div>
        )}
      </Section>

      <Section
        icon={CalendarRange}
        title="Weekly schedule"
        count={scheduleUnavailable ? null : schedules.length}
      >
        {scheduleUnavailable ? (
          <p className="font-ui text-caption text-sem-warning rounded-panel bg-sem-warning-bg border border-sem-warning/25 px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            The timetable could not be read, so this week is unknown rather than empty.
          </p>
        ) : byDay.length === 0 ? (
          <Empty>
            Not yet plotted. Generate the timetable on the Schedule screen and their classes
            will appear here.
          </Empty>
        ) : (
          <>
            <div className="space-y-3">
              {byDay.map(({ day, classes }) => (
                <div key={day} className="rounded-xl border border-emerald-900/10 overflow-hidden bg-white/80 shadow-2xs">
                  <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-emerald-50 via-emerald-50/40 to-transparent border-b border-emerald-100/80">
                    <span className="font-ui text-xs font-bold uppercase tracking-wider text-emerald-900">
                      {DAY_LABEL[day]}
                    </span>
                    <span className="text-[11px] font-semibold text-emerald-800 bg-white/90 px-2 py-0.5 rounded-full border border-emerald-200/80 shadow-2xs tabular-nums">
                      {classes.length} {classes.length === 1 ? 'class' : 'classes'}
                    </span>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {classes.map((s) => (
                      <li key={s.id} className="p-3.5 hover:bg-emerald-50/20 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 text-xs font-bold font-data tabular-nums border border-slate-200/80 shrink-0">
                            <Clock className="w-3.5 h-3.5 text-slate-500" />
                            {to12h(s.start_time)} – {to12h(s.end_time)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200/70">
                                {s.subject_code}
                              </span>
                              {(s.is_ct || (s.ct_tier && s.ct_tier !== 'regular')) && (
                                <span className="font-mono text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-300">
                                  CT
                                </span>
                              )}
                              <span className="font-ui text-sm font-semibold text-slate-900 break-words">
                                {s.subject_name}
                              </span>
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between px-1 text-xs font-medium text-slate-500">
              <span>{pluralize(schedules.length, 'class', 'classes')} plotted</span>
              <span className="font-bold text-slate-700 font-data">{formatHours(teacher.reg_hours ?? plottedHours)} hrs a week</span>
            </div>
          </>
        )}
      </Section>

      <Section icon={Clock} title="Unavailable" count={unavailable.length}>
        {unavailable.length === 0 ? (
          <Empty>
            No blocked times. The generator may place classes anywhere in the teaching day.
          </Empty>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {unavailable.map((u, i) => (
              <li
                key={`${u.day_of_week}-${u.start_time}-${i}`}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-1.5 shadow-2xs"
              >
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span className="font-ui text-xs font-bold text-amber-950">
                  {DAY_LABEL[dayKey(u.day_of_week)] || u.day_of_week}
                </span>
                <span className="font-data text-xs font-medium text-amber-800 tabular-nums">
                  {u.start_time && u.end_time
                    ? `${to12h(u.start_time)} – ${to12h(u.end_time)}`
                    : 'All day'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </Dialog>
  );
}
