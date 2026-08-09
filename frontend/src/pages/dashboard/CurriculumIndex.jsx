import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, RefreshCw, Search, ChevronRight, AlertTriangle, Upload, Trash2 } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Dialog from '../../components/ui/Dialog';
import { TextInput, SelectInput } from '../../components/ui/Field';
import CurriculumImportWizard from '../../components/ui/CurriculumImportWizard';
import { DEPARTMENTS, focusRing, pluralize } from '../../components/ui/tokens';
import { canManageCurriculum } from '../../utils/session';

/**
 * Curriculum — index.
 *
 * Every curriculum the university holds, in one list, before anything is
 * edited. The previous version opened straight into an editor behind two
 * dropdowns, which answered "edit this one" but never "what do we have?" — the
 * question an administrator maintaining a catalog actually starts from.
 *
 * Programmes with no curriculum are listed too. A catalog that shows only what
 * exists hides the gaps, and the gaps are the work.
 */

const STATUS_META = {
  PUBLISHED: { label: 'Published', status: 'published' },
  DRAFT: { label: 'Draft', status: 'draft' },
  ARCHIVED: { label: 'Archived', status: 'archived' },
};

const collegeHue = (code) => DEPARTMENTS[code]?.hue || 'var(--dept-unregistered)';

/** "AY 2026-2027" and "2026-2027" both sort and compare on the year alone. */
const ayKey = (s) => {
  const m = String(s || '').match(/(\d{4})/);
  return m ? Number(m[1]) : 0;
};

