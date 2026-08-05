import { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw, AlertTriangle } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';
import Button from '../../components/ui/Button';
import RowMenu from '../../components/ui/RowMenu';
import Dialog, { ConfirmDialog } from '../../components/ui/Dialog';
import { TextInput, SelectInput } from '../../components/ui/Field';
import { DEPARTMENTS, pluralize } from '../../components/ui/tokens';

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
    if (code.length < 2) errors.code = 'Enter a programme code, such as BSCS.';
    else if (!/^[A-Za-z0-9]+$/.test(code)) errors.code = 'Use letters and numbers only.';
    else {
      const clash = allPrograms.find(
        (p) => p.code.toUpperCase() === code.toUpperCase() && p.id !== editing?.id
      );
      // Caught here as well as server-side, because the codes print on
      // timetables where there is no context to tell two the same apart.
      if (clash) errors.code = `${clash.code} is already used by ${clash.name}.`;
    }
    if (form.name.trim().length < 3) errors.name = 'Enter the full programme name.';
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
      addToast(err.message || 'Could not save the programme.', 'error');
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
      else addToast(err.message || 'Could not delete the programme.', 'error');
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
      <header className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="font-display text-page text-atlas-ink">Colleges &amp; Programmes</h1>
          <p className="font-ui text-body text-atlas-slate mt-1">
            {isLoading
              ? 'Loading the academic taxonomy…'
              : `${colleges.length} colleges · ${pluralize(programCount, 'programme')} · ${withCurriculum} with curriculum loaded`}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="secondary" icon={RefreshCw} onClick={fetchAll}>Refresh</Button>
          <Button icon={Plus} onClick={() => openCreate()} disabled={!colleges.length}>
            Add Programme
          </Button>
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
            className="glass rounded-panel overflow-hidden"
          >
            {/* The hue never appears without its college code as adjacent text:
                the four differ in hue, not luminance, so the stripe alone is
                unreliable in greyscale and under deuteranopia. */}
            <header
              className="flex items-start justify-between gap-4 px-5 py-4 border-b border-white/45"
              style={{ borderLeft: `3px solid ${collegeHue(college.code)}` }}
            >
              <div className="min-w-0">
                <h2 className="font-data text-body font-semibold text-atlas-ink">{college.code}</h2>
                <p className="font-ui text-caption text-atlas-slate mt-0.5">{college.name}</p>
              </div>
              <Button size="row" variant="ghost" icon={Plus} onClick={() => openCreate(college.id)}>
                Add
              </Button>
            </header>

            {college.programs.length === 0 ? (
              <p className="px-5 py-6 font-ui text-body text-atlas-slate text-center">
                No programmes in this college yet.
              </p>
            ) : (
              <ul className="divide-y divide-white/45">
                {college.programs.map((program) => (
                  <li key={program.id} className="flex items-center gap-4 px-5 py-3">
                    <span className="font-data text-table text-atlas-slate w-20 shrink-0">
                      {program.code}
                    </span>
                    <span className="font-ui text-body text-atlas-ink flex-1 min-w-0 truncate">
                      {program.name}
                    </span>
                    {program.block_count > 0 ? (
                      <span className="font-ui text-caption text-atlas-slate shrink-0 tabular-nums">
                        {pluralize(program.block_count, 'curriculum', 'curricula')} ·{' '}
                        {pluralize(program.subject_count, 'subject')}
                      </span>
                    ) : (
                      // A programme with no curriculum is the gap this screen
                      // exists to surface, so it is stated rather than blank.
                      <span className="font-ui text-caption text-sem-warning shrink-0">
                        No curriculum loaded
                      </span>
                    )}
                    <RowMenu
                      label={`Actions for ${program.name}`}
                      items={[
                        { label: 'Edit programme', onSelect: () => openEdit(program) },
                        {
                          label: 'Delete programme',
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

        {/* Curriculum that matches no programme. Kept visible on purpose —
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
                  {unassigned.length === 1 ? ' does' : ' do'} not belong to any programme, imported
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
        title={editing ? `Edit ${editing.name}` : 'Add Programme'}
        dismissible={!isSaving}
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsFormOpen(false)} disabled={isSaving}>Cancel</Button>
            <Button type="submit" form="program-form" loading={isSaving}>
              {editing ? 'Save Programme' : 'Add Programme'}
            </Button>
          </>
        }
      >
        <form id="program-form" onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <TextInput
            label="Programme code"
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
            value={form.department_id}
            error={formErrors.department_id}
            onChange={(e) => setForm({ ...form, department_id: e.target.value })}
            options={collegeOptions}
          />
          <div className="md:col-span-2">
            <TextInput
              label="Programme name"
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
        description="Its subjects move to the college that owns the programme you choose."
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
          label="Programme"
          required
          value={assignProgramId}
          onChange={(e) => setAssignProgramId(e.target.value)}
          options={[
            { value: '', label: 'Choose a programme…' },
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
        description="Accounts assigned to this programme's college are not affected."
        confirmLabel="Delete Programme"
        destructive
        loading={isDeleting}
        blocked={Boolean(deleteBlockedReason)}
        blockedReason={deleteBlockedReason}
      />
    </div>
  );
}
