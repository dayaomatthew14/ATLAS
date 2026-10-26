import { useState, useEffect, useCallback } from 'react';
import {
  Plus, RefreshCw, AlertTriangle, Library, Building2, GraduationCap, BookOpen, AlertCircle,
} from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';
import Button from '../../components/ui/Button';
import RowMenu from '../../components/ui/RowMenu';
import Dialog, { ConfirmDialog } from '../../components/ui/Dialog';
import { TextInput, SelectInput } from '../../components/ui/Field';
import { DEPARTMENTS, pluralize } from '../../components/ui/tokens';
import { isDean, getDepartment } from '../../utils/session';

/**
 * Colleges & Programmes.
 *
 * The screen that makes "the curriculum for BS Agriculture" a sentence the
 * system can act on. Before this, a department was minted per user account at
 * registration (`DEPT_{id}`), so three separate rows all meant CAST and a
 * programme was whatever text an Excel filename happened to contain.
 *
 * Programmes are shown grouped under their college rather than as one flat
 * table: the grouping is the information. Counts come from the API so a
 * programme with no curriculum loaded is visible as a gap rather than as an
 * absent row.
 */

const EMPTY_FORM = { code: '', name: '', department_id: '' };

function collegeHue(code) {
  return DEPARTMENTS[code]?.hue || 'var(--dept-unregistered)';
}

