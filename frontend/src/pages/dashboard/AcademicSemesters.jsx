import { useState, useEffect, useMemo } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';
import Button from '../../components/ui/Button';
import DataTable from '../../components/ui/DataTable';
import RowMenu from '../../components/ui/RowMenu';
import Dialog, { ConfirmDialog } from '../../components/ui/Dialog';
import { TextInput, SelectInput } from '../../components/ui/Field';
import Badge from '../../components/ui/Badge';
import { pluralize } from '../../components/ui/tokens';

/**
 * Terms. Phase 2 Screen 7.
 *
 * Carried the same Blocker as Users (HEU-01): the component declared
 * ({ addToast }) but App.jsx renders it without props, so every action was
 * silent. It also imported Edit3, held `editingSemester` state, and had a full
 * edit branch in handleSubmit -- with no edit control rendered anywhere
 * (HEU-07). Terms could only be created and deleted.
 */

/**
 * Semester.term is stored as '1st' | '2nd' | '3rd semester'. The third value is
 * inconsistent with the other two, and the create endpoint additionally accepts
 * the long forms and maps them. Both directions are normalised here so the
 * inconsistency stays in one place instead of leaking into the interface.
 */
const TERM_TO_LABEL = { '1st': '1st Term', '2nd': '2nd Term', '3rd semester': 'Midyear' };
const TERM_OPTIONS = [
  { value: '1st Semester', label: '1st Term' },
  { value: '2nd Semester', label: '2nd Term' },
  { value: '3rd Semester', label: 'Midyear' },
];
const termLabel = (t) => TERM_TO_LABEL[t] || t || '—';

