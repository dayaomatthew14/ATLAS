import React from 'react';
import { Upload, FileSpreadsheet, AlertTriangle, Check } from 'lucide-react';
import Button from './Button';
import Dialog from './Dialog';
import { SelectInput } from './Field';
import { focusRing, pluralize } from './tokens';
import { api } from '../../utils/api';

/**
 * Curriculum import. Phase 2 Screen 5 — audit finding FLOW-01.
 *
 * The old flow was: choose file, upload, dry-run, scroll a flat preview of up
 * to 114 rows, commit. No zone grouping, no inline correction, no way to
 * exclude a bad row — a single wrong unit value meant fixing it by hand after
 * the import had already landed.
 *
 * Five steps: Upload, Confirm sheet, Review by zone, Resolve issues, Commit.
 * The importer already returns `zones` (year/term groups with subtotals) and
 * per-row `validation_issues`; both were being thrown away in favour of a flat
 * list. This uses what the API was already computing.
 */

const STEPS = ['Upload', 'Confirm sheet', 'Review', 'Issues', 'Commit'];

export default function CurriculumImportWizard({ isOpen, onClose, onImported, departmentId }) {
  const [step, setStep] = React.useState(0);
  const [file, setFile] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const [summary, setSummary] = React.useState(null);
  const [rows, setRows] = React.useState([]);       // editable draft of every parsed row
  const [sheetChoice, setSheetChoice] = React.useState('');

  const reset = () => {
    setStep(0); setFile(null); setBusy(false); setError('');
    setSummary(null); setRows([]); setSheetChoice('');
  };

  const close = () => { reset(); onClose(); };

  /** Dry run. Never writes; used for steps 2 to 4. */
  const runDryRun = async (sheet) => {
    setBusy(true); setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('dry_run', 'true');
      if (departmentId) form.append('department_id', String(departmentId));
      if (sheet) form.append('selected_sheet', sheet);

      const res = await api.postForm('/curriculum/import', form);
      setSummary(res.summary || null);
      setSheetChoice(res.summary?.selected_sheet || '');
      setRows(
        (res.report || []).map((r, i) => ({
          ...r,
          _key: `${r.code}-${i}`,
          _included: true,
        }))
      );
      return res;
    } catch (e) {
      setError(e.message || 'Could not read this workbook.');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (f) => {
    if (!f) return;
    setFile(f);
    setStep(1);
  };

  React.useEffect(() => {
    // Kick off detection as soon as a file lands on step 2.
    if (step === 1 && file && !summary && !busy) runDryRun(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, file]);

  const included = rows.filter((r) => r._included);
  const withIssues = included.filter((r) => (r.validation_issues || []).length > 0);

  const zones = React.useMemo(() => {
    const map = new Map();
    included.forEach((r) => {
      const key = `${r.year_level || '—'}|${r.semester_term || '—'}`;
      if (!map.has(key)) map.set(key, { year: r.year_level, term: r.semester_term, items: [], total: 0 });
      const z = map.get(key);
      z.items.push(r);
      z.total += Number(r.units) || 0;
    });
    return [...map.values()];
  }, [included]);

  const patchRow = (key, patch) =>
    setRows((prev) => prev.map((r) => (r._key === key ? { ...r, ...patch } : r)));

  const commit = async () => {
    setBusy(true); setError('');
    // The dry run already resolved the target department server-side (a chair
    // is pinned to their own; an admin falls back to the first). Prefer that
    // over the caller's hint, which is undefined when no block is selected.
    const resolvedDept = departmentId ?? rows[0]?.department_id;
    if (!resolvedDept) {
      setError('No department could be resolved for this import.');
      setBusy(false);
      return;
    }
    try {
      const res = await api.post('/curriculum/bulk', {
        program_name: summary?.program_name,
        academic_year: summary?.academic_year,
        department_id: resolvedDept,
        items: included.map((r) => ({
          code: r.code,
          name: r.name,
          units: Number(r.units) || 0,
          type: r.type,
          department_id: resolvedDept,
          program_code: r.program_code,
          year_level: r.year_level,
          semester_term: r.semester_term,
          lec_units: Number(r.lec_units) || 0,
          lab_units: Number(r.lab_units) || 0,
          pre_requisite: r.pre_requisite,
          is_major: r.is_major,
        })),
      });
      onImported(res);
      close();
    } catch (e) {
      setError(e.message || 'Could not commit the import.');
    } finally {
      setBusy(false);
    }
  };

  const footer = (
    <>
      <Button variant="ghost" onClick={close} disabled={busy}>Cancel</Button>
      {step > 1 && (
        <Button variant="secondary" onClick={() => setStep((s) => s - 1)} disabled={busy}>Back</Button>
      )}
      {step === 1 && (
        <Button onClick={() => setStep(2)} disabled={busy || !summary}>Continue</Button>
      )}
      {step === 2 && (
        <Button onClick={() => setStep(3)} disabled={busy || included.length === 0}>
          Continue ({pluralize(included.length, 'subject')})
        </Button>
      )}
      {step === 3 && (
        <Button onClick={() => setStep(4)} disabled={busy}>Continue</Button>
      )}
      {step === 4 && (
        <Button onClick={commit} loading={busy} disabled={included.length === 0}>
          Import {pluralize(included.length, 'subject')}
        </Button>
      )}
    </>
  );

  return (
    <Dialog
      isOpen={isOpen}
      onClose={close}
      title="Import curriculum"
      description={STEPS[step] ? `Step ${step + 1} of 5 — ${STEPS[step]}` : undefined}
      dismissible={!busy}
      footer={footer}
    >
      {/* Progress. aria-current marks the live step for assistive tech. */}
      <ol className="flex gap-1 mb-5" aria-label="Import progress">
        {STEPS.map((s, i) => (
          <li
            key={s}
            aria-current={i === step ? 'step' : undefined}
            className={`flex-1 h-1 rounded-full ${i <= step ? 'bg-atlas-700' : 'bg-atlas-line'}`}
          >
            <span className="sr-only">{s}{i === step ? ' (current)' : ''}</span>
          </li>
        ))}
      </ol>

      {error && (
        <p className="mb-4 p-3 rounded-field bg-sem-conflict-bg font-ui text-body text-sem-conflict flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          {error}
        </p>
      )}

      {/* ---- Step 1: Upload -------------------------------------------- */}
      {step === 0 && (
        <div>
          <label
            htmlFor="curriculum-file"
            className={`flex flex-col items-center justify-center gap-3 p-10 rounded-panel border-2
                        border-dashed border-atlas-control cursor-pointer hover:bg-white/85
                        transition-colors duration-state ease-standard ${focusRing}`}
          >
            <Upload className="w-6 h-6 text-atlas-slate" aria-hidden="true" />
            <span className="font-ui text-body text-atlas-ink">Choose an Excel workbook</span>
            <span className="font-ui text-caption text-atlas-slate">.xlsx — the curriculum flowchart as issued</span>
          </label>
          <input
            id="curriculum-file"
            type="file"
            accept=".xlsx,.xlsm"
            className="sr-only"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>
      )}

      {/* ---- Step 2: Confirm sheet -------------------------------------- */}
      {step === 1 && (
        <div className="flex flex-col gap-4">
          {busy && <p className="font-ui text-body text-atlas-slate">Reading {file?.name}…</p>}
          {summary && (
            <>
              <p className="font-ui text-body text-atlas-ink flex items-start gap-2">
                <FileSpreadsheet className="w-4 h-4 shrink-0 mt-1 text-atlas-slate" aria-hidden="true" />
                {/* Detection is a heuristic, so it shows its reasoning rather
                    than presenting a silent choice. */}
                {summary.selected_sheet_reason}
              </p>
              {(summary.available_sheets || []).length > 1 && (
                <SelectInput
                  label="Use a different sheet"
                  value={sheetChoice}
                  onChange={(e) => { setSheetChoice(e.target.value); runDryRun(e.target.value); }}
                  options={(summary.available_sheets || []).map((s) => ({ value: s, label: s }))}
                />
              )}
              <dl className="grid grid-cols-2 gap-3 font-ui text-body">
                <div><dt className="text-micro uppercase text-atlas-slate">Programme</dt><dd className="text-atlas-ink">{summary.program_name}</dd></div>
                <div><dt className="text-micro uppercase text-atlas-slate">Academic year</dt><dd className="text-atlas-ink">{summary.academic_year}</dd></div>
                <div><dt className="text-micro uppercase text-atlas-slate">Rows scanned</dt><dd className="font-data tabular-nums text-atlas-ink">{summary.scanned_rows ?? '—'}</dd></div>
                <div><dt className="text-micro uppercase text-atlas-slate">Subjects found</dt><dd className="font-data tabular-nums text-atlas-ink">{summary.detected_subjects ?? rows.length}</dd></div>
              </dl>
            </>
          )}
        </div>
      )}

      {/* ---- Step 3: Review by zone ------------------------------------- */}
      {step === 2 && (
        <div className="flex flex-col gap-4 max-h-[52vh] overflow-y-auto">
          {zones.map((z) => (
            <section key={`${z.year}-${z.term}`} className="rounded-panel border border-atlas-line">
              <header className="flex items-center justify-between px-3 py-2 bg-atlas-canvas rounded-t-panel">
                <h3 className="font-ui text-micro uppercase text-atlas-slate">
                  {z.year === 'Elective' ? 'Electives' : `Year ${z.year} · ${z.term}`}
                </h3>
                <span className="font-data text-table tabular-nums text-atlas-slate">
                  {pluralize(z.items.length, 'subject')} · {z.total} units
                </span>
              </header>
              <table className="w-full">
                <caption className="sr-only">
                  Year {z.year}, {z.term}: {pluralize(z.items.length, 'subject')}
                </caption>
                <tbody>
                  {z.items.map((r) => (
                    <ImportRow key={r._key} row={r} onPatch={patchRow} />
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}

      {/* ---- Step 4: Issues only ---------------------------------------- */}
      {step === 3 && (
        <div className="flex flex-col gap-3 max-h-[52vh] overflow-y-auto">
          {/* Filtering to the rows that need attention is the actual saving.
              Asking someone to re-scan 114 rows to find 6 problems was the
              flow's real cost. */}
          {withIssues.length === 0 ? (
            <p className="font-ui text-body text-atlas-ink flex items-center gap-2">
              <Check className="w-4 h-4 text-atlas-700" aria-hidden="true" />
              No issues found in the {pluralize(included.length, 'subject')} to import.
            </p>
          ) : (
            <>
              <p className="font-ui text-body text-atlas-slate">
                {pluralize(withIssues.length, 'row')} {withIssues.length === 1 ? 'needs' : 'need'} attention.
                Everything else is ready.
              </p>
              <table className="w-full">
                <caption className="sr-only">Rows with validation issues</caption>
                <tbody>
                  {withIssues.map((r) => (
                    <ImportRow key={r._key} row={r} onPatch={patchRow} showIssues />
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {/* ---- Step 5: Commit --------------------------------------------- */}
      {step === 4 && summary && (
        <div className="flex flex-col gap-3 font-ui text-body">
          <p className="text-atlas-ink">
            {pluralize(included.length, 'subject')} will be added to{' '}
            <strong>{summary.program_name}</strong> ({summary.academic_year}).
          </p>
          {rows.length !== included.length && (
            <p className="text-atlas-slate">
              {pluralize(rows.length - included.length, 'row')} excluded and will not be imported.
            </p>
          )}
          {/* Unit reconciliation stated plainly, not as a status string. */}
          {summary.excel_total > 0 && (
            <p className={Math.abs((summary.excel_total || 0) - included.reduce((n, r) => n + (Number(r.units) || 0), 0)) > 0.5
              ? 'text-sem-warning' : 'text-atlas-slate'}>
              Excel totals {summary.excel_total} units. This import totals{' '}
              {included.reduce((n, r) => n + (Number(r.units) || 0), 0)} units.
            </p>
          )}
          {withIssues.length > 0 && (
            <p className="text-sem-warning flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              {pluralize(withIssues.length, 'row')} still carry warnings and will be imported as they stand.
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}

/** One editable parsed row. Inline correction and exclusion were both absent. */
function ImportRow({ row, onPatch, showIssues = false }) {
  const issues = row.validation_issues || [];
  const cell = `h-8 px-2 rounded-field border border-atlas-control bg-atlas-surface
                font-ui text-table text-atlas-ink ${focusRing}`;

  return (
    <tr className={`border-t border-white/45 ${row._included ? '' : 'opacity-50'}`}>
      <td className="p-2 w-8">
        <input
          type="checkbox"
          checked={row._included}
          onChange={(e) => onPatch(row._key, { _included: e.target.checked })}
          aria-label={`Include ${row.code}`}
          className={`w-4 h-4 accent-[var(--atlas-green-700)] ${focusRing}`}
        />
      </td>
      <td className="p-2 w-28">
        <input
          value={row.code}
          onChange={(e) => onPatch(row._key, { code: e.target.value })}
          aria-label={`Code for ${row.code}`}
          className={`${cell} w-full font-data`}
        />
      </td>
      <td className="p-2">
        <input
          value={row.name}
          onChange={(e) => onPatch(row._key, { name: e.target.value })}
          aria-label={`Title for ${row.code}`}
          className={`${cell} w-full`}
        />
        {showIssues && issues.map((iss) => (
          <p key={iss} className="mt-1 font-ui text-caption text-sem-warning flex items-start gap-1.5">
            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" aria-hidden="true" />
            {iss}
          </p>
        ))}
      </td>
      {['units', 'lec_units', 'lab_units'].map((f) => (
        <td key={f} className="p-2 w-16">
          <input
            type="number"
            min="0"
            value={row[f] ?? 0}
            onChange={(e) => onPatch(row._key, { [f]: e.target.value })}
            aria-label={`${f.replace('_', ' ')} for ${row.code}`}
            className={`${cell} w-full font-data tabular-nums text-right`}
          />
        </td>
      ))}
    </tr>
  );
}
