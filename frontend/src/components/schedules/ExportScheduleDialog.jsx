import { Check, FileSpreadsheet } from 'lucide-react';
import AtlasDialog from '../ui/Dialog';
import AtlasButton from '../ui/Button';
import { EXPORT_COLUMNS } from '../../utils/scheduleHelpers';

/**
 * Excel export preview modal: shows target filename, row count, scope toggle,
 * and live tabular preview matching the exported Excel columns.
 */
export default function ExportScheduleDialog({
  isOpen,
  onClose,
  onDownload,
  isExporting,
  exportRows,
  exportFileName,
  exportTerm,
  formatSemesterTerm,
  selectedProfessorFilter,
  globalSchedules,
  exportScope,
  setExportScope,
}) {
  return (
    <AtlasDialog
      isOpen={isOpen}
      onClose={onClose}
      title="Export Schedule to Excel"
      description="Download an official Excel workbook (.xlsx) formatted with DLSAU institutional styling."
      size="wide"
      icon={FileSpreadsheet}
      dismissible={!isExporting}
      footer={
        <>
          <AtlasButton variant="ghost" onClick={onClose} disabled={isExporting}>
            Cancel
          </AtlasButton>
          <AtlasButton
            onClick={onDownload}
            disabled={exportRows.length === 0 || isExporting}
            loading={isExporting}
            icon={FileSpreadsheet}
          >
            Download Excel (.xlsx)
          </AtlasButton>
        </>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-white/70 border border-emerald-900/10 shadow-xs">
          <div className="min-w-0">
            <span className="font-ui text-caption font-bold text-slate-700 tracking-wider uppercase block">
              Target File
            </span>
            <p className="font-data text-table font-bold text-emerald-950 mt-0.5 break-all">
              {exportFileName}
            </p>
            <p className="font-ui text-caption text-slate-600 mt-0.5 font-medium">
              Official DLSAU Excel spreadsheet with green header &amp; auto-fit columns
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200/60">
              <span className="font-ui text-micro font-bold uppercase text-emerald-800 tracking-wider block">
                Total Rows
              </span>
              <span className="font-display text-lead font-extrabold text-emerald-950 tabular-nums">
                {exportRows.length} {exportRows.length === 1 ? 'class' : 'classes'}
              </span>
            </div>
            <div className="text-right px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/60">
              <span className="font-ui text-micro font-bold uppercase text-slate-600 tracking-wider block">
                Semester
              </span>
              <span className="font-ui text-body font-bold text-slate-800">
                {exportTerm ? `${exportTerm.academic_year} ${formatSemesterTerm(exportTerm.term)}` : 'Active Term'}
              </span>
            </div>
          </div>
        </div>

        <div>
          <span className="font-ui text-caption font-bold text-slate-800 tracking-wider uppercase block mb-2.5">
            Document Format
          </span>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-emerald-700/30 bg-emerald-50/60 shadow-xs">
            <div className="flex items-center gap-3.5">
              <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border bg-emerald-100 text-emerald-800 border-emerald-200 shadow-2xs">
                <FileSpreadsheet className="w-5 h-5 stroke-[2.2]" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-ui text-body font-bold text-slate-900">
                    Excel Workbook (.xlsx)
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border bg-emerald-100 text-emerald-800 border-emerald-300">
                    Official Export
                  </span>
                </div>
                <p className="font-ui text-caption text-slate-600 mt-0.5 font-medium">
                  Institutional spreadsheet layout with DLSAU forest-green header, auto-fit columns &amp; frozen panes
                </p>
              </div>
            </div>
            <div className="self-end sm:self-auto flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/80 border border-emerald-200 text-emerald-800 font-ui text-caption font-bold">
              <Check className="w-3.5 h-3.5 text-emerald-700 stroke-[3]" />
              <span>Selected</span>
            </div>
          </div>
        </div>

        {selectedProfessorFilter ? (
          <fieldset>
            <legend className="font-ui text-caption font-bold text-slate-800 tracking-wider uppercase mb-2">
              Faculty Scope
            </legend>
            <div className="flex flex-col sm:flex-row gap-3">
              {[
                {
                  id: 'filtered',
                  label: selectedProfessorFilter,
                  count: globalSchedules.filter((s) => s.faculty_name === selectedProfessorFilter).length,
                  desc: 'Export timetable for this faculty member only',
                },
                {
                  id: 'all',
                  label: 'All Professors',
                  count: globalSchedules.length,
                  desc: 'Export the complete departmental schedule',
                },
              ].map((opt) => (
                <label
                  key={opt.id}
                  className={`flex-1 flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                    exportScope === opt.id
                      ? 'bg-emerald-50/70 border-emerald-700/40 ring-1 ring-emerald-700/20'
                      : 'bg-white border-slate-200/90 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="export-scope"
                    className="sr-only"
                    checked={exportScope === opt.id}
                    onChange={() => setExportScope(opt.id)}
                  />
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      exportScope === opt.id ? 'border-emerald-700 bg-emerald-700' : 'border-slate-300 bg-white'
                    }`}
                  >
                    {exportScope === opt.id && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-ui text-body font-bold text-slate-900 truncate">
                      {opt.label}
                    </span>
                    <span className="block font-ui text-caption text-slate-600 font-medium">
                      {opt.desc} ({opt.count} {opt.count === 1 ? 'class' : 'classes'})
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200/70 text-slate-700 font-ui text-caption font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-700" />
            Including all scheduled faculty members and classes in your department.
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="font-ui text-caption font-bold text-slate-800 tracking-wider uppercase">
              Document Preview ({exportRows.length} {exportRows.length === 1 ? 'row' : 'rows'})
            </span>
            <span className="font-ui text-caption text-slate-500 font-medium">
              Scroll to view complete dataset
            </span>
          </div>
          <div className="border border-slate-200/90 rounded-2xl overflow-hidden bg-white shadow-2xs">
            <div className="max-h-[38vh] overflow-auto">
              <table className="w-full text-left border-collapse">
                <caption className="sr-only">Preview of the exported schedule, {exportRows.length} rows</caption>
                <thead className="sticky top-0 bg-[#05301F] text-white z-10">
                  <tr>
                    {EXPORT_COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        scope="col"
                        className="px-3.5 py-3 font-ui text-caption font-bold tracking-wider uppercase whitespace-nowrap border-b-2 border-[#C8A227]"
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-ui">
                  {exportRows.map((s, idx) => (
                    <tr
                      key={s.id || idx}
                      className={`hover:bg-emerald-50/40 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}`}
                    >
                      {EXPORT_COLUMNS.map((col) => (
                        <td
                          key={col.key}
                          className={`px-3.5 py-2.5 text-caption whitespace-nowrap ${
                            col.key === 'faculty'
                              ? 'font-bold text-slate-900'
                              : col.key === 'code'
                              ? 'font-bold text-emerald-950 font-data'
                              : 'text-slate-700 font-medium'
                          }`}
                        >
                          {col.value(s) || <span className="text-slate-300">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {exportRows.length === 0 && (
              <div className="p-10 text-center text-slate-500">
                <p className="font-ui text-body font-bold text-slate-800">No classes match your selection</p>
                <p className="font-ui text-caption text-slate-500 mt-1">
                  Try adjusting your filters or generating a schedule first.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AtlasDialog>
  );
}