export default function Colleges() {
  const { addToast } = useToast();
  const deanMode = isDean();
  const deptCode = getDepartment();

  const [colleges, setColleges] = useState([]);
  const [unassigned, setUnassigned] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBlockedReason, setDeleteBlockedReason] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const [assignTarget, setAssignTarget] = useState(null);
  const [assignProgramId, setAssignProgramId] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const [collegeData, unassignedData] = await Promise.all([
        api.get('/colleges'),
        api.get('/colleges/unassigned').catch(() => []),
      ]);
      setColleges(Array.isArray(collegeData) ? collegeData : []);
      setUnassigned(Array.isArray(unassignedData) ? unassignedData : []);
    } catch (err) {
      setColleges([]);
      setLoadError(err.message || 'Could not load the academic taxonomy.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const allPrograms = colleges.flatMap((c) =>
    c.programs.map((p) => ({ ...p, collegeCode: c.code }))
  );
  const programCount = allPrograms.length;
  const withCurriculum = allPrograms.filter((p) => p.block_count > 0).length;

  const openCreate = (collegeId) => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, department_id: String(collegeId ?? colleges[0]?.id ?? '') });
    setFormErrors({});
    setIsFormOpen(true);
  };

  const openEdit = (program) => {
    setEditing(program);
    setForm({
      code: program.code || '',
      name: program.name || '',
      department_id: String(program.department_id ?? ''),
    });
    setFormErrors({});
    setIsFormOpen(true);
  };

  const validate = () => {
    const errors = {};
    const code = form.code.trim();
    if (code.length < 2) errors.code = 'Enter a program code, such as BSCS.';
    else if (!/^[A-Za-z0-9]+$/.test(code)) errors.code = 'Use letters and numbers only.';
    else {
      const clash = allPrograms.find(
        (p) => p.code.toUpperCase() === code.toUpperCase() && p.id !== editing?.id
      );
      // Caught here as well as server-side, because the codes print on
      // timetables where there is no context to tell two the same apart.
      if (clash) errors.code = `${clash.code} is already used by ${clash.name}.`;
    }
    if (form.name.trim().length < 3) errors.name = 'Enter the full program name.';
    if (!form.department_id) errors.department_id = 'Choose a college.';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setIsSaving(true);
    const payload = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      department_id: Number(form.department_id),
    };
    try {
      if (editing) {
        await api.put(`/colleges/programs/${editing.id}`, payload);
        addToast(`${payload.name} updated.`, 'success');
      } else {
        await api.post('/colleges/programs', payload);
        addToast(`${payload.name} added.`, 'success');
      }
      setIsFormOpen(false);
      fetchAll();
    } catch (err) {
      addToast(err.message || 'Could not save the program.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await api.delete(`/colleges/programs/${deleteTarget.id}`);
      addToast(`${deleteTarget.name} deleted.`, 'success');
      setDeleteTarget(null);
      fetchAll();
    } catch (err) {
      // 409 carries the curriculum-block count; that is a refusal with a
      // reason, not a failure.
      if (err.status === 409) setDeleteBlockedReason(err.message);
      else addToast(err.message || 'Could not delete the program.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const confirmAssign = async () => {
    if (!assignTarget || !assignProgramId) return;
    setIsAssigning(true);
    try {
      const res = await api.post(`/colleges/blocks/${assignTarget.id}/assign/${assignProgramId}`, {});
      addToast(res.message || 'Curriculum assigned.', 'success');
      setAssignTarget(null);
      setAssignProgramId('');
      fetchAll();
    } catch (err) {
      addToast(err.message || 'Could not assign the curriculum.', 'error');
    } finally {
      setIsAssigning(false);
    }
  };

  const collegeOptions = colleges.map((c) => ({ value: String(c.id), label: `${c.code} — ${c.name}` }));

  return (
    <div className="p-6 lg:p-8">
      <header className="mb-6 flex flex-col gap-4">
        {/* Title row with icon badge & action buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-800 to-emerald-950 text-white flex items-center justify-center shrink-0 shadow-md border border-emerald-500/30">
              <Library className="w-5.5 h-5.5 text-emerald-200" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="font-ui text-2xl sm:text-3xl font-bold tracking-tight text-atlas-ink">
                College & Programs
              </h1>
              <p className="font-ui text-xs sm:text-sm text-atlas-slate mt-0.5 font-medium">
                Academic structure and degree offerings for {colleges[0]?.name || deptCode || 'College'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-auto">
            <Button variant="secondary" icon={RefreshCw} onClick={fetchAll}>
              Refresh
            </Button>
            <Button icon={Plus} onClick={() => openCreate()} disabled={!colleges.length}>
              Add Program
            </Button>
          </div>
        </div>

        {/* Stats strip with executive pill chips */}
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/70 backdrop-blur-xs border border-emerald-900/10 shadow-xs">
            <Building2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" aria-hidden="true" />
            <span className="font-ui text-xs font-semibold text-emerald-950">
              {colleges.length} {colleges.length === 1 ? 'College' : 'Colleges'}
            </span>
          </div>

          <span className="text-slate-300 font-light" aria-hidden="true">·</span>

          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/70 backdrop-blur-xs border border-emerald-900/10 shadow-xs">
            <GraduationCap className="w-3.5 h-3.5 text-emerald-700 shrink-0" aria-hidden="true" />
            <span className="font-ui text-xs font-semibold text-emerald-950">
              {pluralize(programCount, 'Program')}
            </span>
          </div>

          <span className="text-slate-300 font-light" aria-hidden="true">·</span>

          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-xs border shadow-xs ${
            withCurriculum === programCount && programCount > 0
              ? 'bg-emerald-50/80 border-emerald-300 text-emerald-900'
              : 'bg-amber-50/80 border-amber-300/80 text-amber-900'
          }`}>
            <BookOpen className={`w-3.5 h-3.5 shrink-0 ${
              withCurriculum === programCount && programCount > 0 ? 'text-emerald-700' : 'text-amber-700'
            }`} aria-hidden="true" />
            <span className="font-ui text-xs font-semibold">
              {withCurriculum} with Curriculum Loaded
            </span>
            <span className={`px-1.5 py-0.5 rounded-full font-data text-[10px] font-bold ${
              withCurriculum === programCount && programCount > 0
                ? 'bg-emerald-200/80 text-emerald-900'
                : 'bg-amber-200/80 text-amber-900'
            }`}>
              {programCount > 0 ? `${Math.round((withCurriculum / programCount) * 100)}%` : '0%'}
            </span>
          </div>
        </div>
      </header>

      {loadError && (
        <div className="glass rounded-panel !border-sem-info/30 p-6 text-center mb-6">
          <p className="font-ui text-body text-atlas-ink">{loadError}</p>
          <div className="mt-3 flex justify-center">
            <Button variant="secondary" onClick={fetchAll}>Retry</Button>
          </div>
        </div>
      )}

      {isLoading && !colleges.length && (
        <div className="flex flex-col gap-3" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 glass rounded-panel animate-pulse motion-reduce:animate-none" />
          ))}
          <span className="sr-only">Loading…</span>
        </div>
      )}

      <div className="flex flex-col gap-5">
        {colleges.map((college) => (
          <section
            key={college.id}
            className="glass rounded-panel overflow-hidden border border-emerald-900/10 shadow-xs"
          >
            {/* The hue never appears without its college code as adjacent text:
                the four differ in hue, not luminance, so the stripe alone is
                unreliable in greyscale and under deuteranopia. */}
            <header
              className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-emerald-900/10 bg-white/40"
              style={{ borderLeft: `4px solid ${collegeHue(college.code)}` }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="px-2.5 py-1 rounded-md font-ui text-xs font-bold text-white shadow-xs shrink-0"
                  style={{ backgroundColor: collegeHue(college.code) }}
                >
                  {college.code}
                </span>
                <div className="min-w-0">
                  <h2 className="font-ui text-sm sm:text-base font-bold text-atlas-ink truncate">{college.name}</h2>
                  <p className="font-ui text-xs text-atlas-slate">
                    {pluralize(college.programs.length, 'degree program')}
                  </p>
                </div>
              </div>
              <Button size="row" variant="ghost" icon={Plus} onClick={() => openCreate(college.id)}>
                Add Program
              </Button>
            </header>

            {college.programs.length === 0 ? (
              <p className="px-5 py-6 font-ui text-body text-atlas-slate text-center">
                No programs in this college yet.
              </p>
            ) : (
              <ul className="divide-y divide-emerald-900/5">
                {college.programs.map((program) => (
                  <li key={program.id} className="flex items-center gap-4 px-5 py-3 hover:bg-white/30 transition-colors">
                    <span className="font-data text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-atlas-ink border border-slate-200/60 shrink-0">
                      {program.code}
                    </span>
                    <span className="font-ui text-body font-medium text-atlas-ink flex-1 min-w-0 truncate">
                      {program.name}
                    </span>
                    {program.block_count > 0 ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-ui text-xs font-medium border border-emerald-200/80 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 shrink-0" />
                        <span>
                          {pluralize(program.block_count, 'curriculum', 'curricula')} · {pluralize(program.subject_count, 'subject')}
                        </span>
                      </span>
                    ) : (
                      // A program with no curriculum is the gap this screen
                      // exists to surface, so it is stated rather than blank.
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 font-ui text-xs font-medium border border-amber-200 shrink-0">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>No curriculum loaded</span>
                      </span>
                    )}
                    <RowMenu
                      label={`Actions for ${program.name}`}
                      items={[
                        { label: 'Edit program', onSelect: () => openEdit(program) },
                        {
                          label: 'Delete program',
                          destructive: true,
                          onSelect: () => { setDeleteTarget(program); setDeleteBlockedReason(''); },
                          disabled: program.block_count > 0,
                          disabledReason: 'Delete or reassign its curriculum first.',
                        },
                      ]}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        {/* Curriculum that matches no program. Kept visible on purpose —
            hiding it would lose real subject data silently. */}
        {unassigned.length > 0 && (
          <section className="rounded-panel border border-sem-warning/40 bg-sem-warning-bg overflow-hidden">
            <header className="flex items-start gap-3 px-5 py-4 border-b border-sem-warning/30">
              <AlertTriangle className="w-5 h-5 text-sem-warning shrink-0 mt-0.5" aria-hidden="true" />
              <div className="min-w-0">
                <h2 className="font-ui text-body font-semibold text-atlas-ink">
                  Unassigned curriculum
                </h2>
                <p className="font-ui text-caption text-atlas-slate mt-0.5">
                  {pluralize(unassigned.length, 'curriculum block', 'curriculum blocks')} that
                  {unassigned.length === 1 ? ' does' : ' do'} not belong to any program, imported
                  before the taxonomy existed. Assign or delete each one.
                </p>
              </div>
            </header>
            <ul className="divide-y divide-sem-warning/25">
              {unassigned.map((block) => (
                <li key={block.id} className="flex items-center gap-4 px-5 py-3">
                  <span className="font-ui text-body text-atlas-ink flex-1 min-w-0 truncate">
                    {block.program_name}
                  </span>
                  <span className="font-ui text-caption text-atlas-slate shrink-0 tabular-nums">
                    {block.academic_year} · {pluralize(block.subject_count, 'subject')}
                  </span>
                  <Button
                    size="row"
                    variant="secondary"
                    onClick={() => { setAssignTarget(block); setAssignProgramId(''); }}
                  >
                    Assign
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <Dialog
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'Add Program'}
        dismissible={!isSaving}
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsFormOpen(false)} disabled={isSaving}>Cancel</Button>
            <Button type="submit" form="program-form" loading={isSaving}>
              {editing ? 'Save Program' : 'Add Program'}
            </Button>
          </>
        }
      >
        <form id="program-form" onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <TextInput
            label="Program code"
            required
            hint="Printed on timetables — keep it unique"
            placeholder="BSCS"
            value={form.code}
            error={formErrors.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
          <SelectInput
            label="College"
            required
            disabled={deanMode}
            value={form.department_id}
            error={formErrors.department_id}
            onChange={(e) => setForm({ ...form, department_id: e.target.value })}
            options={collegeOptions}
          />
          <div className="md:col-span-2">
            <TextInput
              label="Program name"
              required
              placeholder="BS Computer Science"
              value={form.name}
              error={formErrors.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
        </form>
      </Dialog>

      <Dialog
        isOpen={Boolean(assignTarget)}
        onClose={() => setAssignTarget(null)}
        title={assignTarget ? `Assign "${assignTarget.program_name}"` : ''}
        description="Its subjects move to the college that owns the program you choose."
        size="confirm"
        dismissible={!isAssigning}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAssignTarget(null)} disabled={isAssigning}>Cancel</Button>
            <Button onClick={confirmAssign} loading={isAssigning} disabled={!assignProgramId}>
              Assign Curriculum
            </Button>
          </>
        }
      >
        <SelectInput
          label="Program"
          required
          value={assignProgramId}
          onChange={(e) => setAssignProgramId(e.target.value)}
          options={[
            { value: '', label: 'Choose a program…' },
            ...colleges.map((c) => ({
              group: `${c.code} — ${c.name}`,
              options: c.programs.map((p) => ({ value: String(p.id), label: `${p.code} · ${p.name}` })),
            })),
          ]}
        />
      </Dialog>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => { setDeleteTarget(null); setDeleteBlockedReason(''); }}
        onConfirm={confirmDelete}
        title={
          deleteBlockedReason
            ? `${deleteTarget?.name} cannot be deleted`
            : `Delete ${deleteTarget?.name}?`
        }
        description="Accounts assigned to this program's college are not affected."
        confirmLabel="Delete Program"
        destructive
        loading={isDeleting}
        blocked={Boolean(deleteBlockedReason)}
        blockedReason={deleteBlockedReason}
      />
    </div>
  );
}