export default function AcademicSemesters() {
  const { addToast } = useToast();

  const [semesters, setSemesters] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ academic_year: '', term: '1st Semester' });
  const [formErrors, setFormErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  const [activateTarget, setActivateTarget] = useState(null);
  const [isActivating, setIsActivating] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBlockedReason, setDeleteBlockedReason] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchSemesters = async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await api.get('/semesters');
      setSemesters(Array.isArray(data) ? data : []);
    } catch (err) {
      setSemesters([]);
      setLoadError('Could not load academic terms.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Tell the shell to re-read the active term. Without this the context bar
   * kept displaying the previous term after an admin switched it — the exact
   * "working in the wrong term" failure that bar exists to prevent (IA-01).
   */
  const notifyTermChanged = () => window.dispatchEvent(new Event('atlas_term_changed'));

  useEffect(() => { fetchSemesters(); }, []);

  const activeTerm = useMemo(() => semesters.find((s) => s.is_active), [semesters]);

  const openCreate = () => {
    setEditing(null);
    const year = new Date().getFullYear();
    setForm({ academic_year: `${year}-${year + 1}`, term: '1st Semester' });
    setFormErrors({});
    setIsFormOpen(true);
  };

  // HEU-07: this control never existed, though the code behind it did.
  const openEdit = (sem) => {
    setEditing(sem);
    setForm({
      academic_year: sem.academic_year || '',
      term: TERM_OPTIONS.find((o) => TERM_TO_LABEL[sem.term] === o.label)?.value || '1st Semester',
    });
    setFormErrors({});
    setIsFormOpen(true);
  };

  const validate = () => {
    const errors = {};
    if (!/^\d{4}-\d{4}$/.test(form.academic_year.trim())) {
      errors.academic_year = 'Use the format 2026-2027.';
    } else {
      const [from, to] = form.academic_year.split('-').map(Number);
      if (to !== from + 1) errors.academic_year = 'The second year must follow the first, as in 2026-2027.';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setIsSaving(true);
    const payload = { academic_year: form.academic_year.trim(), term: form.term };
    try {
      if (editing) {
        await api.put(`/semesters/${editing.id}`, payload);
        addToast(`${payload.academic_year} updated.`, 'success');
      } else {
        await api.post('/semesters', payload);
        addToast(`${payload.academic_year} added.`, 'success');
      }
      setIsFormOpen(false);
      fetchSemesters();
      // Renaming the active term changes what the context bar should read.
      if (editing?.is_active) notifyTermChanged();
    } catch (err) {
      addToast(err.message || 'Could not save the term.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmActivate = async () => {
    if (!activateTarget) return;
    setIsActivating(true);
    try {
      await api.put(`/semesters/${activateTarget.id}`, { is_active: true });
      addToast(
        `${activateTarget.academic_year} ${termLabel(activateTarget.term)} is now the active term.`,
        'success'
      );
      setActivateTarget(null);
      fetchSemesters();
      notifyTermChanged();
    } catch (err) {
      addToast(err.message || 'Could not change the active term.', 'error');
    } finally {
      setIsActivating(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await api.delete(`/semesters/${deleteTarget.id}`);
      addToast(`${deleteTarget.academic_year} ${termLabel(deleteTarget.term)} deleted.`, 'success');
      setDeleteTarget(null);
      fetchSemesters();
    } catch (err) {
      // 409 means the term still holds classes, or is the active one. Both are
      // refusals with a reason, not failures.
      if (err.status === 409) setDeleteBlockedReason(err.message);
      else addToast(err.message || 'Could not delete the term.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const columns = [
    { key: 'academic_year', label: 'Academic year', render: (s) => <span className="font-data">{s.academic_year}</span> },
    { key: 'term', label: 'Term', render: (s) => termLabel(s.term) },
    {
      key: 'is_active',
      label: 'Status',
      render: (s) =>
        s.is_active
          ? <Badge status="approved" label="Active" />
          : <Badge status="draft" label="Inactive" />,
    },
  ];

  const rowActions = (s) => (
    <RowMenu
      label={`Actions for ${s.academic_year} ${termLabel(s.term)}`}
      items={[
        { label: 'Edit term', onSelect: () => openEdit(s) },
        {
          label: 'Set as active term',
          onSelect: () => setActivateTarget(s),
          disabled: s.is_active,
          disabledReason: 'This is already the active term.',
        },
        {
          label: 'Delete term',
          destructive: true,
          onSelect: () => { setDeleteTarget(s); setDeleteBlockedReason(''); },
          disabled: s.is_active,
          disabledReason: 'Activate a different term before deleting this one.',
        },
      ]}
    />
  );

  return (
    <div className="p-6 lg:p-8">
      <header className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="font-display text-page text-atlas-ink">Terms</h1>
          <p className="font-ui text-body text-atlas-slate mt-1">
            {activeTerm
              ? `Active: ${activeTerm.academic_year} ${termLabel(activeTerm.term)} · every department generates and publishes against this term`
              : 'No active term. Schedules cannot be generated until one is set.'}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="secondary" icon={RefreshCw} onClick={fetchSemesters}>Refresh</Button>
          <Button icon={Plus} onClick={openCreate}>Add Term</Button>
        </div>
      </header>

      <DataTable
        caption={`Academic terms, ${pluralize(semesters.length, "result")}`}
        columns={columns}
        rows={semesters}
        isLoading={isLoading}
        error={loadError}
        onRetry={fetchSemesters}
        selectedId={activeTerm?.id}
        emptyTitle="No academic terms."
        emptyBody="Add a term before building any schedule."
        emptyAction={<Button icon={Plus} onClick={openCreate}>Add Term</Button>}
        rowActions={rowActions}
      />

      <Dialog
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editing ? `Edit ${editing.academic_year} ${termLabel(editing.term)}` : 'Add Term'}
        size="confirm"
        dismissible={!isSaving}
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsFormOpen(false)} disabled={isSaving}>Cancel</Button>
            <Button type="submit" form="term-form" loading={isSaving}>
              {editing ? 'Save Term' : 'Add Term'}
            </Button>
          </>
        }
      >
        <form id="term-form" onSubmit={handleSubmit} className="flex flex-col gap-5">
          <TextInput
            label="Academic year"
            required
            placeholder="2026-2027"
            hint="Two consecutive years, as in 2026-2027"
            value={form.academic_year}
            error={formErrors.academic_year}
            onChange={(e) => setForm({ ...form, academic_year: e.target.value })}
          />
          <SelectInput
            label="Term"
            required
            value={form.term}
            onChange={(e) => setForm({ ...form, term: e.target.value })}
            options={TERM_OPTIONS}
          />
        </form>
      </Dialog>

      {/* Activating a term is global. It is a confirmed action that names what
          it changes, rather than a one-click link (A11Y-07). */}
      <ConfirmDialog
        isOpen={Boolean(activateTarget)}
        onClose={() => setActivateTarget(null)}
        onConfirm={confirmActivate}
        title={
          activateTarget
            ? `Make ${activateTarget.academic_year} ${termLabel(activateTarget.term)} the active term?`
            : ''
        }
        description={
          activeTerm
            ? `All departments will generate and publish against it. ${activeTerm.academic_year} ${termLabel(activeTerm.term)} becomes inactive; its schedules are retained.`
            : 'All departments will generate and publish against it.'
        }
        confirmLabel="Set Active"
        loading={isActivating}
      />

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => { setDeleteTarget(null); setDeleteBlockedReason(''); }}
        onConfirm={confirmDelete}
        title={
          deleteBlockedReason
            ? `${deleteTarget?.academic_year} ${termLabel(deleteTarget?.term)} cannot be deleted`
            : `Delete ${deleteTarget?.academic_year} ${termLabel(deleteTarget?.term)}?`
        }
        description="A term that still holds classes or subject assignments cannot be deleted."
        confirmLabel="Delete Term"
        destructive
        loading={isDeleting}
        blocked={Boolean(deleteBlockedReason)}
        blockedReason={deleteBlockedReason}
      />
    </div>
  );
}
