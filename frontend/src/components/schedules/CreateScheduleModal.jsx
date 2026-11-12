import { useId, useMemo } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Calendar,
  CalendarPlus,
  Info,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import AtlasDialog from '../ui/Dialog';
import AtlasButton from '../ui/Button';
import Badge from '../ui/Badge';
import { Field, TextInput } from '../ui/Field';
import SelectMenu from '../ui/SelectMenu';
import { pluralize } from '../ui/tokens';
import { ALLOWED_DAY_ABBR } from '../../utils/validation';
import { DAY_LABEL, to12h } from '../../utils/scheduleHelpers';

/**
 * Unified Create New Schedule dialog.
 * Scopes Subject choices strictly to published current-term offerings and
 * replaces native browser <select> menus with ATLAS portaled SelectMenus.
 */
export default function CreateScheduleModal({
  isOpen,
  onClose,
  onSubmit,
  currentSemester,
  formatSemesterTerm,
  subjects = [],
  teachers = [],
  isLoadingDropdowns = false,
  formData,
  formErrors = {},
  blockingFormConflicts = [],
  onSelectSubject,
  onFieldChange,
  onFieldBlur,
  onGetSuggestions,
  isFetchingSuggestions = false,
  aiSuggestions = [],
  onApplySuggestion,
  isSubmitting = false,
}) {
  const formId = useId();

  const selectedSubject = useMemo(
    () => subjects.find((s) => String(s.id) === String(formData.subject_id)) || null,
    [subjects, formData.subject_id]
  );

  const subjectOptions = useMemo(
    () =>
      subjects.map((s) => {
        const offerings = Array.isArray(s.assigned_offerings) ? s.assigned_offerings : [];
        const unitText = `${s.units ?? 0} ${Number(s.units) === 1 ? 'unit' : 'units'}`;
        const typeText = s.type === 'lab' ? 'Lab' : 'Lecture';
        let badge = 'Unassigned';
        let badgeTone = 'unassigned';
        if (offerings.length > 0) {
          badge = `Assigned: ${offerings.map((o) => o.faculty_name).filter(Boolean).join(', ')}`;
          badgeTone = 'assigned';
        } else if (s.is_major === false) {
          badge = 'GenEd';
          badgeTone = 'gened';
        }

        return {
          value: String(s.id),
          code: s.code,
          label: s.name,
          group: s.group_label,
          secondary: `${unitText} · ${typeText}`,
          badge,
          badgeTone,
          searchText: `${s.program_name || ''} ${s.year_label || ''} ${s.semester_term || ''}`,
        };
      }),
    [subjects]
  );

  const professorOptions = useMemo(() => {
    const assignedIds = new Set(
      (selectedSubject?.assigned_offerings || []).map((o) => String(o.faculty_id))
    );
    const mapped = teachers.map((t) => {
      const isAssigned = assignedIds.has(String(t.id));
      return {
        value: String(t.id),
        label: t.name,
        badge: isAssigned ? 'Assigned to subject' : undefined,
        badgeTone: isAssigned ? 'assigned' : 'neutral',
        isAssigned,
      };
    });
    if (assignedIds.size === 0) return mapped;
    return mapped.sort((a, b) => Number(b.isAssigned) - Number(a.isAssigned));
  }, [teachers, selectedSubject]);

  const dayOptions = useMemo(
    () =>
      ALLOWED_DAY_ABBR.map((d) => ({
        value: d,
        code: d,
        label: DAY_LABEL[d] || d,
      })),
    []
  );

  const termLabel = currentSemester
    ? `A.Y. ${currentSemester.academic_year} · ${formatSemesterTerm(currentSemester.term)}`
    : 'No active semester';

  const termShort = currentSemester
    ? `${formatSemesterTerm(currentSemester.term)} Subjects`
    : 'Current Term Subjects';

  const showUnassignedMajorNotice =
    selectedSubject &&
    selectedSubject.is_major !== false &&
    (!selectedSubject.assigned_offerings || selectedSubject.assigned_offerings.length === 0);

  return (
    <AtlasDialog
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Schedule"
      description="Schedule a class from the active academic term with real-time conflict detection."
      size="entity"
      icon={CalendarPlus}
      dismissible={!isSubmitting}
      footer={
        <div className="w-full flex flex-wrap items-center justify-between gap-3">
          <AtlasButton
            variant="secondary"
            icon={Sparkles}
            loading={isFetchingSuggestions}
            disabled={isFetchingSuggestions || isSubmitting}
            onClick={onGetSuggestions}
          >
            {isFetchingSuggestions ? 'Analyzing…' : 'Get AI Suggestions'}
          </AtlasButton>
          <div className="flex items-center gap-3">
            <AtlasButton variant="ghost" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </AtlasButton>
            <AtlasButton
              type="submit"
              form={formId}
              loading={isSubmitting}
              disabled={isSubmitting}
              className={
                blockingFormConflicts.length > 0
                  ? '!bg-sem-conflict hover:!bg-rose-700 !border-rose-400/30'
                  : ''
              }
            >
              {blockingFormConflicts.length > 0 ? 'Save Anyway' : 'Save Schedule'}
            </AtlasButton>
          </div>
        </div>
      }
    >
      <form id={formId} noValidate onSubmit={onSubmit} className="space-y-5">
        <div className="p-4 rounded-panel bg-atlas-100/70 border border-atlas-700/20 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="font-ui text-micro font-bold uppercase tracking-wider text-atlas-slate block">
              Academic Term
            </span>
            <p className="font-display text-lead text-atlas-ink mt-0.5">{termLabel}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {currentSemester && <Badge status="approved" label="Active" />}
            <span className="inline-flex items-center px-3 h-7 rounded-marker bg-white/80 border border-atlas-700/15 font-ui text-caption font-semibold text-atlas-ink tabular-nums">
              {isLoadingDropdowns ? 'Loading…' : pluralize(subjects.length, 'subject')}
            </span>
          </div>
        </div>

        {/* Blocking and advisory conflicts are reported separately, because a faculty
            or section clash has to be resolved or overridden explicitly here. */}
        {blockingFormConflicts.length > 0 && (
          <div className="rounded-panel bg-sem-conflict-bg border border-sem-conflict/30 p-3.5 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-sem-conflict shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-ui text-caption font-semibold text-sem-conflict">
                {blockingFormConflicts[0].type === 'Teacher'
                  ? 'This professor is already teaching then'
                  : 'This section already has a class then'}
              </p>
              <p className="font-ui text-caption text-sem-conflict/90 mt-0.5 leading-relaxed">
                Two classes cannot share{' '}
                {blockingFormConflicts[0].type === 'Teacher' ? 'a professor' : 'a section'} at the
                same time. Change the time, or the{' '}
                {blockingFormConflicts[0].type === 'Teacher' ? 'professor' : 'section'}.
              </p>
            </div>
          </div>
        )}

        <Field
          id="schedule-subject-id"
          label="Subject"
          required
          error={formErrors.subject_id}
          hint={
            currentSemester
              ? `Showing published curriculum subjects offered in ${formatSemesterTerm(currentSemester.term)}.`
              : undefined
          }
        >
          {({ id, describedBy, invalid }) => (
            <SelectMenu
              id={id}
              describedBy={describedBy}
              invalid={invalid}
              value={formData.subject_id}
              onChange={(val) => onSelectSubject(val)}
              onBlur={() => onFieldBlur('subject_id')}
              options={subjectOptions}
              placeholder="Select current-term subject"
              menuTitle={termShort}
              emptyMessage="No published subjects found for the current term."
              emptySearchMessage="No matching subjects found in this term."
              searchable
              searchPlaceholder="Search by code, subject name, program, or year…"
              loading={isLoadingDropdowns}
              icon={BookOpen}
              itemNoun="subject"
            />
          )}
        </Field>

        {showUnassignedMajorNotice && (
          <div className="rounded-panel bg-amber-50/80 border border-amber-300/60 px-3.5 py-2.5 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="font-ui text-caption text-amber-900 leading-snug">
              This major subject has no assigned professor yet for the active term. Assign a faculty
              member in <span className="font-semibold">Teachers</span> before saving.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            id="schedule-faculty-id"
            label="Professor"
            required
            error={formErrors.faculty_id}
          >
            {({ id, describedBy, invalid }) => (
              <SelectMenu
                id={id}
                describedBy={describedBy}
                invalid={invalid}
                value={formData.faculty_id}
                onChange={(val) => onFieldChange('faculty_id', val)}
                onBlur={() => onFieldBlur('faculty_id')}
                options={professorOptions}
                placeholder="Select Professor"
                menuTitle="Department Faculty"
                emptyMessage="No professors available."
                searchable={teachers.length > 6}
                searchPlaceholder="Search professor name…"
                loading={isLoadingDropdowns}
                icon={UserCheck}
                itemNoun="professor"
              />
            )}
          </Field>

          <TextInput
            id="schedule-section"
            label="Section (Optional)"
            placeholder="e.g. 1A, CS-3A"
            value={formData.section}
            error={formErrors.section}
            onChange={(e) => onFieldChange('section', e.target.value)}
            onBlur={() => onFieldBlur('section')}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field
            id="schedule-day-of-week"
            label="Day"
            required
            error={formErrors.day_of_week}
          >
            {({ id, describedBy, invalid }) => (
              <SelectMenu
                id={id}
                describedBy={describedBy}
                invalid={invalid}
                value={formData.day_of_week}
                onChange={(val) => onFieldChange('day_of_week', val)}
                onBlur={() => onFieldBlur('day_of_week')}
                options={dayOptions}
                placeholder="Select Day"
                menuTitle="Class Day"
                icon={Calendar}
                minMenuWidth={200}
                itemNoun="day"
              />
            )}
          </Field>

          <TextInput
            id="schedule-start-time"
            type="time"
            label="Start Time"
            required
            value={formData.start_time}
            error={formErrors.start_time}
            onChange={(e) => onFieldChange('start_time', e.target.value)}
            onBlur={() => onFieldBlur('start_time')}
          />

          <TextInput
            id="schedule-end-time"
            type="time"
            label="End Time"
            required
            value={formData.end_time}
            error={formErrors.end_time}
            onChange={(e) => onFieldChange('end_time', e.target.value)}
            onBlur={() => onFieldBlur('end_time')}
          />
        </div>

        {aiSuggestions.length > 0 && (
          <div className="pt-4 border-t border-emerald-900/10 space-y-3">
            <h4 className="font-ui text-caption font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-700" aria-hidden="true" />
              Recommended Assignments
            </h4>
            <div className="space-y-2.5">
              {aiSuggestions.map((sug, idx) => (
                <div
                  key={idx}
                  className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-panel bg-white/80 border border-emerald-900/15 hover:border-emerald-700/35 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-ui text-body font-bold text-atlas-ink">
                        {sug.faculty_name}
                      </p>
                      <Badge status="approved" label={`${sug.confidence}% Match`} />
                    </div>
                    <p className="font-data text-caption text-atlas-slate mt-0.5">
                      {DAY_LABEL[sug.day_of_week] || sug.day_of_week} · {to12h(sug.start_time)} – {to12h(sug.end_time)}
                    </p>
                  </div>
                  <AtlasButton
                    variant="secondary"
                    size="sm"
                    onClick={() => onApplySuggestion(sug)}
                  >
                    Apply
                  </AtlasButton>
                </div>
              ))}
            </div>
          </div>
        )}
      </form>
    </AtlasDialog>
  );
}
