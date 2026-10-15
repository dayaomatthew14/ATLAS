import { BookOpen, CalendarRange, Clock, MapPin, AlertTriangle, Users } from 'lucide-react';
import Dialog from './ui/Dialog';
import Button from './ui/Button';
import { LoadMeter, LoadStatusBadge } from './ui/Badge';
import { formatHours, PART_TIME_CEILING_HOURS } from '../utils/load';
import { pluralize } from './ui/tokens';

/**
 * One professor, at a glance: what they teach and when they teach it.
 *
 * The Faculty table answers "how many subjects" and "how many hours" — two
 * numbers per person. It could not answer the question a chair actually asks
 * while building a term, which is "what is this person's week?". Getting to
 * that meant opening Manage to read the subject list, then going to Schedule
 * and filtering to their name to read the times, and holding the two together
 * in your head.
 *
 * Both halves are shown here against the same person, plus the availability
 * they were plotted around, because those three things are only meaningful
 * next to each other.
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
      <h3 className="font-ui text-body font-semibold text-atlas-ink flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-atlas-700 shrink-0" aria-hidden="true" />
        {title}
        {count != null && (
          <span className="font-data text-caption text-atlas-slate tabular-nums">({count})</span>
        )}
      </h3>
      {children}
    </section>
  );
}

function Empty({ children }) {
  return (
    <p className="font-ui text-caption text-atlas-slate rounded-panel border border-dashed border-atlas-line px-4 py-5 text-center">
      {children}
    </p>
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
  onEditAvailability,
  canManage = false,
}) {
  if (!teacher) return null;

  const isPartTime = teacher.type === 'part_time' || teacher.type === 'Part-Time';

  const subjects = (teacher.subject_offerings || [])
    .map((o) => curriculumById?.get(o.curriculum_id) || null)
    .filter(Boolean)
    .sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));

  /* An offering whose curriculum row did not come back is still an assignment
     the chair made. Counting it keeps this total honest against the table's
     Subjects column, which counts offerings rather than resolved subjects. */
  const unresolvedSubjects = (teacher.subject_offerings || []).length - subjects.length;

  const byDay = DAY_ORDER.map((day) => ({
    day,
    classes: schedules
      .filter((s) => dayKey(s.day_of_week) === day)
      .sort((a, b) => minutesOf(a.start_time) - minutesOf(b.start_time)),
  })).filter((d) => d.classes.length > 0);

  const plottedHours = schedules.reduce((n, s) => n + durationHours(s), 0);

  const unavailable = (teacher.unavailability || [])
    .slice()
    .sort((a, b) => DAY_ORDER.indexOf(dayKey(a.day_of_week)) - DAY_ORDER.indexOf(dayKey(b.day_of_week)));

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={teacher.name}
      description={`${isPartTime ? 'Part-time' : 'Full-time'} · ${pluralize(subjects.length + unresolvedSubjects, 'subject')} assigned`}
      footer={
        <>
          {canManage && (
            <>
              <Button variant="secondary" icon={BookOpen} onClick={() => onManageSubjects?.(teacher)}>
                Manage subjects
              </Button>
              <Button variant="secondary" icon={Clock} onClick={() => onEditAvailability?.(teacher)}>
                Edit availability
              </Button>
            </>
          )}
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      {/* Load, stated the same way the table states it, so moving between the
          two does not mean re-reading a different measure. */}
      <div className="rounded-panel border border-atlas-line bg-white/60 px-4 py-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="font-ui text-caption text-atlas-slate">Teaching load</p>
            <p className="font-display text-section text-atlas-ink mt-1 tabular-nums">
              {formatHours(teacher.reg_hours || 0)}
              <span className="font-ui text-body text-atlas-slate">
                {isPartTime
                  ? ` / under ${formatHours(PART_TIME_CEILING_HOURS)} hrs`
                  : teacher.required_hours
                    ? ` / ${formatHours(teacher.required_hours)} hrs`
                    : ' hrs'}
              </span>
            </p>
          </div>
          <LoadStatusBadge
            status={teacher.load_status}
            overCeiling={teacher.exceeds_part_time_ceiling}
          />
        </div>
        <div className="mt-3">
          <LoadMeter
            used={teacher.reg_hours || 0}
            required={teacher.required_hours}
            status={teacher.load_status}
            ceiling={teacher.part_time_ceiling_hours}
            overCeiling={teacher.exceeds_part_time_ceiling}
          />
        </div>
      </div>

      <Section icon={BookOpen} title="Subjects handled" count={subjects.length + unresolvedSubjects}>
        {subjects.length === 0 && unresolvedSubjects === 0 ? (
          <Empty>
            Nothing assigned yet. Subjects come from your college’s published curriculum.
          </Empty>
        ) : (
          <ul className="rounded-panel border border-atlas-line divide-y divide-atlas-line overflow-hidden">
            {subjects.map((sub) => {
              const kind = subjectKind(sub);
              return (
                <li key={sub.id} className="flex items-start gap-3 px-4 py-3 bg-white/60">
                  <span className="font-data text-caption text-atlas-700 shrink-0 w-20 truncate" title={sub.code}>
                    {sub.code}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-ui text-body text-atlas-ink break-words">{sub.name}</span>
                    {kind && (
                      <span className="block font-ui text-caption text-atlas-slate mt-0.5">{kind}</span>
                    )}
                  </span>
                  {sub.units != null && (
                    <span className="font-data text-caption text-atlas-slate shrink-0 tabular-nums">
                      {sub.units} {sub.units === 1 ? 'unit' : 'units'}
                    </span>
                  )}
                </li>
              );
            })}
            {unresolvedSubjects > 0 && (
              <li className="px-4 py-3 bg-white/60 font-ui text-caption text-atlas-slate">
                {pluralize(unresolvedSubjects, 'other assignment')} could not be matched to a
                curriculum entry — it may have been revised since it was assigned.
              </li>
            )}
          </ul>
        )}
      </Section>

      <Section
        icon={CalendarRange}
        title="Weekly schedule"
        count={scheduleUnavailable ? null : schedules.length}
      >
        {scheduleUnavailable ? (
          /* Not the same as "no classes". Saying "nothing plotted" on the
             strength of a request that failed would report an empty week for
             someone who may have a full one. */
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
                <div key={day} className="rounded-panel border border-atlas-line overflow-hidden">
                  <p className="px-4 py-2 bg-atlas-50 font-ui text-caption font-semibold text-atlas-800">
                    {DAY_LABEL[day]}
                  </p>
                  <ul className="divide-y divide-atlas-line">
                    {classes.map((s) => (
                      <li key={s.id} className="flex items-start gap-3 px-4 py-3 bg-white/60">
                        <span className="font-data text-caption text-atlas-ink shrink-0 w-32 tabular-nums">
                          {to12h(s.start_time)}–{to12h(s.end_time)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-ui text-body text-atlas-ink break-words">
                            <span className="font-data text-caption text-atlas-700 mr-2">{s.subject_code}</span>
                            {s.subject_name}
                          </span>
                          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-ui text-caption text-atlas-slate mt-1">
                            <span className="inline-flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                              {s.room_name && s.room_name !== '—' ? s.room_name : 'No room assigned'}
                              {s.room_building ? ` · ${s.room_building}` : ''}
                            </span>
                            {s.section && (
                              <span className="inline-flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                Section {s.section}
                              </span>
                            )}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="font-ui text-caption text-atlas-slate mt-3 tabular-nums">
              {pluralize(schedules.length, 'class', 'classes')} plotted ·{' '}
              {formatHours(plottedHours)} hrs a week
            </p>
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
                className="inline-flex items-center gap-2 rounded-full border border-atlas-line bg-white/60 px-3 py-1.5"
              >
                <span className="font-ui text-caption font-semibold text-atlas-ink">
                  {DAY_LABEL[dayKey(u.day_of_week)] || u.day_of_week}
                </span>
                <span className="font-data text-caption text-atlas-slate tabular-nums">
                  {u.start_time && u.end_time
                    ? `${to12h(u.start_time)}–${to12h(u.end_time)}`
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
