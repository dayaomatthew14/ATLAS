import { AlertTriangle, Sparkles } from 'lucide-react';
import Modal from '../Modal';
import AtlasButton from '../ui/Button';
import Badge from '../ui/Badge';
import { ValidationAnchor } from '../ui/ValidationPopup';
import { focusRing, pluralize } from '../ui/tokens';

/**
 * AI timetable generation modal: professor selection, unassigned-subject notice,
 * generation progress, and per-item post-run summary/resolution actions.
 */
export default function GenerateScheduleModal({
  isOpen,
  onClose,
  onSubmit,
  semesters,
  selectedGenSemester,
  genErrors,
  setGenErrors,
  formatSemesterTerm,
  unassignedOfferingsData,
  onReviewAssigned,
  allTeachers,
  selectedGenProfessors,
  setSelectedGenProfessors,
  isGenerating,
  generationResults,
  onCloseAndClearResults,
  onSolveConflict,
}) {
  const activeSem =
    semesters.find((s) => s.is_active) ||
    (selectedGenSemester ? semesters.find((s) => s.id === Number(selectedGenSemester)) : null);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="AI Schedule Generation">
      <form noValidate onSubmit={onSubmit} className="space-y-6">
        {!generationResults ? (
          <>
            <ValidationAnchor error={genErrors.semester} label="Academic Term" errorId="gen-semester-error">
              {({ badge }) => (
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2 min-h-5">
                    <p className="font-ui text-micro uppercase text-atlas-slate">Academic term</p>
                    {badge}
                  </div>
                  <div
                    className={`p-4 rounded-panel border flex items-center justify-between gap-3 ${
                      genErrors.semester ? 'bg-red-50/70 border-sem-conflict' : 'bg-atlas-100/70 border-atlas-700/20'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-ui text-body text-atlas-ink">
                        {activeSem
                          ? `${activeSem.academic_year} ${formatSemesterTerm(activeSem.term)}`
                          : 'No active term configured'}
                      </p>
                      <p className="font-ui text-caption text-atlas-slate mt-0.5">
                        The term this generation writes into.
                      </p>
                    </div>
                    {activeSem && <Badge status="approved" label="Active" />}
                  </div>
                </div>
              )}
            </ValidationAnchor>

            {unassignedOfferingsData.unassigned > 0 && (
              <div className="p-4 rounded-panel bg-amber-50/80 border border-amber-300 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-ui text-sm font-bold text-amber-950">
                    Notice: {unassignedOfferingsData.unassigned} unassigned major{' '}
                    {unassignedOfferingsData.unassigned === 1 ? 'subject' : 'subjects'}
                  </p>
                  <p className="font-ui text-xs text-amber-800 mt-1 leading-relaxed">
                    Unassigned subjects will be skipped until assigned to a professor. You can still proceed to generate schedules for the selected professors below.
                  </p>
                  <div className="mt-2.5">
                    <AtlasButton
                      size="small"
                      variant="secondary"
                      className="bg-white border-amber-300 text-amber-900 hover:bg-amber-100"
                      onClick={onReviewAssigned}
                    >
                      Review Assigned Subjects
                    </AtlasButton>
                  </div>
                </div>
              </div>
            )}

            <ValidationAnchor
              error={genErrors.professors || genErrors.submit}
              label="Professors to Schedule"
              errorId="gen-professors-error"
            >
              {({ badge }) => (
                <fieldset>
                  <div className="flex items-center justify-between gap-3 mb-2 min-h-5">
                    <div className="flex items-center gap-2 min-w-0">
                      <legend className="font-ui text-micro uppercase text-atlas-slate">
                        Professors to schedule
                      </legend>
                      {badge}
                    </div>
                    <AtlasButton
                      size="row"
                      variant="ghost"
                      onClick={() => {
                        const next =
                          selectedGenProfessors.length === allTeachers.length ? [] : allTeachers.map((t) => t.id);
                        setSelectedGenProfessors(next);
                        setGenErrors((prev) => ({
                          ...prev,
                          professors: next.length === 0 ? 'Select at least one professor to schedule.' : undefined,
                          submit: undefined,
                        }));
                      }}
                    >
                      {selectedGenProfessors.length === allTeachers.length ? 'Clear all' : 'Select all'}
                    </AtlasButton>
                  </div>
                  <div
                    className={`rounded-panel border max-h-60 overflow-y-auto divide-y divide-atlas-line ${
                      genErrors.professors || genErrors.submit ? 'border-sem-conflict' : 'border-atlas-line'
                    }`}
                  >
                    {allTeachers.map((prof) => {
                      const checked = selectedGenProfessors.includes(prof.id);
                      return (
                        <label
                          key={prof.id}
                          className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors duration-state ease-standard ${
                            checked ? 'bg-atlas-100/60' : 'hover:bg-atlas-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...selectedGenProfessors, prof.id]
                                : selectedGenProfessors.filter((id) => id !== prof.id);
                              setSelectedGenProfessors(next);
                              setGenErrors((prev) => ({
                                ...prev,
                                professors: next.length === 0 ? 'Select at least one professor to schedule.' : undefined,
                                submit: undefined,
                              }));
                            }}
                            className={`w-4 h-4 shrink-0 accent-[var(--atlas-green-700)] ${focusRing}`}
                          />
                          <span className="font-ui text-body text-atlas-ink">{prof.name}</span>
                        </label>
                      );
                    })}
                    {allTeachers.length === 0 && (
                      <p className="p-6 text-center font-ui text-body text-atlas-slate">No professors found.</p>
                    )}
                  </div>
                  <p className="font-ui text-caption text-atlas-slate mt-2 tabular-nums">
                    {pluralize(selectedGenProfessors.length, 'professor')} selected
                  </p>
                </fieldset>
              )}
            </ValidationAnchor>

            <div className="pt-5 flex justify-end items-center gap-3 border-t border-white/45">
              <AtlasButton variant="ghost" onClick={onClose} disabled={isGenerating}>
                Cancel
              </AtlasButton>
              <AtlasButton type="submit" icon={Sparkles} loading={isGenerating} disabled={isGenerating}>
                {isGenerating ? 'Generating…' : 'Generate Schedule'}
              </AtlasButton>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-5 rise">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Generated', value: generationResults.generated, tone: 'good' },
                {
                  label: 'Unplaced',
                  value: generationResults.unplaced_count,
                  tone: generationResults.unplaced_count > 0 ? 'conflict' : 'default',
                },
                { label: 'Skipped GenEd', value: generationResults.skipped_gened, tone: 'default' },
              ].map((s) => (
                <div key={s.label} className="glass sheen rounded-panel surface px-4 py-3.5 text-center">
                  <p className="font-ui text-micro uppercase text-atlas-slate">{s.label}</p>
                  <p
                    className={`font-display text-page tabular-nums mt-1 leading-none ${
                      s.tone === 'good' ? 'text-atlas-700' : s.tone === 'conflict' ? 'text-sem-conflict' : 'text-atlas-ink'
                    }`}
                  >
                    {s.value}
                  </p>
                </div>
              ))}
            </div>

            {generationResults.unplaced_items?.length > 0 && (
              <div>
                <p className="font-ui text-micro uppercase text-sem-conflict mb-2">
                  Unplaced ({generationResults.unplaced_items.length})
                </p>
                <ul className="rounded-panel border border-sem-conflict/25 divide-y divide-sem-conflict/15 max-h-60 overflow-y-auto">
                  {generationResults.unplaced_items.map((item, idx) => (
                    <li key={idx} className="flex items-center justify-between gap-3 px-4 py-3 bg-sem-conflict-bg/40">
                      <span className="flex items-center gap-3 min-w-0">
                        <span className="font-data text-table text-sem-conflict shrink-0">{item.subject}</span>
                        <span className="min-w-0">
                          {item.section && item.section.trim() !== '' && (
                            <span className="block font-ui text-body text-atlas-ink">{item.section}</span>
                          )}
                          <span className="block font-ui text-caption text-atlas-slate">{item.reason}</span>
                        </span>
                      </span>
                      <AtlasButton
                        size="row"
                        variant="destructive"
                        icon={Sparkles}
                        onClick={() => onSolveConflict(item)}
                        className="shrink-0"
                      >
                        Resolve
                      </AtlasButton>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {generationResults.workload_warnings?.length > 0 && (
              <div>
                <p className="font-ui text-micro uppercase text-sem-warning mb-2">
                  Teaching load warnings ({generationResults.workload_warnings.length})
                </p>
                <ul className="rounded-panel border border-sem-warning/30 divide-y divide-sem-warning/20 max-h-48 overflow-y-auto">
                  {generationResults.workload_warnings.map((warn, idx) => (
                    <li key={idx} className="flex items-start justify-between gap-3 px-4 py-3 bg-sem-warning-bg/50">
                      <span className="min-w-0">
                        <span className="block font-ui text-body text-atlas-ink">
                          {warn.faculty_name}
                          <span className="font-ui text-caption text-atlas-slate ml-2">
                            {warn.employment_type || 'Full-Time'}
                          </span>
                        </span>
                        <span className="block font-ui text-caption text-atlas-slate mt-0.5 tabular-nums">
                          {warn.required_hours != null
                            ? `${warn.current_hours} of ${warn.required_hours} required hrs/week`
                            : `${warn.current_hours} hrs/week, part-time ceiling ${warn.part_time_ceiling_hours}`}
                          {' · '}
                          {warn.subject_code} adds {warn.additional_hours} hrs
                          {warn.overload_hours != null ? ` · ${warn.overload_hours} hrs overload` : ''}
                        </span>
                      </span>
                      <Badge status="review" label="Needs approval" className="shrink-0" />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="pt-4 flex justify-center border-t border-slate-100">
              <button
                type="button"
                onClick={onCloseAndClearResults}
                className="h-10 px-4 rounded-control glass font-ui font-medium text-body text-atlas-700 hover:bg-white/90 transition-colors duration-state ease-standard"
              >
                Close &amp; View Schedule
              </button>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}

