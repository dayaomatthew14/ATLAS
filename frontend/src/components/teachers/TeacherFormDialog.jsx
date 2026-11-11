import { Plus, Users as UsersIcon, X, Trash2, UserPlus } from 'lucide-react';
import AtlasDialog from '../ui/Dialog';
import AtlasButton from '../ui/Button';
import { TextInput, NumberInput, RadioGroup } from '../ui/Field';
import { pluralize, focusRing } from '../ui/tokens';
import { ValidationAnchor } from '../ui/ValidationPopup';
import { hasImmediateNameIssue } from '../../utils/validation';
import { DAY_ORDER as DAYS } from '../../utils/scheduleHelpers';

/**
 * Add / Edit Faculty modal dialog with teaching load limits and weekly unavailability editor.
 */
export default function TeacherFormDialog({
  isOpen,
  onClose,
  editingTeacher,
  isSavingTeacher,
  onSubmit,
  formData,
  setFormData,
  formErrors,
  setFormErrors,
  validateName,
  validateUnits,
  selectedDays,
  setSelectedDays,
  setCustomRanges,
  getRangesForDay,
  handleAddRange,
  handleRemoveRange,
  handleUpdateRange,
  formatTime,
}) {
  return (
    <AtlasDialog
      isOpen={isOpen}
      onClose={onClose}
      icon={editingTeacher ? UsersIcon : UserPlus}
      title={editingTeacher ? `Edit ${editingTeacher.name}` : 'Add Faculty'}
      description="Their teaching cap and unavailable hours both constrain generation."
      dismissible={!isSavingTeacher}
      footer={
        <>
          <AtlasButton variant="ghost" onClick={onClose} disabled={isSavingTeacher}>
            Cancel
          </AtlasButton>
          <AtlasButton type="submit" form="faculty-form" loading={isSavingTeacher}>
            {editingTeacher ? 'Save Changes' : 'Add Faculty'}
          </AtlasButton>
        </>
      }
    >
      {/* noValidate on purpose. The browser's own bubble fires before our
          handler, is a transient tooltip rather than a message under the
          field, and cannot be styled — so it both pre-empts and contradicts
          the inline errors below (ux-guidelines: Error Placement). */}
      <form id="faculty-form" noValidate onSubmit={onSubmit} className="flex flex-col gap-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="md:col-span-2">
            <TextInput
              label="Full name"
              required
              placeholder="e.g. Juan Dela Cruz"
              hint="First name, then surname"
              value={formData.name}
              error={formErrors.name}
              onChange={(e) => {
                const val = e.target.value;
                setFormData({ ...formData, name: val });
                setFormErrors((prev) => ({
                  ...prev,
                  name: hasImmediateNameIssue(val) ? validateName(val) : undefined,
                }));
              }}
              onBlur={() => setFormErrors((prev) => ({ ...prev, name: validateName(formData.name) }))}
            />
          </div>

          <RadioGroup
            label="Employment"
            required
            name="faculty-type"
            value={formData.type}
            onChange={(v) => {
              setFormData({ ...formData, type: v });
              setFormErrors((prev) => ({
                ...prev,
                max_units: formErrors.max_units || formData.max_units !== ''
                  ? validateUnits(formData.max_units, formData.load_unit, v)
                  : undefined,
              }));
            }}
            options={[
              {
                value: 'full_time',
                label: 'Full-time',
                hint: '20–24 hrs/week required',
              },
              {
                value: 'part_time',
                label: 'Part-time',
                hint: 'Under 20 hrs/week',
              },
            ]}
          />

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="faculty-load-limit"
                className="font-ui text-micro uppercase text-atlas-slate flex items-center gap-2"
              >
                {formData.load_unit === 'hrs' ? 'Maximum teaching hours' : 'Maximum subject units'}
              </label>
              <div
                className="inline-flex p-0.5 rounded-field bg-atlas-100 border border-atlas-line text-caption font-ui"
                role="group"
                aria-label="Load limit unit of measurement"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (formData.load_unit === 'units') return;
                    const maxLimit = formData.type === 'part_time' ? 12 : 18;
                    setFormData((prev) => ({
                      ...prev,
                      load_unit: 'units',
                      max_units: prev.max_units ? Math.min(maxLimit, Math.max(1, Math.round(Number(prev.max_units)))) : maxLimit,
                    }));
                    if (formErrors.max_units) setFormErrors((prev) => ({ ...prev, max_units: undefined }));
                  }}
                  className={`px-2.5 py-1 rounded-[4px] font-medium transition-all duration-state ease-standard ${
                    formData.load_unit !== 'hrs'
                      ? 'bg-white text-atlas-ink shadow-sm'
                      : 'text-atlas-slate hover:text-atlas-ink'
                  }`}
                >
                  Units
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (formData.load_unit === 'hrs') return;
                    const maxLimit = formData.type === 'part_time' ? 20 : 30;
                    setFormData((prev) => ({
                      ...prev,
                      load_unit: 'hrs',
                      max_units: prev.max_units ? Math.min(maxLimit, Math.max(1, Math.round(Number(prev.max_units)))) : (formData.type === 'part_time' ? 16 : 24),
                    }));
                    if (formErrors.max_units) setFormErrors((prev) => ({ ...prev, max_units: undefined }));
                  }}
                  className={`px-2.5 py-1 rounded-[4px] font-medium transition-all duration-state ease-standard ${
                    formData.load_unit === 'hrs'
                      ? 'bg-white text-atlas-ink shadow-sm'
                      : 'text-atlas-slate hover:text-atlas-ink'
                  }`}
                >
                  Hours (hrs)
                </button>
              </div>
            </div>

            <NumberInput
              id="faculty-load-limit"
              suffix={formData.load_unit === 'hrs' ? 'hrs' : 'units'}
              min={1}
              max={
                formData.load_unit === 'hrs'
                  ? (formData.type === 'part_time' ? 20 : 30)
                  : (formData.type === 'part_time' ? 12 : 18)
              }
              value={formData.max_units}
              error={formErrors.max_units}
              onChange={(e) => {
                setFormData({ ...formData, max_units: e.target.value });
                if (formErrors.max_units) setFormErrors({ ...formErrors, max_units: undefined });
              }}
              onBlur={() => setFormErrors((prev) => ({ ...prev, max_units: validateUnits(formData.max_units, formData.load_unit, formData.type) }))}
            />
          </div>
        </div>

        <ValidationAnchor
          error={formErrors.unavailability}
          label="Unavailable Hours"
          errorId="teacher-unavailability-error"
        >
          {({ badge }) => (
            <fieldset
              className="pt-2"
              aria-invalid={formErrors.unavailability ? 'true' : undefined}
              aria-describedby={formErrors.unavailability ? 'teacher-unavailability-error' : undefined}
            >
              <div className="flex items-center justify-between gap-2 mb-3 min-h-5">
                <legend className="font-ui text-micro uppercase text-atlas-slate">
                  Unavailable hours
                </legend>
                {badge}
              </div>

              <div className="flex flex-wrap gap-2">
                {DAYS.map((day) => {
                  const isSelected = selectedDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedDays((prev) => prev.filter((d) => d !== day));
                          setCustomRanges((prev) => {
                            const next = { ...prev };
                            delete next[day];
                            return next;
                          });
                        } else {
                          setSelectedDays((prev) => [...prev, day]);
                          setCustomRanges((prev) => ({
                            ...prev,
                            [day]: [{ id: Math.random().toString(36).substring(2, 9), start: '07:30', end: '17:30', active: false }],
                          }));
                        }
                      }}
                      className={`h-10 px-4 rounded-control font-ui text-body border
                                  transition-colors duration-state ease-standard ${focusRing} ${
                        isSelected
                          ? 'bg-sem-conflict-bg border-sem-conflict/40 text-sem-conflict font-medium'
                          : 'glass text-atlas-slate hover:text-atlas-ink'
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>

              <p className="font-ui text-caption text-atlas-slate mt-2">
                {selectedDays.length === 0
                  ? 'Available all week. Pick a day to mark it unavailable.'
                  : 'Whole day unless you set specific hours below.'}
              </p>

              {selectedDays.length > 0 && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 px-1 py-1">
                    <span className="font-ui text-micro uppercase text-atlas-slate font-medium">
                      {pluralize(selectedDays.length, 'day')} unavailable
                    </span>
                    <AtlasButton
                      size="row"
                      variant="destructive"
                      icon={Trash2}
                      onClick={() => {
                        setSelectedDays([]);
                        setCustomRanges({});
                        if (formErrors.unavailability) {
                          setFormErrors((prev) => ({ ...prev, unavailability: undefined }));
                        }
                      }}
                    >
                      Clear all
                    </AtlasButton>
                  </div>

                  {DAYS.filter((d) => selectedDays.includes(d)).map((day) => {
                    const ranges = getRangesForDay(day);
                    return (
                      <div
                        key={day}
                        className="rounded-panel border border-atlas-line bg-atlas-canvas/40 overflow-hidden divide-y divide-atlas-line shadow-xs"
                      >
                        {ranges.map((range, rangeIdx) => {
                          const isFirst = rangeIdx === 0;
                          return (
                            <div
                              key={`${day}-${range.id || rangeIdx}`}
                              className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2.5"
                            >
                              {isFirst ? (
                                <>
                                  <span className="font-ui text-body text-atlas-ink w-11 shrink-0 font-semibold">
                                    {day}
                                  </span>

                                  <label className="flex items-center gap-2 cursor-pointer shrink-0 w-[116px]">
                                    <input
                                      type="checkbox"
                                      checked={range.active}
                                      onChange={(e) => {
                                        const checked = e.target.checked;
                                        if (!checked && ranges.length > 1) {
                                          setCustomRanges((prev) => ({
                                            ...prev,
                                            [day]: [{
                                              id: Math.random().toString(36).substring(2, 9),
                                              start: '07:30',
                                              end: '17:30',
                                              active: false,
                                            }],
                                          }));
                                        } else {
                                          handleUpdateRange(day, range.id, { active: checked });
                                        }
                                      }}
                                      className={`w-4 h-4 shrink-0 accent-[var(--atlas-green-700)] ${focusRing}`}
                                    />
                                    <span className="font-ui text-caption text-atlas-slate">Specific hours</span>
                                  </label>
                                </>
                              ) : (
                                <>
                                  {/* On added time slots, do not duplicate text before time (only the time) */}
                                  <span className="w-11 shrink-0 hidden sm:block" aria-hidden="true" />
                                  <span className="w-[116px] shrink-0 hidden sm:block" aria-hidden="true" />
                                </>
                              )}

                              {range.active ? (
                                <span className="flex items-center gap-1.5 shrink-0">
                                  <label className="sr-only" htmlFor={`unavail-${day}-${range.id}-from`}>
                                    {day} unavailable from
                                  </label>
                                  <input
                                    id={`unavail-${day}-${range.id}-from`}
                                    type="time"
                                    value={range.start}
                                    onChange={(e) => handleUpdateRange(day, range.id, { start: e.target.value })}
                                    className={`h-9 px-2 w-[116px] rounded-field font-data text-table text-atlas-ink
                                                bg-white/70 border border-atlas-control ${focusRing}`}
                                  />
                                  <span className="font-ui text-caption text-atlas-slate px-0.5">to</span>
                                  <label className="sr-only" htmlFor={`unavail-${day}-${range.id}-to`}>
                                    {day} unavailable until
                                  </label>
                                  <input
                                    id={`unavail-${day}-${range.id}-to`}
                                    type="time"
                                    value={range.end}
                                    onChange={(e) => handleUpdateRange(day, range.id, { end: e.target.value })}
                                    className={`h-9 px-2 w-[116px] rounded-field font-data text-table text-atlas-ink
                                                bg-white/70 border border-atlas-control ${focusRing}`}
                                  />
                                </span>
                              ) : (
                                <span className="font-ui text-caption text-atlas-slate tabular-nums py-0.5">
                                  All day · {formatTime('07:30')} – {formatTime('17:30')}
                                </span>
                              )}

                              <div className="flex items-center gap-1 shrink-0 ml-auto pr-1">
                                <AtlasButton
                                  size="row"
                                  variant="ghost"
                                  icon={Plus}
                                  onClick={() => handleAddRange(day)}
                                  aria-label={`Add another unavailable time for ${day}`}
                                  className="!px-2 !gap-1.5"
                                >
                                  Add
                                </AtlasButton>
                                <AtlasButton
                                  size="row"
                                  variant="ghost"
                                  icon={X}
                                  onClick={() => handleRemoveRange(day, range.id)}
                                  aria-label={`Remove unavailable time for ${day}`}
                                  className="!px-2 !gap-1.5 hover:!text-rose-600"
                                >
                                  Remove
                                </AtlasButton>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </fieldset>
          )}
        </ValidationAnchor>
      </form>
    </AtlasDialog>
  );
}