export default function CurriculumIndex() {
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [colleges, setColleges] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [search, setSearch] = useState('');
  const [collegeFilter, setCollegeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Import runs in two parts: choose what is being imported, then the wizard
  // reads the workbook. Binding the programme up front is what keeps the
  // result attached to a programme instead of arriving as orphaned data.
  const [isImportSetupOpen, setIsImportSetupOpen] = useState(false);
  const [importForm, setImportForm] = useState({ program_id: '', academic_year: '' });
  const [importErrors, setImportErrors] = useState({});
  const [importTarget, setImportTarget] = useState(null);

  const [isNewOpen, setIsNewOpen] = useState(false);
  const [newForm, setNewForm] = useState({ program_id: '', academic_year: '' });
  const [newErrors, setNewErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  // Deleting a curriculum takes every subject in it, so the confirmation names
  // the count rather than asking "are you sure?" about an unnamed quantity.
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // What else the cascade would destroy. Fetched when the dialog opens rather
  // than carried on the card, because a chair can assign subjects between a
  // page load and a delete.
  const [impact, setImpact] = useState(null);
  const [impactError, setImpactError] = useState('');

  const canDelete = canManageCurriculum();

  const openDelete = async (curriculum) => {
    setDeleteTarget(curriculum);
    setImpact(null);
    setImpactError('');
    try {
      setImpact(await api.get(`/curriculum/block/${curriculum.id}/impact`));
    } catch (err) {
      setImpactError(err.message || 'Could not check what this would affect.');
    }
  };

  const closeDelete = () => {
    setDeleteTarget(null);
    setImpact(null);
    setImpactError('');
  };

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const [collegeData, blockData] = await Promise.all([
        api.get('/colleges'),
        api.get('/curriculum/blocks').catch(() => []),
      ]);
      setColleges(Array.isArray(collegeData) ? collegeData : []);
      setBlocks(Array.isArray(blockData) ? blockData : []);
    } catch (err) {
      setLoadError(err.message || 'Could not load the curriculum catalog.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const programs = useMemo(
    () => colleges.flatMap((c) =>
      c.programs.map((p) => ({ ...p, collegeCode: c.code, collegeName: c.name }))
    ),
    [colleges]
  );

  /** Every curriculum, joined to the programme and college it belongs to. */
  const curricula = useMemo(() => {
    const byProgram = new Map(programs.map((p) => [p.id, p]));
    return blocks.map((b) => {
      const p = byProgram.get(b.program_id) || null;
      return {
        ...b,
        statusKey: (b.status || 'PUBLISHED').toUpperCase(),
        program: p,
        programCode: p?.code || '—',
        programName: p?.name || b.program_name,
        collegeCode: p?.collegeCode || null,
        collegeName: p?.collegeName || null,
      };
    });
  }, [blocks, programs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return curricula
      .filter((c) => {
        const matchesSearch = !q
          || c.programCode.toLowerCase().includes(q)
          || (c.programName || '').toLowerCase().includes(q)
          || (c.academic_year || '').toLowerCase().includes(q)
          || (c.collegeCode || '').toLowerCase().includes(q);
        const matchesCollege = collegeFilter === 'all' || c.collegeCode === collegeFilter;
        const matchesStatus = statusFilter === 'all' || c.statusKey === statusFilter;
        return matchesSearch && matchesCollege && matchesStatus;
      })
      .sort((a, b) =>
        (a.collegeCode || 'zz').localeCompare(b.collegeCode || 'zz')
        || a.programCode.localeCompare(b.programCode)
        || ayKey(b.academic_year) - ayKey(a.academic_year)
      );
  }, [curricula, search, collegeFilter, statusFilter]);

  /** Grouped by college so the catalog reads the way the institution is organised. */
  const grouped = useMemo(() => {
    const map = new Map();
    for (const c of filtered) {
      const key = c.collegeCode || 'Unassigned';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    }
    return [...map.entries()];
  }, [filtered]);

  const withoutCurriculum = useMemo(
    () => programs.filter((p) => !blocks.some((b) => b.program_id === p.id)),
    [programs, blocks]
  );

  const isFiltered = search.trim() !== '' || collegeFilter !== 'all' || statusFilter !== 'all';
  const clearFilters = () => { setSearch(''); setCollegeFilter('all'); setStatusFilter('all'); };

  const openImport = (programId) => {
    setImportForm({ program_id: programId ? String(programId) : '', academic_year: '' });
    setImportErrors({});
    setIsImportSetupOpen(true);
  };

  const startImport = (e) => {
    e.preventDefault();
    const errors = {};
    const p = programs.find((x) => String(x.id) === String(importForm.program_id));
    const ay = importForm.academic_year.trim();
    if (!p) errors.program_id = 'Choose a programme.';
    if (!/^\d{4}-\d{4}$/.test(ay)) errors.academic_year = 'Use the format 2026-2027.';
    else if (p && blocks.some((b) => b.program_id === p.id && (b.academic_year || '').includes(ay))) {
      errors.academic_year = `${p.code} already has a ${ay} curriculum. Delete it first, or import a different year.`;
    }
    setImportErrors(errors);
    if (Object.keys(errors).length) return;
    setIsImportSetupOpen(false);
    setImportTarget({ program: p, academicYear: `AY ${ay}` });
  };

  const openNew = (programId) => {
    setNewForm({ program_id: programId ? String(programId) : '', academic_year: '' });
    setNewErrors({});
    setIsNewOpen(true);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const errors = {};
    const program = programs.find((p) => String(p.id) === String(newForm.program_id));
    const ay = newForm.academic_year.trim();
    if (!program) errors.program_id = 'Choose a programme.';
    if (!/^\d{4}-\d{4}$/.test(ay)) errors.academic_year = 'Use the format 2026-2027.';
    else {
      const [from, to] = ay.split('-').map(Number);
      if (to !== from + 1) errors.academic_year = 'The second year must follow the first.';
      else if (program && blocks.some((b) => b.program_id === program.id && (b.academic_year || '').includes(ay))) {
        errors.academic_year = `${program.code} already has a ${ay} curriculum.`;
      }
    }
    setNewErrors(errors);
    if (Object.keys(errors).length) return;

    setIsSaving(true);
    try {
      const created = await api.post('/curriculum/blocks', {
        program_name: program.name,
        academic_year: `AY ${ay}`,
        program_id: program.id,
        department_id: program.department_id,
        status: 'DRAFT',
      });
      addToast(`${program.code} AY ${ay} created as a draft.`, 'success');
      setIsNewOpen(false);
      // Straight into the new curriculum — it is empty, and adding subjects is
      // the only reason to have created it.
      if (created?.id) navigate(`/dashboard/curriculum/${created.id}`);
      else load();
    } catch (err) {
      addToast(err.message || 'Could not create the curriculum.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await api.delete(`/curriculum/block/${deleteTarget.id}`);
      const n = deleteTarget.subject_count || 0;
      addToast(
        n
          ? `Deleted ${deleteTarget.programCode} ${deleteTarget.academic_year} and its ${pluralize(n, 'subject')}.`
          : `Deleted ${deleteTarget.programCode} ${deleteTarget.academic_year}.`,
        'success'
      );
      closeDelete();
      load();
    } catch (err) {
      addToast(err.message || 'Could not delete the curriculum.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const totalSubjects = curricula.reduce((n, c) => n + (c.subject_count || 0), 0);

  return (
    <div className="p-6 lg:p-8">
      <header className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="font-display text-page text-atlas-ink">Curriculum</h1>
          <p className="font-ui text-body text-atlas-slate mt-1">
            {isLoading
              ? 'Loading the curriculum catalog…'
              : `${pluralize(curricula.length, 'curriculum', 'curricula')} · ${pluralize(totalSubjects, 'subject')} · ${withoutCurriculum.length} programme${withoutCurriculum.length === 1 ? '' : 's'} without one`}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="secondary" icon={RefreshCw} onClick={load}>Refresh</Button>
          <Button variant="secondary" icon={Upload} onClick={openImport} disabled={!programs.length}>
            Import Excel
          </Button>
          <Button icon={Plus} onClick={() => openNew()} disabled={!programs.length}>
            New Curriculum
          </Button>
        </div>
      </header>

      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="relative flex-1 min-w-0">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-atlas-slate pointer-events-none"
            aria-hidden="true"
          />
          <label htmlFor="curriculum-search" className="sr-only">Search curricula</label>
          <input
            id="curriculum-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search programme, college, or academic year"
            className={`w-full h-10 pl-9 pr-3 rounded-field font-ui text-body text-atlas-ink
                        bg-white/70 backdrop-blur-sm border border-atlas-control placeholder:text-atlas-disabled
                        hover:border-atlas-slate transition-colors duration-state ease-standard ${focusRing}`}
          />
        </div>
        <div className="flex gap-3">
          <SelectInput
            label="College"
            className="w-48"
            value={collegeFilter}
            onChange={(e) => setCollegeFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All colleges' },
              ...colleges.map((c) => ({ value: c.code, label: c.code })),
            ]}
          />
          <SelectInput
            label="Status"
            className="w-40"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All statuses' },
              { value: 'PUBLISHED', label: 'Published' },
              { value: 'DRAFT', label: 'Draft' },
              { value: 'ARCHIVED', label: 'Archived' },
            ]}
          />
        </div>
      </div>

      {loadError && (
        <div className="glass rounded-panel !border-sem-info/30 p-6 text-center mb-6">
          <p className="font-ui text-body text-atlas-ink">{loadError}</p>
          <div className="mt-3 flex justify-center">
            <Button variant="secondary" onClick={load}>Retry</Button>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex flex-col gap-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 glass rounded-panel animate-pulse motion-reduce:animate-none" />
          ))}
          <span className="sr-only">Loading…</span>
        </div>
      )}

      {!isLoading && !filtered.length && (
        <div className="glass rounded-panel p-12 text-center">
          <h2 className="font-display text-section text-atlas-ink">
            {isFiltered ? 'No curricula match your filters.' : 'No curricula yet.'}
          </h2>
          <p className="mt-2 font-ui text-body text-atlas-slate">
            {isFiltered
              ? 'Clear the filters or widen your search.'
              : 'Create one for a programme, or import it from an Excel file.'}
          </p>
          <div className="mt-5 flex justify-center">
            {isFiltered
              ? <Button variant="secondary" onClick={clearFilters}>Clear Filters</Button>
              : <Button icon={Plus} onClick={() => openNew()}>New Curriculum</Button>}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-6">
        {grouped.map(([code, list]) => (
          <section key={code}>
            <h2 className="flex items-center gap-3 mb-3">
              {/* The hue never appears without its college code beside it. */}
              <span
                aria-hidden="true"
                className="inline-block w-[3px] h-4 rounded-sm shrink-0"
                style={{ backgroundColor: collegeHue(code) }}
              />
              <span className="font-data text-table font-semibold text-atlas-ink">{code}</span>
              <span className="font-ui text-caption text-atlas-slate truncate">
                {list[0]?.collegeName || 'Not linked to a college'}
              </span>
              <span className="flex-1 h-px bg-atlas-line" aria-hidden="true" />
            </h2>

            <ul className="grid gap-3 lg:grid-cols-2">
              {list.map((c) => {
                const meta = STATUS_META[c.statusKey] || STATUS_META.PUBLISHED;
                // The delete control is a sibling of the Link, not a child: a
                // button inside an anchor is invalid, and every click on it
                // would also navigate. The Link keeps right padding so the
                // chevron clears the button sitting over it.
                return (
                  <li key={c.id} className="relative">
                    <Link
                      to={`/dashboard/curriculum/${c.id}`}
                      className={`glass rounded-panel px-5 py-4 pr-16 flex items-center gap-4 group
                                  transition-colors duration-state ease-standard hover:bg-white/85 ${focusRing}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 flex-wrap">
                          <span className="font-data text-table font-semibold text-atlas-ink">
                            {c.programCode}
                          </span>
                          <Badge status={meta.status} label={meta.label} />
                        </span>
                        <span className="block font-ui text-body text-atlas-ink mt-0.5 truncate">
                          {c.programName}
                        </span>
                        <span className="block font-ui text-caption text-atlas-slate mt-0.5 tabular-nums">
                          {c.academic_year} · {pluralize(c.subject_count || 0, 'subject')} · {c.total_units || 0} units
                        </span>
                      </span>
                      <ChevronRight
                        className="w-4 h-4 text-atlas-slate shrink-0 transition-transform duration-state
                                   ease-standard group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </Link>
                    {/* Hidden rather than shown restricted, matching how the
                        faculty table drops its row actions: a padlock on every
                        card in a grid is noise, and the catalog is readable to
                        roles that will never delete from it. */}
                    {canDelete && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Button
                          size="row"
                          variant="ghost"
                          icon={Trash2}
                          onClick={() => openDelete(c)}
                          aria-label={`Delete the ${c.programCode} ${c.academic_year} curriculum`}
                          className="text-sem-conflict hover:bg-sem-conflict-bg"
                        />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {/* The gaps. Shown whenever the catalog is not being filtered, because
            a programme with no curriculum cannot be scheduled at all. */}
        {!isLoading && !isFiltered && withoutCurriculum.length > 0 && (
          <section className="glass rounded-panel !border-sem-warning/40 overflow-hidden">
            <header className="flex items-start gap-3 px-5 py-4 border-b border-sem-warning/30">
              <AlertTriangle className="w-5 h-5 text-sem-warning shrink-0 mt-0.5" aria-hidden="true" />
              <div className="min-w-0">
                <h2 className="font-ui text-body font-semibold text-atlas-ink">
                  Programmes without a curriculum ({withoutCurriculum.length})
                </h2>
                <p className="font-ui text-caption text-atlas-slate mt-0.5">
                  No subjects can be offered or scheduled for these until one exists.
                </p>
              </div>
            </header>
            <ul className="divide-y divide-white/45">
              {withoutCurriculum.map((p) => (
                <li key={p.id} className="flex items-center gap-4 px-5 py-3">
                  <span className="font-data text-table text-atlas-slate w-16 shrink-0">{p.collegeCode}</span>
                  <span className="font-data text-table text-atlas-ink w-20 shrink-0">{p.code}</span>
                  <span className="font-ui text-body text-atlas-ink flex-1 min-w-0 truncate">{p.name}</span>
                  <span className="flex gap-1 shrink-0">
                    <Button size="row" variant="ghost" icon={Upload} onClick={() => openImport(p.id)}>
                      Import
                    </Button>
                    <Button size="row" variant="secondary" icon={Plus} onClick={() => openNew(p.id)}>
                      Create
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <Dialog
        isOpen={isImportSetupOpen}
        onClose={() => setIsImportSetupOpen(false)}
        title="Import Curriculum from Excel"
        description="Choose what this workbook is for. The next step reads the file and shows you every subject before anything is saved."
        size="confirm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsImportSetupOpen(false)}>Cancel</Button>
            <Button type="submit" form="import-setup-form">Choose File</Button>
          </>
        }
      >
        <form id="import-setup-form" onSubmit={startImport} className="flex flex-col gap-5">
          <SelectInput
            label="Programme"
            required
            value={importForm.program_id}
            error={importErrors.program_id}
            onChange={(e) => setImportForm({ ...importForm, program_id: e.target.value })}
            options={[
              { value: '', label: 'Choose a programme…' },
              ...colleges.map((c) => ({
                group: `${c.code} — ${c.name}`,
                options: c.programs.map((p) => ({ value: String(p.id), label: `${p.code} · ${p.name}` })),
              })),
            ]}
          />
          <TextInput
            label="Academic year"
            required
            placeholder="2026-2027"
            hint="The year this curriculum takes effect"
            value={importForm.academic_year}
            error={importErrors.academic_year}
            onChange={(e) => setImportForm({ ...importForm, academic_year: e.target.value })}
          />
        </form>
      </Dialog>

      <CurriculumImportWizard
        isOpen={Boolean(importTarget)}
        onClose={() => setImportTarget(null)}
        program={importTarget?.program || null}
        academicYear={importTarget?.academicYear || ''}
        departmentId={importTarget?.program?.department_id}
        onImported={(res) => {
          const n = res?.summary?.valid_new_items ?? res?.imported_count ?? 0;
          addToast(`Imported ${pluralize(n, 'subject')} into ${importTarget?.program?.code}.`, 'success');
          setImportTarget(null);
          // Straight into the curriculum that was just imported.
          if (res?.block_id) navigate(`/dashboard/curriculum/${res.block_id}`);
          else load();
        }}
      />

      <Dialog
        isOpen={Boolean(deleteTarget)}
        onClose={closeDelete}
        title="Delete this curriculum?"
        size="confirm"
        dismissible={!isDeleting}
        footer={
          <>
            <Button variant="ghost" onClick={closeDelete} disabled={isDeleting}>
              Cancel
            </Button>
            {/* Held until the impact is known. The cascade destroys plotted
                classes and faculty assignments, and an administrator must not
                be able to confirm that before being told how much of it there
                is. */}
            <Button
              variant="destructive"
              onClick={handleDelete}
              loading={isDeleting}
              disabled={!impact && !impactError}
            >
              {impact?.schedule_count || impact?.offering_count
                ? 'Delete Anyway'
                : 'Delete Curriculum'}
            </Button>
          </>
        }
      >
        {deleteTarget && (
          <div className="flex flex-col gap-3">
            <p className="font-ui text-body text-atlas-ink">
              <span className="font-data font-semibold">{deleteTarget.programCode}</span>{' '}
              {deleteTarget.academic_year} — {deleteTarget.programName}
            </p>
            {/* An empty curriculum has nothing to warn about losing, and
                "all 0 subjects" reads as a bug rather than as reassurance. */}
            <p className="font-ui text-body text-atlas-slate">
              {deleteTarget.subject_count ? (
                <>
                  This removes the curriculum and{' '}
                  <span className="text-atlas-ink">
                    all {pluralize(deleteTarget.subject_count, 'subject')}
                  </span>{' '}
                  in it. It cannot be undone.
                </>
              ) : (
                <>This curriculum has no subjects in it yet. It cannot be undone.</>
              )}
            </p>

            {!impact && !impactError && (
              <p className="font-ui text-caption text-atlas-slate" aria-busy="true">
                Checking what else this would affect…
              </p>
            )}

            {impactError && (
              <p className="font-ui text-caption text-sem-warning">
                {impactError} Deleting without that check could remove faculty
                assignments and plotted classes you have not been shown.
              </p>
            )}

            {/* The cascade. `schedules.curriculum_id` and
                `subject_offerings.curriculum_id` are both ondelete=CASCADE, so
                these go whether or not anyone intended it. */}
            {impact && (impact.offering_count > 0 || impact.schedule_count > 0) && (
              <div className="rounded-panel border border-sem-warning/40 bg-sem-warning-bg/50 px-4 py-3">
                <p className="font-ui text-body text-atlas-ink">
                  This also deletes work that depends on it:
                </p>
                <ul className="mt-2 flex flex-col gap-1">
                  {impact.offering_count > 0 && (
                    <li className="font-ui text-caption text-atlas-ink tabular-nums">
                      {pluralize(impact.offering_count, 'faculty assignment')}
                    </li>
                  )}
                  {impact.schedule_count > 0 && (
                    <li className="font-ui text-caption text-atlas-ink tabular-nums">
                      {pluralize(impact.schedule_count, 'plotted class', 'plotted classes')} on the timetable
                    </li>
                  )}
                  {impact.faculty_count > 0 && (
                    <li className="font-ui text-caption text-atlas-slate tabular-nums">
                      affecting {pluralize(impact.faculty_count, 'faculty member')}
                    </li>
                  )}
                </ul>
                <p className="mt-2 font-ui text-caption text-atlas-slate">
                  Their teaching load will drop by the hours those classes carried.
                </p>
              </div>
            )}

            {/* A published curriculum is the one chairs are already assigning
                from, so deleting it is a different act from discarding a draft
                nobody has seen. */}
            {deleteTarget.statusKey === 'PUBLISHED'
              && impact
              && impact.offering_count === 0
              && impact.schedule_count === 0 && (
              <p className="font-ui text-caption text-sem-warning">
                This curriculum is published, so chairs can see it — but nothing
                has been assigned or plotted from it yet.
              </p>
            )}
          </div>
        )}
      </Dialog>

      <Dialog
        isOpen={isNewOpen}
        onClose={() => setIsNewOpen(false)}
        title="New Curriculum"
        description="Created as a draft, so it stays out of sight of chairs until you publish it."
        size="confirm"
        dismissible={!isSaving}
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsNewOpen(false)} disabled={isSaving}>Cancel</Button>
            <Button type="submit" form="new-curriculum-form" loading={isSaving}>Create</Button>
          </>
        }
      >
        <form id="new-curriculum-form" onSubmit={handleCreate} className="flex flex-col gap-5">
          <SelectInput
            label="Programme"
            required
            value={newForm.program_id}
            error={newErrors.program_id}
            onChange={(e) => setNewForm({ ...newForm, program_id: e.target.value })}
            options={[
              { value: '', label: 'Choose a programme…' },
              ...colleges.map((c) => ({
                group: `${c.code} — ${c.name}`,
                options: c.programs.map((p) => ({ value: String(p.id), label: `${p.code} · ${p.name}` })),
              })),
            ]}
          />
          <TextInput
            label="Academic year"
            required
            placeholder="2026-2027"
            hint="Two consecutive years"
            value={newForm.academic_year}
            error={newErrors.academic_year}
            onChange={(e) => setNewForm({ ...newForm, academic_year: e.target.value })}
          />
        </form>
      </Dialog>
    </div>
  );
}
