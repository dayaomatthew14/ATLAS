import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, ArrowLeft, AlertTriangle } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Dialog, { ConfirmDialog } from '../../components/ui/Dialog';
import { TextInput, NumberInput, SelectInput } from '../../components/ui/Field';
import { pluralize } from '../../components/ui/tokens';

/**
 * Curriculum — one programme, one academic year.
 *
 * Laid out the way the university's own curriculum sheets are: Year → Term,
 * each term totalling its own Lec/Lab/Units. Matching the source document means
 * an administrator checking a revision against the printed curriculum reads
 * down the same structure instead of translating between two shapes.
 *
 * Terms are trimesters (1st/2nd/3rd) — that is what every curriculum workbook
 * uses, not semesters.
 *
 * Only subjects that sit inside a year and a term appear here. A curriculum
 * sheet also prints an electives pool, unit summaries and signatories; none of
 * those are taught in a term, so none of them are curriculum for scheduling
 * purposes and the importer leaves them out.
 */

const YEARS = ['1', '2', '3', '4', '5', '6'];
const TERMS = [
  { value: '1st', label: '1st Term' },
  { value: '2nd', label: '2nd Term' },
  { value: '3rd', label: '3rd Term' },
];
const TERM_LABEL = Object.fromEntries(TERMS.map((t) => [t.value, t.label]));
const YEAR_LABEL = {
  '1': 'First Year', '2': 'Second Year', '3': 'Third Year',
  '4': 'Fourth Year', '5': 'Fifth Year', '6': 'Sixth Year',
};
const STATUS_META = {
  PUBLISHED: { label: 'Published', status: 'published' },
  DRAFT: { label: 'Draft', status: 'draft' },
  ARCHIVED: { label: 'Archived', status: 'archived' },
};

const EMPTY_SUBJECT = {
  code: '', name: '', year_level: '1', semester_term: '1st',
  lec_units: '0', lab_units: '0', units: '3', pre_requisite: '', is_major: true,
};

/** The sheets write "NONE" for no prerequisite; treat that as empty. */
const cleanPrereq = (v) => {
  const t = (v || '').trim();
  return !t || t.toUpperCase() === 'NONE' ? '' : t;
};

