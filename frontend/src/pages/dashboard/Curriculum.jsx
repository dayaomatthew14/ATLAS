import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeft, BookOpen, ChevronRight, Search, RefreshCw, AlertCircle, Lock } from 'lucide-react';
import { api } from '../../utils/api';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { focusRing, pluralize, resolveDepartment } from '../../components/ui/tokens';
import { getDepartment } from '../../utils/session';

/**
 * Curriculum — departmental read view.
 *
 * The sibling of CurriculumIndex/CurriculumDetail, which are the administrator's
 * editing surface. This screen shows a chair or coordinator the curricula the
 * administrator has published for their own college, and nothing else.
 *
 * It is read-only by construction rather than by permission check. The previous
 * version rendered the full editing surface — Create Curriculum, Import Excel,
 * Add Subject, per-row edit and delete, a status dropdown, a delete-curriculum
 * button — because `canManageCurriculum()` returned true for every role. Every
 * one of those controls 403'd at the backend, so the screen offered a chair six
 * ways to fail. There is no mutation code left in this file to gate: it holds
 * two GETs and a table.
 *
 * Scope is the backend's: GET /curriculum/blocks returns only PUBLISHED blocks
 * belonging to the signed-in user's college, and GET /curriculum filters
 * subjects by that same college. The header names the college so the scoping is
 * something the user can see rather than something they have to trust.
 */

const YEAR_LABEL = {
  '1': 'First Year', '2': 'Second Year', '3': 'Third Year',
  '4': 'Fourth Year', '5': 'Fifth Year', '6': 'Sixth Year',
};

const TERM_LABEL = { '1st': '1st Term', '2nd': '2nd Term', '3rd': '3rd Term' };
const TERM_ORDER = ['1st', '2nd', '3rd'];

/**
 * The importer writes the third term as either '3rd' or '3rd semester'
 * depending on how the workbook spelled it, so both must land in one group.
 */
const termKey = (value) => {
  const s = String(value ?? '').trim().toLowerCase();
  if (s.startsWith('1')) return '1st';
  if (s.startsWith('2')) return '2nd';
  if (s.startsWith('3')) return '3rd';
  return '';
};

const yearKey = (value) => {
  const s = String(value ?? '').trim();
  return YEAR_LABEL[s] ? s : '';
};

/** The sheets write "NONE" for no prerequisite; treat that as empty. */
const cleanPrereq = (v) => {
  const t = String(v || '').trim();
  return !t || t.toUpperCase() === 'NONE' ? '' : t;
};

const sumBy = (rows, field) => rows.reduce((n, r) => n + (Number(r[field]) || 0), 0);

function Curriculum() {
  const departmentCode = getDepartment();
  const college = resolveDepartment(departmentCode);

  const [blocks, setBlocks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [selected, setSelected] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(false);
  const [subjectError, setSubjectError] = useState('');
  const [search, setSearch] = useState('');

  const loadBlocks = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await api.get('/curriculum/blocks');
      setBlocks(Array.isArray(data) ? data : []);
    } catch (err) {
      setLoadError(err.message || 'Could not load the curriculum for your college.');
      setBlocks([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadBlocks(); }, [loadBlocks]);

  const loadSubjects = useCallback(async (block) => {
    if (!block?.id) return;
    setIsLoadingSubjects(true);
    setSubjectError('');
    try {
      const data = await api.get(`/curriculum?block_id=${block.id}`);
      setSubjects(Array.isArray(data) ? data : []);
    } catch (err) {
      setSubjectError(err.message || 'Could not load the subjects in this curriculum.');
      setSubjects([]);
    } finally {
      setIsLoadingSubjects(false);
    }
  }, []);

  const openBlock = (block) => {
    setSelected(block);
    setSearch('');
    setSubjects([]);
    loadSubjects(block);
  };

  const closeBlock = () => {
    setSelected(null);
    setSubjects([]);
    setSubjectError('');
    setSearch('');
  };

  const matching = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return subjects;
    return subjects.filter((s) =>
      String(s.code || '').toLowerCase().includes(q)
      || String(s.name || '').toLowerCase().includes(q)
      || String(s.pre_requisite || '').toLowerCase().includes(q)
    );
  }, [subjects, search]);

  /** Year → Term, the shape the university's own curriculum sheets are printed in. */
  const grouped = useMemo(() => {
    const byYear = new Map();
    const unfiled = [];
    for (const s of matching) {
      const y = yearKey(s.year_level);
      const t = termKey(s.semester_term);
      if (!y || !t) { unfiled.push(s); continue; }
      if (!byYear.has(y)) byYear.set(y, new Map());
      const terms = byYear.get(y);
      if (!terms.has(t)) terms.set(t, []);
      terms.get(t).push(s);
    }
    const years = [...byYear.entries()]
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([year, terms]) => ({
        year,
        terms: TERM_ORDER.filter((t) => terms.has(t)).map((t) => ({
          term: t,
          rows: [...terms.get(t)].sort((a, b) =>
            String(a.code || '').localeCompare(String(b.code || ''))
          ),
        })),
      }));
    return { years, unfiled };
  }, [matching]);

  const totalUnits = sumBy(subjects, 'units');
  const isFiltered = search.trim() !== '';

  /* ------------------------------------------------------------------ chrome */

  const readOnlyNote = (
    <span className="inline-flex items-center gap-1.5 font-ui text-caption text-atlas-slate">
      <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      Read-only — maintained by the system administrator
    </span>
  );

  const loadingSkeleton = (rows) => (
    <div className="flex flex-col gap-3" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-24 glass rounded-panel animate-pulse motion-reduce:animate-none" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );

  const errorPanel = (message, onRetry) => (
    <div className="glass rounded-panel !border-sem-info/30 p-8 text-center">
      <p className="font-ui text-body text-atlas-ink">{message}</p>
      <div className="mt-4 flex justify-center">
        <Button variant="secondary" icon={RefreshCw} onClick={onRetry}>Retry</Button>
      </div>
    </div>
  );

  /* -------------------------------------------------------------- one block */

  if (selected) {
    return (
      <div className="p-6 lg:p-8">
        <div className="mb-3">
          <button
            type="button"
            onClick={closeBlock}
            className={`inline-flex items-center gap-1.5 font-ui text-caption text-atlas-700
                        hover:underline rounded-sm ${focusRing}`}
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            All curricula
          </button>
        </div>

        <header className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-page text-atlas-ink">{selected.program_name}</h1>
              <Badge status="published" />
            </div>
            <p className="font-ui text-body text-atlas-slate mt-1 tabular-nums">
              {selected.academic_year} · {pluralize(subjects.length, 'subject')} · {totalUnits} units
            </p>
            <p className="mt-1">{readOnlyNote}</p>
          </div>

          {subjects.length > 0 && (
            <div className="relative w-full md:w-72 shrink-0">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-atlas-slate pointer-events-none"
                aria-hidden="true"
              />
              <label htmlFor="subject-search" className="sr-only">Search subjects</label>
              <input
                id="subject-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search code, title, or prerequisite"
                className={`w-full h-10 pl-9 pr-3 rounded-field font-ui text-body text-atlas-ink
                            bg-white/70 backdrop-blur-sm border border-atlas-control
                            placeholder:text-atlas-disabled hover:border-atlas-slate
                            transition-colors duration-state ease-standard ${focusRing}`}
              />
            </div>
          )}
        </header>

        {isLoadingSubjects && loadingSkeleton(2)}

        {!isLoadingSubjects && subjectError && errorPanel(subjectError, () => loadSubjects(selected))}

        {!isLoadingSubjects && !subjectError && subjects.length === 0 && (
          <div className="glass rounded-panel p-12 text-center">
            <h2 className="font-display text-section text-atlas-ink">No subjects in this curriculum.</h2>
            <p className="mt-2 font-ui text-body text-atlas-slate">
              The administrator has created {selected.program_name} for {selected.academic_year}{' '}
              but has not added its subjects yet.
            </p>
          </div>
        )}

        {!isLoadingSubjects && !subjectError && subjects.length > 0 && !matching.length && (
          <div className="glass rounded-panel p-12 text-center">
            <h2 className="font-display text-section text-atlas-ink">No subject matches “{search.trim()}”.</h2>
            <div className="mt-5 flex justify-center">
              <Button variant="secondary" onClick={() => setSearch('')}>Clear Search</Button>
            </div>
          </div>
        )}

        {!isLoadingSubjects && !subjectError && matching.length > 0 && (
          <>
            {isFiltered && (
              <p className="font-ui text-caption text-atlas-slate mb-4 tabular-nums" role="status">
                {matching.length} of {subjects.length} subjects match “{search.trim()}”.
              </p>
            )}

            <div className="flex flex-col gap-6">
              {grouped.years.map(({ year, terms }) => (
                <section key={year}>
                  <h2 className="flex items-center gap-3 font-ui text-micro uppercase text-atlas-slate mb-3">
                    {YEAR_LABEL[year]}
                    <span className="flex-1 h-px bg-atlas-line" aria-hidden="true" />
                  </h2>
                  <div className="grid gap-4 lg:grid-cols-2">
                    {terms.map(({ term, rows }) => (
                      <TermTable
                        key={term}
                        heading={TERM_LABEL[term]}
                        caption={`${YEAR_LABEL[year]} ${TERM_LABEL[term]}`}
                        rows={rows}
                      />
                    ))}
                  </div>
                </section>
              ))}

              {/* A subject the importer could not file under a year and term is
                  still a subject. Hiding it would make the curriculum look
                  complete when it is not. */}
              {grouped.unfiled.length > 0 && (
                <section>
                  <h2 className="flex items-center gap-3 font-ui text-micro uppercase text-atlas-slate mb-3">
                    Not filed under a year and term
                    <span className="flex-1 h-px bg-atlas-line" aria-hidden="true" />
                  </h2>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <TermTable
                      heading={pluralize(grouped.unfiled.length, 'subject')}
                      caption="Subjects with no year or term"
                      rows={grouped.unfiled}
                    />
                  </div>
                </section>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  /* ------------------------------------------------------------- block list */

  return (
    <div className="p-6 lg:p-8">
      <header className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="font-display text-page text-atlas-ink">Curriculum</h1>
          <p className="font-ui text-body text-atlas-slate mt-1">
            {isLoading
              ? 'Loading your college’s curricula…'
              : !departmentCode
                // resolveDepartment renders an em dash for no college, and
                // "Published curricula for —" names nothing.
                ? 'Published curricula for your college'
                : `Published curricula for ${college.code}${college.registered ? ` — ${college.name}` : ''}`}
          </p>
          <p className="mt-1">{readOnlyNote}</p>
        </div>
        <div className="shrink-0">
          <Button variant="secondary" icon={RefreshCw} onClick={loadBlocks}>Refresh</Button>
        </div>
      </header>

      {isLoading && loadingSkeleton(3)}

      {!isLoading && loadError && errorPanel(loadError, loadBlocks)}

      {/* Two different empty states. A chair with no college is a data problem
          only an administrator can fix, and telling them "no curriculum yet"
          would send them looking for the wrong thing. */}
      {!isLoading && !loadError && !blocks.length && !departmentCode && (
        <div className="glass rounded-panel !border-sem-warning/40 p-12 text-center">
          <h2 className="font-display text-section text-atlas-ink">
            Your account is not assigned to a college.
          </h2>
          <p className="mt-2 font-ui text-body text-atlas-slate max-w-lg mx-auto">
            Curriculum is scoped to the college you belong to, so there is nothing to show
            until an administrator assigns yours.
          </p>
        </div>
      )}

      {!isLoading && !loadError && !blocks.length && departmentCode && (
        <div className="glass rounded-panel p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-atlas-canvas flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8 text-atlas-slate" aria-hidden="true" />
          </div>
          <h2 className="font-display text-section text-atlas-ink">
            No curriculum published for {college.code} yet.
          </h2>
          <p className="mt-2 font-ui text-body text-atlas-slate max-w-lg mx-auto">
            An administrator imports each programme’s curriculum and publishes it. Until then
            there are no subjects to offer or schedule.
          </p>
        </div>
      )}

      {!isLoading && !loadError && blocks.length > 0 && (
        <ul className="grid gap-3 lg:grid-cols-2">
          {[...blocks]
            .sort((a, b) =>
              String(a.program_name || '').localeCompare(String(b.program_name || ''))
              || String(b.academic_year || '').localeCompare(String(a.academic_year || ''))
            )
            .map((block) => (
              <li key={block.id}>
                <button
                  type="button"
                  onClick={() => openBlock(block)}
                  className={`glass sheen rounded-panel px-5 py-4 w-full text-left flex items-center gap-4 group
                              lift accent-edge hover:bg-white/90 ${focusRing}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-data text-table font-semibold text-atlas-ink truncate">
                      {block.program_name}
                    </span>
                    <span className="block font-ui text-caption text-atlas-slate mt-0.5 tabular-nums">
                      {block.academic_year} · {pluralize(block.subject_count || 0, 'subject')} ·{' '}
                      {block.total_units || 0} units
                    </span>
                  </span>
                  <ChevronRight
                    className="w-4 h-4 text-atlas-slate shrink-0 transition-transform duration-state
                               ease-standard group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One term's subjects. Lec/Lab/Units subtotal in the header so a chair checking
 * against the printed curriculum sheet reads the same numbers in the same place.
 */
function TermTable({ heading, caption, rows }) {
  const units = sumBy(rows, 'units');
  const lec = sumBy(rows, 'lec_units');
  const lab = sumBy(rows, 'lab_units');

  return (
    <div className="glass rounded-panel overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/45">
        <h3 className="font-ui text-body font-semibold text-atlas-ink">{heading}</h3>
        <span className="font-ui text-caption text-atlas-slate tabular-nums">
          {rows.length} · {lec}/{lab}/<strong className="text-atlas-ink">{units}</strong>
          <span className="sr-only"> subjects, {lec} lecture units, {lab} laboratory units, {units} units total</span>
        </span>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <caption className="sr-only">{caption}, {pluralize(rows.length, 'subject')}</caption>
          <thead>
            <tr>
              {['Code', 'Course title', 'Lec', 'Lab', 'Units'].map((h, i) => (
                <th
                  key={h}
                  scope="col"
                  className={`px-4 py-2 font-ui text-micro uppercase text-atlas-slate whitespace-nowrap
                              ${i >= 2 ? 'text-right' : 'text-left'}`}
                >
                  {h}
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
                <td className="px-4 py-2 text-right font-data text-table tabular-nums text-atlas-slate">
                  {s.lec_units ?? 0}
                </td>
                <td className="px-4 py-2 text-right font-data text-table tabular-nums text-atlas-slate">
                  {s.lab_units ?? 0}
                </td>
                <td className="px-4 py-2 text-right font-data text-table tabular-nums text-atlas-ink font-semibold">
                  {s.units ?? 0}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

class CurriculumErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Curriculum Page Runtime Error Caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 lg:p-8">
          <div className="glass rounded-panel !border-sem-conflict/40 p-10 text-center max-w-2xl mx-auto">
            <div className="w-14 h-14 rounded-full bg-sem-conflict-bg flex items-center justify-center mx-auto mb-4 text-sem-conflict">
              <AlertCircle className="w-7 h-7" aria-hidden="true" />
            </div>
            <h2 className="font-display text-section text-atlas-ink">This screen could not be displayed.</h2>
            <p className="mt-3 font-data text-caption text-sem-conflict bg-sem-conflict-bg p-4 rounded-field text-left break-words">
              {this.state.error?.toString() || 'An unexpected rendering error occurred.'}
            </p>
            <div className="mt-5 flex justify-center">
              <Button onClick={() => window.location.reload()}>Reload</Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function CurriculumWithErrorBoundary(props) {
  return (
    <CurriculumErrorBoundary>
      <Curriculum {...props} />
    </CurriculumErrorBoundary>
  );
}