export default function CurriculumDetail() {
  const { blockId } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [block, setBlock] = useState(null);
  const [program, setProgram] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isChangingStatus, setIsChangingStatus] = useState(false);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_SUBJECT);
  const [formErrors, setFormErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const [blockData, collegeData, subjectData] = await Promise.all([
        api.get('/curriculum/blocks'),
        api.get('/colleges').catch(() => []),
        api.get(`/curriculum?block_id=${blockId}`).catch(() => []),
      ]);
      const found = (Array.isArray(blockData) ? blockData : [])
        .find((b) => String(b.id) === String(blockId));
      if (!found) { setLoadError('This curriculum no longer exists.'); return; }
      setBlock(found);
      const programs = (Array.isArray(collegeData) ? collegeData : [])
        .flatMap((c) => c.programs.map((p) => ({ ...p, collegeCode: c.code, collegeName: c.name })));
      setProgram(programs.find((p) => p.id === found.program_id) || null);
      setSubjects(Array.isArray(subjectData) ? subjectData : []);
    } catch (err) {
      setLoadError(err.message || 'Could not load this curriculum.');
    } finally {
      setIsLoading(false);
    }
  }, [blockId]);

  useEffect(() => { load(); }, [load]);

  /** Group into Year → Term, keeping anything unlabelled visible rather than dropped. */
  const grouped = useMemo(() => {
    const byYear = new Map();
    const unfiled = [];
    for (const s of subjects) {
      const y = String(s.year_level ?? '').trim();
      const t = String(s.semester_term ?? '').trim();
      if (!YEARS.includes(y) || !TERMS.some((x) => x.value === t)) { unfiled.push(s); continue; }
      if (!byYear.has(y)) byYear.set(y, new Map());
      const terms = byYear.get(y);
      if (!terms.has(t)) terms.set(t, []);
      terms.get(t).push(s);
    }
    const years = [...byYear.entries()]
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([year, terms]) => ({
        year,
        terms: TERMS.filter((t) => terms.has(t.value)).map((t) => ({
          term: t.value,
          subjects: [...terms.get(t.value)].sort((a, b) => (a.code || '').localeCompare(b.code || '')),
        })),
      }));
    return { years, unfiled };
  }, [subjects]);

  const totalUnits = subjects.reduce((n, s) => n + (Number(s.units) || 0), 0);
  const statusKey = (block?.status || 'PUBLISHED').toUpperCase();
  const statusMeta = STATUS_META[statusKey] || STATUS_META.PUBLISHED;

  const changeStatus = async (next) => {
    setIsChangingStatus(true);
    try {
      // This endpoint takes a form field, not JSON.
      const body = new FormData();
      body.append('status', next);
      const updated = await api.patch(`/curriculum/blocks/${blockId}/status`, body);
      setBlock(updated);
      addToast(
        next === 'PUBLISHED'
          ? 'Curriculum published. Chairs can now offer these subjects.'
          : next === 'ARCHIVED'
            ? 'Curriculum archived.'
            : 'Curriculum returned to draft.',
        'success'
      );
    } catch (err) {
      addToast(err.message || 'Could not change the status.', 'error');
    } finally {
      setIsChangingStatus(false);
    }
  };

  /* ---------------------------------------------------------------- forms */

  const openCreate = (year, term) => {
    setEditing(null);
    setForm({ ...EMPTY_SUBJECT, year_level: year || '1', semester_term: term || '1st' });
    setFormErrors({});
    setIsFormOpen(true);
  };

  const openEdit = (s) => {
    setEditing(s);
    setForm({
      code: s.code || '',
      name: s.name || '',
      year_level: YEARS.includes(String(s.year_level)) ? String(s.year_level) : '1',
      semester_term: TERMS.some((t) => t.value === s.semester_term) ? s.semester_term : '1st',
      lec_units: String(s.lec_units ?? 0),
      lab_units: String(s.lab_units ?? 0),
      units: String(s.units ?? 0),
      pre_requisite: cleanPrereq(s.pre_requisite),
      is_major: s.is_major !== false,
    });
    setFormErrors({});
    setIsFormOpen(true);
  };

  const validate = () => {
    const errors = {};
    const code = form.code.trim();
    if (!code) errors.code = 'Enter a course code.';
    else {
      const clash = subjects.find(
        (s) => (s.code || '').toUpperCase() === code.toUpperCase() && s.id !== editing?.id
      );
      if (clash) errors.code = `${clash.code} already exists in this curriculum.`;
    }
    if (!form.name.trim()) errors.name = 'Enter the course title.';
    const lec = Number(form.lec_units), lab = Number(form.lab_units), units = Number(form.units);
    if (Number.isNaN(lec) || lec < 0) errors.lec_units = 'Enter 0 or more.';
    if (Number.isNaN(lab) || lab < 0) errors.lab_units = 'Enter 0 or more.';
    if (Number.isNaN(units) || units < 0) errors.units = 'Enter 0 or more.';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setIsSaving(true);

    const lec = Number(form.lec_units), lab = Number(form.lab_units);
    const payload = {
      block_id: Number(blockId),
      department_id: program?.department_id ?? block?.department_id,
      program_code: program?.code,
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      year_level: form.year_level,
      semester_term: form.semester_term,
      lec_units: lec,
      lab_units: lab,
      units: Number(form.units),
      // The server derives `type` from the lec/lab split; this is the
      // sensible default for the case where both are zero.
      type: lab > 0 && lec === 0 ? 'lab' : 'lecture',
      pre_requisite: form.pre_requisite.trim() || null,
      is_major: form.is_major,
    };

    try {
      if (editing) {
        await api.put(`/curriculum/${editing.id}`, payload);
        addToast(`${payload.code} updated.`, 'success');
      } else {
        await api.post('/curriculum', payload);
        // A code ending in A/B is split server-side into a lecture and a lab
        // row, matching how the curriculum sheets write combined subjects.
        addToast(
          /A\/B$/i.test(payload.code)
            ? `${payload.code} added as a lecture and a laboratory subject.`
            : `${payload.code} added.`,
          'success'
        );
      }
      setIsFormOpen(false);
      load();
    } catch (err) {
      addToast(err.message || 'Could not save the subject.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await api.delete(`/curriculum/${deleteTarget.id}`);
      addToast(`${deleteTarget.code} removed.`, 'success');
      setDeleteTarget(null);
      load();
    } catch (err) {
      addToast(err.message || 'Could not remove the subject.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  /* --------------------------------------------------------------- render */

  const backLink = (
    <Link
      to="/dashboard/curriculum"
      className="inline-flex items-center gap-1.5 font-ui text-caption text-atlas-700 hover:underline
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atlas-700 rounded-sm"
    >
      <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
      All curricula
    </Link>
  );

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 flex flex-col gap-4" aria-busy="true">
        <div className="h-9 w-72 rounded-field bg-atlas-line animate-pulse motion-reduce:animate-none" />
        {[0, 1].map((i) => (
          <div key={i} className="h-48 glass rounded-panel animate-pulse motion-reduce:animate-none" />
        ))}
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-6 lg:p-8">
        <div className="mb-4">{backLink}</div>
        <div className="glass rounded-panel !border-sem-info/30 p-8 text-center">
          <p className="font-ui text-body text-atlas-ink">{loadError}</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="secondary" onClick={load}>Retry</Button>
            <Button onClick={() => navigate('/dashboard/curriculum')}>Back to Curricula</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-3">{backLink}</div>

      <header className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display text-page text-atlas-ink">
              {program?.code || block?.program_name}
            </h1>
            <Badge status={statusMeta.status} label={statusMeta.label} />
          </div>
          <p className="font-ui text-body text-atlas-slate mt-1">
            {program ? `${program.name} · ` : ''}{block?.academic_year} ·{' '}
            {pluralize(subjects.length, 'subject')} · {totalUnits} units
            {program?.collegeCode ? ` · ${program.collegeCode}` : ''}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {statusKey !== 'PUBLISHED' ? (
            <Button
              variant="secondary"
              loading={isChangingStatus}
              onClick={() => changeStatus('PUBLISHED')}
              disabled={!subjects.length}
            >
              Publish
            </Button>
          ) : (
            <Button variant="secondary" loading={isChangingStatus} onClick={() => changeStatus('DRAFT')}>
              Return to Draft
            </Button>
          )}
          <Button icon={Plus} onClick={() => openCreate()}>Add Subject</Button>
        </div>
      </header>

      {!subjects.length && (
        <div className="glass rounded-panel p-12 text-center">
          <h2 className="font-display text-section text-atlas-ink">No subjects yet.</h2>
          <p className="mt-2 font-ui text-body text-atlas-slate">
            Add the first subject for {block?.academic_year}.
          </p>
          <div className="mt-5 flex justify-center">
            <Button icon={Plus} onClick={() => openCreate()}>Add Subject</Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-6">
        {grouped.years.map(({ year, terms }) => (
          <section key={year}>
            <h2 className="flex items-center gap-3 font-ui text-micro uppercase text-atlas-slate mb-3">
              {YEAR_LABEL[year] || `Year ${year}`}
              <span className="flex-1 h-px bg-atlas-line" aria-hidden="true" />
            </h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {terms.map(({ term, subjects: rows }) => {
                const units = rows.reduce((n, s) => n + (Number(s.units) || 0), 0);
                const lec = rows.reduce((n, s) => n + (Number(s.lec_units) || 0), 0);
                const lab = rows.reduce((n, s) => n + (Number(s.lab_units) || 0), 0);
                return (
                  <div key={term} className="glass rounded-panel overflow-hidden">
                    <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/45">
                      <h3 className="font-ui text-body font-semibold text-atlas-ink">{TERM_LABEL[term]}</h3>
                      <span className="font-ui text-caption text-atlas-slate tabular-nums">
                        {rows.length} · {lec}/{lab}/<strong className="text-atlas-ink">{units}</strong>
                      </span>
                    </header>

                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <caption className="sr-only">
                          {YEAR_LABEL[year]} {TERM_LABEL[term]}, {pluralize(rows.length, 'subject')}
                        </caption>
                        <thead>
                          <tr>
                            {['Code', 'Course title', 'Lec', 'Lab', 'Units', ''].map((h, i) => (
                              <th
                                key={h || i}
                                scope="col"
                                className={`px-4 py-2 font-ui text-micro uppercase text-atlas-slate whitespace-nowrap
                                            ${i >= 2 && i <= 4 ? 'text-right' : 'text-left'}`}
                              >
                                {h || <span className="sr-only">Actions</span>}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((s) => (
                            <tr key={s.id} className="border-t border-white/45">
                              <td className="px-4 py-2 font-data text-table text-atlas-ink whitespace-nowrap">{s.code}</td>
                              <td className="px-4 py-2 font-ui text-table text-atlas-ink">
                                {s.name}
                                {cleanPrereq(s.pre_requisite) && (
                                  <span className="block font-data text-caption text-atlas-slate">
                                    needs {cleanPrereq(s.pre_requisite)}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-right font-data text-table tabular-nums text-atlas-slate">{s.lec_units ?? 0}</td>
                              <td className="px-4 py-2 text-right font-data text-table tabular-nums text-atlas-slate">{s.lab_units ?? 0}</td>
                              <td className="px-4 py-2 text-right font-data text-table tabular-nums text-atlas-ink font-semibold">{s.units}</td>
                              <td className="px-2 py-2 text-right whitespace-nowrap">
                                <span className="inline-flex gap-1">
                                  <Button size="row" variant="ghost" icon={Pencil}
                                    onClick={() => openEdit(s)} aria-label={`Edit ${s.code}`} />
                                  <Button size="row" variant="ghost" icon={Trash2}
                                    onClick={() => setDeleteTarget(s)} aria-label={`Delete ${s.code}`}
                                    className="text-sem-conflict hover:bg-sem-conflict-bg" />
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="px-4 py-2 border-t border-white/45">
                      <Button size="row" variant="ghost" icon={Plus} onClick={() => openCreate(year, term)}>
                        Add to {TERM_LABEL[term]}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {/* Subjects with no year or term. Imported sheets do not always carry
            both, and dropping them would lose real curriculum silently. */}
        {grouped.unfiled.length > 0 && (
          <section className="glass rounded-panel !border-sem-warning/40 overflow-hidden">
            <header className="flex items-start gap-3 px-4 py-3 border-b border-sem-warning/30">
              <AlertTriangle className="w-5 h-5 text-sem-warning shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <h2 className="font-ui text-body font-semibold text-atlas-ink">Not assigned to a term</h2>
                <p className="font-ui text-caption text-atlas-slate mt-0.5">
                  {pluralize(grouped.unfiled.length, 'subject')} with no year or term. Edit each one to file it.
                </p>
              </div>
            </header>
            <ul className="divide-y divide-white/45">
              {grouped.unfiled.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-2">
                  <span className="font-data text-table text-atlas-ink w-28 shrink-0 truncate">{s.code}</span>
                  <span className="font-ui text-table text-atlas-ink flex-1 min-w-0 truncate">{s.name}</span>
                  <span className="font-data text-table tabular-nums text-atlas-slate shrink-0">{s.units}u</span>
                  <Button size="row" variant="ghost" icon={Pencil}
                    onClick={() => openEdit(s)} aria-label={`Edit ${s.code}`} />
                  <Button size="row" variant="ghost" icon={Trash2}
                    onClick={() => setDeleteTarget(s)} aria-label={`Delete ${s.code}`}
                    className="text-sem-conflict hover:bg-sem-conflict-bg" />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* -------------------------------------------------------- dialogs */}

      <Dialog
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editing ? `Edit ${editing.code}` : 'Add Subject'}
        description={`${program?.code || block?.program_name} · ${block?.academic_year}`}
        dismissible={!isSaving}
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsFormOpen(false)} disabled={isSaving}>Cancel</Button>
            <Button type="submit" form="subject-form" loading={isSaving}>
              {editing ? 'Save Subject' : 'Add Subject'}
            </Button>
          </>
        }
      >
        <form id="subject-form" onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <TextInput
            label="Course code"
            required
            hint="Ending in A/B creates a lecture and a laboratory subject"
            placeholder="CC101A/B"
            value={form.code}
            error={formErrors.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
          <TextInput
            label="Prerequisite"
            hint="Leave empty for none"
            placeholder="CC102A/B"
            value={form.pre_requisite}
            onChange={(e) => setForm({ ...form, pre_requisite: e.target.value })}
          />
          <div className="md:col-span-2">
            <TextInput
              label="Course title"
              required
              placeholder="Introduction to Computing"
              value={form.name}
              error={formErrors.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <SelectInput
            label="Year level"
            required
            value={form.year_level}
            onChange={(e) => setForm({ ...form, year_level: e.target.value })}
            options={YEARS.map((y) => ({ value: y, label: YEAR_LABEL[y] }))}
          />
          <SelectInput
            label="Term"
            required
            value={form.semester_term}
            onChange={(e) => setForm({ ...form, semester_term: e.target.value })}
            options={TERMS}
          />

          <NumberInput
            label="Lecture units" min={0} max={12}
            value={form.lec_units}
            error={formErrors.lec_units}
            onChange={(e) => {
              const lec = e.target.value;
              // Total follows the split unless it has been set by hand, which
              // is how the curriculum sheets read: Lec + Lab = Units.
              setForm({ ...form, lec_units: lec, units: String((Number(lec) || 0) + (Number(form.lab_units) || 0)) });
            }}
          />
          <NumberInput
            label="Laboratory units" min={0} max={12}
            value={form.lab_units}
            error={formErrors.lab_units}
            onChange={(e) => {
              const lab = e.target.value;
              setForm({ ...form, lab_units: lab, units: String((Number(form.lec_units) || 0) + (Number(lab) || 0)) });
            }}
          />
          <NumberInput
            label="Total units" required min={0} max={24}
            hint="Follows Lec + Lab; override if the sheet differs"
            value={form.units}
            error={formErrors.units}
            onChange={(e) => setForm({ ...form, units: e.target.value })}
          />
          <SelectInput
            label="Classification"
            value={form.is_major ? 'major' : 'gened'}
            onChange={(e) => setForm({ ...form, is_major: e.target.value === 'major' })}
            options={[
              { value: 'major', label: 'Major / Professional' },
              { value: 'gened', label: 'General Education' },
            ]}
          />
        </form>
      </Dialog>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title={deleteTarget ? `Remove ${deleteTarget.code}?` : ''}
        description={
          deleteTarget
            ? `${deleteTarget.name} is removed from this curriculum. Classes already scheduled against it are retained.`
            : ''
        }
        confirmLabel="Remove Subject"
        destructive
        loading={isDeleting}
      />
    </div>
  );
}
