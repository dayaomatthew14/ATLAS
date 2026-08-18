import React, { useState, useEffect } from 'react';
import { Plus, AlertTriangle, Sparkles, MapPin, User, Trash2, RotateCcw, X, Download, LayoutGrid, LayoutList } from 'lucide-react';
import Modal from '../../components/Modal';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';
import { detectConflicts, checkScheduleIntegrity } from '../../utils/conflictDetection';
import AtlasButton from '../../components/ui/Button';
import ConflictLens from '../../components/ui/ConflictLens';
// Badge, ConfirmDialog, restrictionReason and the admin check left with the
// publish control — they had no other consumer on this screen.
import Badge from '../../components/ui/Badge';
import { SelectInput } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/Page';
import { focusRing, pluralize } from '../../components/ui/tokens';
import { canEditSchedules, getDepartment } from '../../utils/session';

const formatSemesterTerm = (term) => {
  if (!term) return '';
  if (term === '1st') return '1st Semester';
  if (term === '2nd') return '2nd Semester';
  if (term === '3rd semester') return '3rd Semester';
  return term;
};

const FACULTY_COLOR_PALETTES = [
  { name: 'emerald', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-950', badge: 'bg-emerald-700 text-white', accent: 'border-l-emerald-600', dot: 'bg-emerald-500' },
  { name: 'indigo', bg: 'bg-indigo-50 border-indigo-200', text: 'text-indigo-950', badge: 'bg-indigo-700 text-white', accent: 'border-l-indigo-600', dot: 'bg-indigo-500' },
  { name: 'amber', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-950', badge: 'bg-amber-700 text-white', accent: 'border-l-amber-600', dot: 'bg-amber-500' },
  { name: 'purple', bg: 'bg-purple-50 border-purple-200', text: 'text-purple-950', badge: 'bg-purple-700 text-white', accent: 'border-l-purple-600', dot: 'bg-purple-500' },
  { name: 'cyan', bg: 'bg-cyan-50 border-cyan-200', text: 'text-cyan-950', badge: 'bg-cyan-700 text-white', accent: 'border-l-cyan-600', dot: 'bg-cyan-500' },
  { name: 'rose', bg: 'bg-rose-50 border-rose-200', text: 'text-rose-950', badge: 'bg-rose-700 text-white', accent: 'border-l-rose-600', dot: 'bg-rose-500' },
  { name: 'teal', bg: 'bg-teal-50 border-teal-200', text: 'text-teal-950', badge: 'bg-teal-700 text-white', accent: 'border-l-teal-600', dot: 'bg-teal-500' },
  { name: 'blue', bg: 'bg-blue-50 border-blue-200', text: 'text-blue-950', badge: 'bg-blue-700 text-white', accent: 'border-l-blue-600', dot: 'bg-blue-500' },
  { name: 'violet', bg: 'bg-violet-50 border-violet-200', text: 'text-violet-950', badge: 'bg-violet-700 text-white', accent: 'border-l-violet-600', dot: 'bg-violet-500' },
  { name: 'fuchsia', bg: 'bg-fuchsia-50 border-fuchsia-200', text: 'text-fuchsia-950', badge: 'bg-fuchsia-700 text-white', accent: 'border-l-fuchsia-600', dot: 'bg-fuchsia-500' },
  { name: 'sky', bg: 'bg-sky-50 border-sky-200', text: 'text-sky-950', badge: 'bg-sky-700 text-white', accent: 'border-l-sky-600', dot: 'bg-sky-500' },
  { name: 'orange', bg: 'bg-orange-50 border-orange-200', text: 'text-orange-950', badge: 'bg-orange-700 text-white', accent: 'border-l-orange-600', dot: 'bg-orange-500' }
];

const getFacultyColor = (profName) => {
  if (!profName) return FACULTY_COLOR_PALETTES[0];
  let hash = 0;
  for (let i = 0; i < profName.length; i++) {
    hash = profName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % FACULTY_COLOR_PALETTES.length;
  return FACULTY_COLOR_PALETTES[index];
};

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LABEL = {
  Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday',
  Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday',
};

/** "13:30" -> "1:30 PM". The grid had this inline three times over. */
const to12h = (t) => {
  if (!t) return '';
  const [h, m] = String(t).split(':');
  const hr = parseInt(h, 10);
  if (Number.isNaN(hr)) return '';
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
};

const minutesOf = (t) => {
  const [h, m] = String(t || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const durationHours = (s) => Math.max(0, (minutesOf(s.end_time) - minutesOf(s.start_time)) / 60);

/** The API writes either "Mon" or "Monday" depending on the path that saved it. */
const dayKey = (value) => {
  const head = String(value || '').slice(0, 3).toLowerCase();
  return DAY_ORDER.find((d) => d.toLowerCase() === head) || '';
};

const formatSubjectCode = (sched) => {
  if (!sched || !sched.subject_code) return '';
  const rawCode = sched.subject_code;
  const abMatch = rawCode.match(/^(.*?)[_\-\s]*A\/B$/i);
  if (abMatch) {
    const baseCode = abMatch[1].trim();
    const isLec = !sched.room_id || sched.room_name === '—' || sched.room_name === '' || sched.part_type === 'lecture';
    return isLec ? `${baseCode}A` : `${baseCode}B`;
  }
  return rawCode;
};

/**
 * The exported file's columns, in order.
 *
 * One list drives both the preview table and the file itself, so the preview
 * cannot drift from what is actually written — which is the only thing that
 * makes a preview worth showing.
 */
const EXPORT_COLUMNS = [
  { key: 'faculty', label: 'Professor', value: (s) => s.faculty_name || 'TBA' },
  { key: 'code', label: 'Subject Code', value: (s) => formatSubjectCode(s) },
  { key: 'name', label: 'Subject Name', value: (s) => s.subject_name || '' },
  { key: 'day', label: 'Day', value: (s) => DAY_LABEL[dayKey(s.day_of_week)] || s.day_of_week || '' },
  { key: 'start', label: 'Start Time', value: (s) => to12h(s.start_time) },
  { key: 'end', label: 'End Time', value: (s) => to12h(s.end_time) },
  { key: 'room', label: 'Room', value: (s) => (s.room_name && s.room_name !== '—' ? s.room_name : 'No room assigned') },
  { key: 'building', label: 'Building', value: (s) => s.room_building || '' },
  { key: 'section', label: 'Section', value: (s) => s.section || '' },
];

/**
 * RFC 4180 quoting.
 *
 * The previous export built a `data:` URI and ran it through `encodeURI`, which
 * does not escape `#`. A subject name containing one — and curriculum sheets do
 * carry them — ended the URI there, so the file downloaded silently truncated
 * at that row, with nothing to say it had. Quoting here and writing a Blob
 * below removes both hazards.
 */
const csvCell = (value) => {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Byte-order mark, written as an escape rather than the invisible character
 * itself so a formatter cannot strip it without anyone noticing. Excel reads
 * a BOM-less CSV as the system codepage, which turns any non-ASCII subject
 * name into mojibake.
 */
const CSV_BOM = '\uFEFF';

const buildCsv = (rows) =>
  [
    EXPORT_COLUMNS.map((c) => csvCell(c.label)).join(','),
    ...rows.map((s) => EXPORT_COLUMNS.map((c) => csvCell(c.value(s))).join(',')),
  ].join('\r\n');

/**
 * The three things Export can produce. Printing is not one of them: the browser
 * print dialog produced no file, only a page someone still had to save by hand,
 * and half the time it landed as a screenshot of the app rather than a document.
 */
const EXPORT_FORMATS = [
  {
    id: 'csv',
    ext: 'csv',
    label: 'Spreadsheet',
    sub: 'CSV — Excel, Numbers, Google Sheets',
  },
  {
    id: 'word',
    ext: 'doc',
    label: 'Word document',
    sub: 'Opens and edits in Word, Docs or LibreOffice',
  },
  {
    id: 'pdf',
    ext: 'pdf',
    label: 'PDF',
    sub: 'Fixed layout, for sending and posting',
  },
];

const htmlEscape = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * A Word document, built as HTML.
 *
 * Word, LibreOffice and Google Docs all open an HTML file served as
 * `application/msword`, and the result is a real editable document with a
 * formatted table. A true binary .docx would mean adding a document library to
 * a project that has four frontend dependencies; this needs none and produces a
 * file people can actually edit, which is the point of asking for Word.
 */
const buildWordHtml = (rows, { title, subtitle }) => `
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8">
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
<style>
  @page { size: 29.7cm 21cm; margin: 1.5cm; }
  body { font-family: Calibri, Arial, sans-serif; font-size: 10pt; color: #16211c; }
  h1 { font-size: 16pt; margin: 0 0 4pt; }
  p.sub { font-size: 9pt; color: #5b6b63; margin: 0 0 14pt; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 0.5pt solid #c9d2cd; padding: 5pt 6pt; text-align: left; vertical-align: top; font-size: 9pt; }
  th { background: #0d3b26; color: #ffffff; font-weight: bold; }
  tr.alt td { background: #f4f6f5; }
</style></head>
<body>
  <h1>${htmlEscape(title)}</h1>
  <p class="sub">${htmlEscape(subtitle)}</p>
  <table>
    <thead><tr>${EXPORT_COLUMNS.map((c) => `<th>${htmlEscape(c.label)}</th>`).join('')}</tr></thead>
    <tbody>
      ${rows.map((s, i) =>
        `<tr${i % 2 ? ' class="alt"' : ''}>${EXPORT_COLUMNS.map((c) => `<td>${htmlEscape(c.value(s))}</td>`).join('')}</tr>`
      ).join('')}
    </tbody>
  </table>
</body></html>`.trim();

/** Professor, then the week in order, then time of day. How you would read it. */
const sortForExport = (rows) =>
  [...rows].sort(
    (a, b) =>
      String(a.faculty_name || '').localeCompare(String(b.faculty_name || ''))
      || DAY_ORDER.indexOf(dayKey(a.day_of_week)) - DAY_ORDER.indexOf(dayKey(b.day_of_week))
      || minutesOf(a.start_time) - minutesOf(b.start_time)
      || String(a.subject_code || '').localeCompare(String(b.subject_code || ''))
  );

/**
 * One class, in the by-professor board.
 *
 * Laid out to be read rather than to fit: the subject name wraps in full
 * instead of truncating, the time range gets its own line at full weight, and
 * room and section sit under a rule rather than sharing a row. It is the same
 * class the grid renders, given the space to say what it is.
 */
function ClassCard({ sched, color, dayLabel, lensDim, lensLit, canManage, onDelete }) {
  const code = formatSubjectCode(sched);
  const label =
    `${code}, ${sched.subject_name}, ${dayLabel} ` +
    `${to12h(sched.start_time)} to ${to12h(sched.end_time)}, ` +
    `${sched.room_name && sched.room_name !== '—' ? sched.room_name : 'no room assigned'}` +
    (canManage ? '. Press Delete to remove this class.' : '');

  return (
    <div
      role="button"
      tabIndex={lensDim ? -1 : 0}
      aria-hidden={lensDim || undefined}
      aria-label={label}
      onKeyDown={(e) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && canManage) {
          e.preventDefault();
          onDelete(sched);
        }
      }}
      className={`print-block group relative rounded-panel border border-l-[6px] p-4 lift
                  focus-visible:outline-none
                  focus-visible:ring-2 focus-visible:ring-atlas-700 focus-visible:ring-offset-2
                  ${lensDim ? 'lens-dimmed' : ''} ${lensLit ? 'lens-conflict' : ''}
                  ${color.bg} ${color.border} ${color.accent}`}
    >
      {lensLit && (
        <span className="absolute top-2 right-2 text-sem-conflict font-bold" aria-hidden="true">▲</span>
      )}

      <div className="flex items-start justify-between gap-2">
        <span className="font-data text-table text-atlas-ink">{code}</span>
        {canManage && (
          <button
            type="button"
            onClick={() => onDelete(sched)}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 -m-1 text-rose-600
                       hover:bg-rose-100 rounded-lg transition-all no-print"
            aria-label={`Delete ${code} on ${dayLabel}`}
            title="Delete this class"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Full name, wrapped. Truncating this is what made the grid unreadable. */}
      <p className="mt-1.5 font-ui text-body leading-snug text-atlas-ink">{sched.subject_name}</p>

      <p className="mt-2.5 font-data text-table tabular-nums text-atlas-ink">
        {to12h(sched.start_time)} – {to12h(sched.end_time)}
      </p>

      <div className="mt-2.5 pt-2.5 border-t border-black/10 flex flex-col gap-1.5 text-xs font-bold text-slate-700">
        <span className="flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-emerald-700 shrink-0" aria-hidden="true" />
          <span>
            {sched.room_name && sched.room_name !== '—' ? sched.room_name : 'No room assigned'}
            {sched.room_building ? ` · ${sched.room_building}` : ''}
          </span>
        </span>
        {sched.section && (
          <span className="flex items-center gap-1.5 text-slate-600">
            <User className="w-3.5 h-3.5 text-indigo-600 shrink-0" aria-hidden="true" />
            <span>Section {sched.section}</span>
          </span>
        )}
      </div>
    </div>
  );
}

export default function Schedules() {
  const { addToast } = useToast();
  const [schedules, setSchedules] = useState([]);
  const [formConflicts, setFormConflicts] = useState([]);

  const [activeSemesterId, setActiveSemesterId] = useState(null);

  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  // Whether the generator should put laboratory subjects in a room. Lecture
  // subjects never get one either way. Defaults on, which is what the generator
  // did before this was a choice.
  const [assignLabRooms, setAssignLabRooms] = useState(true);
  const [semesters, setSemesters] = useState([]);
  const [selectedGenSemester, setSelectedGenSemester] = useState('');
  const [selectedGenProfessors, setSelectedGenProfessors] = useState([]);
  const [generationResults, setGenerationResults] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const [globalSchedules, setGlobalSchedules] = useState([]);
  const [isGlobalLoading, setIsGlobalLoading] = useState(false);
  const [activeConflicts, setActiveConflicts] = useState([]);
  // Distinct from `activeConflicts.length === 0`: no conflicts found versus
  // never found out. Only the first of those means the timetable is clean.
  const [conflictsUnavailable, setConflictsUnavailable] = useState(false);

  /* --------------------------------------------------------------------------
   * Publication state — read only, and only for print.
   *
   * Publishing itself is not on this screen: it is an administrator action and
   * administrators do not open the Schedule screen, so the control here could
   * never be used by anyone who could see it. What survives is the read: the
   * printed schedule needs to know whether it is official, because a draft
   * posted on a department door is the failure the DRAFT watermark prevents
   * (FLOW-04). An administrator publishing through the API still clears it.
   * ----------------------------------------------------------------------- */
  const [publishState, setPublishState] = useState({
    status: 'draft', total: 0, published: 0, unresolved_conflicts: 0,
  });
  // --- Conflict lens (Phase 1 §1.5) --------------------------------------
  const [isLensOpen, setIsLensOpen] = useState(false);
  const [lensCauseFilter, setLensCauseFilter] = useState(null);
  const [resolvingId, setResolvingId] = useState(null);

  // Curriculum ids that are in conflict, so the grid knows which blocks stay lit.
  const conflictedCurriculumIds = React.useMemo(
    () => new Set(activeConflicts.map((c) => c.curriculum_id).filter(Boolean)),
    [activeConflicts]
  );

  // The lens dismisses itself when the last conflict clears. Defined further
  // down, next to `lensConflicts`, because it is that combined list -- not the
  // server list alone -- that decides whether anything is left to show.

  /* --------------------------------------------------------------------------
   * How the generated schedule is displayed.
   *
   * The combined week grid stacks every professor into one six-column board and
   * positions each class absolutely at full column width. Two professors
   * teaching at 9:00 on a Monday — in different rooms, which is the normal case,
   * not an error — render on top of one another, and the later one hides the
   * earlier completely. So the one view that claimed to show the whole
   * department's schedule was the one view that could not.
   *
   * "By professor" gives each professor their own board, where classes flow in
   * time order instead of being positioned over each other. Nothing can hide
   * anything, subject names wrap instead of truncating, and the page is as long
   * as it needs to be. The combined grid is kept because the conflict lens dims
   * and lights blocks in it, and that is a different job from reading a load.
   * ----------------------------------------------------------------------- */
  const [scheduleView, setScheduleView] = useState('faculty');

  const fetchPublishState = async (semesterId) => {
    if (!semesterId) return;
    try {
      const data = await api.get(`/schedules/status?semester_id=${semesterId}`);
      setPublishState(data || { status: 'draft', total: 0, published: 0, unresolved_conflicts: 0 });
    } catch (e) {
      /* leave it on draft rather than claiming a state we could not read */
    }
  };

  const [undoBackup, setUndoBackup] = useState(null);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);

  const fetchActiveConflicts = async () => {
    try {
      const data = await api.get('/ai-scheduler/conflicts');
      setActiveConflicts(Array.isArray(data) ? data : []);
      setConflictsUnavailable(false);
    } catch (e) {
      // Logging alone left `activeConflicts` at its previous value — usually
      // the initial `[]` — so a failed fetch presented as a clean timetable
      // and the Conflicts button simply did not appear. Record the failure so
      // the header can say the check did not run.
      console.error('ATLAS: conflict list could not be read.', e);
      setActiveConflicts([]);
      setConflictsUnavailable(true);
    }
  };

  const handleSolveConflict = async (item) => {
    setResolvingId(item.conflict_id ?? item.id);
    try {
      const res = await api.post('/ai-scheduler/solve-conflict', {
        conflict_id: item.conflict_id || item.id,
        faculty_id: item.faculty || item.faculty_id,
        curriculum_id: item.curriculum_id,
        semester_id: selectedGenSemester || activeSemesterId,
        part_type: item.part_type || 'lecture'
      });
      addToast(res.message || 'Conflict resolved successfully', 'success');

      if (generationResults) {
        setGenerationResults(prev => {
          if (!prev) return prev;
          const updatedItems = (prev.unplaced_items || []).filter(i =>
            i !== item &&
            i.conflict_id !== (item.conflict_id || item.id) &&
            !(i.faculty === (item.faculty || item.faculty_id) && i.curriculum_id === item.curriculum_id)
          );
          return {
            ...prev,
            generated: prev.generated + 2,
            unplaced_count: updatedItems.length,
            unplaced_items: updatedItems
          };
        });
      }

      const semToFetch = selectedGenSemester || activeSemesterId;
      if (semToFetch) {
        fetchGlobalSchedules(semToFetch);
      }
      fetchActiveConflicts();
    } catch (e) {
      // A 409 means no conflict-free slot exists (DEP-6). That is a real answer
      // about the schedule, not a failure to report as an error toast.
      if (e.status === 409) {
        addToast(e.message, 'warning');
      } else {
        addToast(e.message || 'Could not resolve the conflict.', 'error');
      }
    } finally {
      setResolvingId(null);
    }
  };

  /**
   * "Auto-Solve All Conflicts" was removed here.
   *
   * It looped the single-conflict resolver over every conflict, and that
   * resolver force-placed into the first room on Mon/Wed whenever no free slot
   * existed — creating fresh double-bookings and marking them resolved. One
   * click could quietly corrupt an entire term. The backend no longer
   * force-places (DEP-6), and conflicts are now stepped through one at a time
   * in the lens so each resolution is a decision someone actually made.
   */

  const handleDeleteSchedule = async (sched) => {
    try {
      const res = await api.delete(`/schedules/${sched.id}`);
      if (res?.backup) {
        setUndoBackup({
          label: `Deleted schedule for ${sched.subject_code}`,
          items: [res.backup]
        });
      }
      const semToFetch = selectedGenSemester || activeSemesterId;
      if (semToFetch) fetchGlobalSchedules(semToFetch);
      fetchSchedules();
    } catch (e) {
      addToast(e.message || 'Failed to delete schedule', 'error');
    }
  };

  const handleClearAllSchedules = async () => {
    const semId = selectedGenSemester || activeSemesterId;
    if (!semId) return addToast('Select a semester first', 'error');
    try {
      const res = await api.delete(`/schedules/clear-all?semester_id=${semId}`);
      if (res?.backup?.length > 0) {
        setUndoBackup({
          label: `Cleared ${res.deleted_count} schedule entries`,
          items: res.backup
        });
      }
      fetchGlobalSchedules(semId);
      fetchSchedules();
      fetchActiveConflicts();
      setIsClearConfirmOpen(false);
    } catch (e) {
      addToast(e.message || 'Failed to clear schedules', 'error');
    }
  };

  const handleRestoreSchedules = async () => {
    if (!undoBackup || !undoBackup.items?.length) return;
    try {
      await api.post('/schedules/restore', { items: undoBackup.items });
      addToast('Schedules successfully restored! ✨', 'success');
      setUndoBackup(null);
      const semId = selectedGenSemester || activeSemesterId;
      if (semId) fetchGlobalSchedules(semId);
      fetchSchedules();
      fetchActiveConflicts();
    } catch (e) {
      addToast(e.message || 'Failed to restore schedules', 'error');
    }
  };

  /*
   * `handlePrintSchedule` and the Export dropdown were removed together.
   * `window.print()` produced no file — it opened the browser's print dialog and
   * left the user to save a page by hand. Export now writes a real document in
   * one of three formats. The @media print rules stay: Ctrl+P still works and
   * still carries the DRAFT watermark.
   */

  const fetchGenerateData = async () => {
    try {
      const sems = await api.get('/semesters').catch(() => []);
      const safeSems = Array.isArray(sems) ? sems : [];
      setSemesters(safeSems);
      const active = safeSems.find(s => s.is_active);
      if (active) {
        setSelectedGenSemester(active.id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchGlobalSchedules = async (semesterId) => {
    if (!semesterId) return;
    setIsGlobalLoading(true);
    try {
      const data = await api.get(`/ai-scheduler/global-schedule?semester_id=${semesterId}`);
      setGlobalSchedules(Array.isArray(data) ? data : []);
    } catch (e) {
      addToast('Failed to fetch global schedule', 'error');
    } finally {
      setIsGlobalLoading(false);
    }
  };

  const [selectedProfessorFilter, setSelectedProfessorFilter] = useState('');
  const [allTeachers, setAllTeachers] = useState([]);

  /* --------------------------------------------------------------------------
   * Export.
   *
   * The file used to land on disk the moment Export was clicked — no way to see
   * what was in it, how many rows, or whose classes, until you opened it in
   * Excel. Now the same rows the file will contain are shown first, built from
   * one column list (EXPORT_COLUMNS) so the preview and the file cannot diverge.
   *
   * Declared below `selectedProfessorFilter` on purpose: it reads that state, and
   * `const` bindings are in the temporal dead zone until their own line runs.
   * ----------------------------------------------------------------------- */
  const [isExportOpen, setIsExportOpen] = useState(false);
  // 'all' or 'filtered'. Only meaningful while a professor filter is active.
  const [exportScope, setExportScope] = useState('all');
  const [exportFormat, setExportFormat] = useState('csv');
  const [isExporting, setIsExporting] = useState(false);

  const openExport = () => {
    if (!globalSchedules || globalSchedules.length === 0) {
      addToast('No schedule entries to export', 'warning');
      return;
    }
    // Default to what is on screen: someone who filtered to one professor and
    // then hit Export almost certainly means that professor.
    setExportScope(selectedProfessorFilter ? 'filtered' : 'all');
    setIsExportOpen(true);
  };

  const exportRows = React.useMemo(() => {
    const scoped =
      exportScope === 'filtered' && selectedProfessorFilter
        ? globalSchedules.filter((s) => s.faculty_name === selectedProfessorFilter)
        : globalSchedules;
    return sortForExport(scoped);
  }, [globalSchedules, exportScope, selectedProfessorFilter]);

  const exportTerm = semesters.find((s) => s.id === activeSemesterId);

  const exportFileName = (() => {
    const parts = ['ATLAS_Schedule'];
    if (exportTerm) parts.push(`${exportTerm.academic_year}_${exportTerm.term}`);
    if (exportScope === 'filtered' && selectedProfessorFilter) parts.push(selectedProfessorFilter);
    parts.push(new Date().toISOString().slice(0, 10));
    const stem = parts.join('_').replace(/[^A-Za-z0-9_\-.]/g, '_');
    return `${stem}.${EXPORT_FORMATS.find((f) => f.id === exportFormat)?.ext || 'csv'}`;
  })();

  const exportScopeName = exportScope === 'filtered' ? selectedProfessorFilter : null;

  /** Hand a Blob to the browser as a download. */
  const saveBlob = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownload = async () => {
    if (exportRows.length === 0) {
      addToast('There is nothing to export in this selection.', 'warning');
      return;
    }
    setIsExporting(true);
    try {
      if (exportFormat === 'csv') {
        // A Blob object URL, not a data: URI — see csvCell for what that fixed.
        // The BOM makes Excel read UTF-8 subject names instead of mojibake.
        saveBlob(new Blob([CSV_BOM, buildCsv(exportRows)], { type: 'text/csv;charset=utf-8;' }), exportFileName);
      } else if (exportFormat === 'word') {
        const html = buildWordHtml(exportRows, {
          title: `ATLAS Schedule — ${getDepartment() || 'Department'}`,
          subtitle: [
            exportTerm ? `${exportTerm.academic_year} ${formatSemesterTerm(exportTerm.term)}` : 'No active term',
            exportScopeName || 'All professors',
            `${exportRows.length} ${exportRows.length === 1 ? 'class' : 'classes'}`,
            `generated ${new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}`,
          ].join(' · '),
        });
        saveBlob(new Blob([CSV_BOM, html], { type: 'application/msword;charset=utf-8;' }), exportFileName);
      } else {
        // The PDF is rendered by the server, which already has reportlab. It
        // takes the same scope so the file matches the preview.
        const blob = await api.getBlob('/schedules/export/pdf', {
          params: { semester_id: activeSemesterId, faculty_name: exportScopeName || undefined },
        });
        saveBlob(blob, exportFileName);
      }
      setIsExportOpen(false);
      addToast(`Exported ${exportRows.length} ${exportRows.length === 1 ? 'class' : 'classes'} to ${exportFileName}`, 'success');
    } catch (err) {
      addToast(err.message || 'Could not build the export file.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    api.get('/semesters').then(sems => {
      const safeSems = Array.isArray(sems) ? sems : [];
      // Also kept in state on mount, not only when the Generate modal opens.
      // The print header and the export file name both name the term, and both
      // reported "no active term" on a freshly loaded page without this.
      setSemesters(safeSems);
      const active = safeSems.find(s => s.is_active);
      if (active) {
        setActiveSemesterId(active.id);
        fetchGlobalSchedules(active.id);
        fetchPublishState(active.id);
      }
    }).catch(console.error);

    fetchActiveConflicts();

    api.get('/professors').then(data => {
      const formatted = (Array.isArray(data) ? data : []).map(t => ({
        ...t,
        name: `${t.first_name} ${t.last_name}`
      }));
      setAllTeachers(formatted);
    }).catch(console.error);
    // Load once on mount; the fetchers are re-created each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * One board per professor: their week, day by day, in time order.
   *
   * Every professor in the department appears, including those the generator
   * placed nothing for. An empty week is a fact worth seeing — it is how an
   * unloaded professor becomes visible — and hiding them would make the page
   * shorter at the cost of the thing it exists to show.
   */
  const facultyBoards = React.useMemo(() => {
    const boards = new Map();

    allTeachers.forEach((t) => {
      if (t.name && t.name.trim()) boards.set(t.name, { name: t.name, classes: [] });
    });
    globalSchedules.forEach((s) => {
      const name = s.faculty_name || 'Unassigned';
      if (!boards.has(name)) boards.set(name, { name, classes: [] });
      boards.get(name).classes.push(s);
    });

    return [...boards.values()]
      .map((board) => ({
        ...board,
        hours: board.classes.reduce((n, s) => n + durationHours(s), 0),
        days: DAY_ORDER.map((day) => ({
          day,
          classes: board.classes
            .filter((s) => dayKey(s.day_of_week) === day)
            .sort((a, b) => minutesOf(a.start_time) - minutesOf(b.start_time)),
        })),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [globalSchedules, allTeachers]);

  const visibleBoards = selectedProfessorFilter
    ? facultyBoards.filter((b) => b.name === selectedProfessorFilter)
    : facultyBoards;

  const handleGenerateSubmit = async (e) => {
    e.preventDefault();
    if (!selectedGenSemester) return addToast('Select a semester', 'error');
    if (selectedGenProfessors.length === 0) return addToast('Select at least one professor', 'error');

    setIsGenerating(true);
    try {
      const res = await api.post(`/ai-scheduler/generate/${selectedGenSemester}`, {
        faculty_ids: selectedGenProfessors,
        assign_lab_rooms: assignLabRooms
      });
      setGenerationResults(res);
      addToast('Generation complete', 'success');
      fetchSchedules();
      fetchGlobalSchedules(selectedGenSemester);
      fetchActiveConflicts();
    } catch (e) {
      addToast(e.message || 'Generation failed', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const canManageSchedules = canEditSchedules();

  // A month-grid calendar (monthNames, getDaysInMonth, getFirstDayOfMonth,
  // prevMonth, nextMonth, renderCalendarDays and the `currentDate` state that
  // fed them) used to sit here. Nothing rendered any of it — this screen shows
  // a week grid — so it was ~40 lines of unreachable date arithmetic.

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
  const [subjects, setSubjects] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [formData, setFormData] = useState({
    subject_id: '',
    room_id: '',
    faculty_id: '',
    day_of_week: 'Mon',
    start_time: '07:30',
    end_time: '08:30',
    section: ''
  });

  const fetchDropdownData = async () => {
    try {
      const [subjectsData, roomsData, teachersData] = await Promise.all([
        api.get('/curriculum').catch(() => []),
        api.get('/rooms').catch(() => []),
        api.get('/professors').catch(() => [])
      ]);
      const formattedTeachers = (teachersData || []).map(t => ({
        ...t,
        name: `${t.first_name} ${t.last_name}`
      }));
      setSubjects(subjectsData || []);
      setRooms(roomsData || []);
      setTeachers(formattedTeachers);
    } catch (error) {
      console.error('Error fetching dropdown data');
      addToast('Failed to fetch required data', 'error');
    }
  };

  const handleOpenModal = () => {
    fetchDropdownData();
    setAiSuggestions([]);
    setIsModalOpen(true);
  };

  const handleGetSuggestions = async () => {
    if (!formData.subject_id) {
      addToast('Please select a subject first', 'error');
      return;
    }
    setIsFetchingSuggestions(true);
    try {
      // The API parameter is `curriculum_id`; `subject_id` was ignored and the
      // required parameter came back missing.
      const data = await api.get('/schedules/suggestions', {
        params: { curriculum_id: formData.subject_id, semester_id: activeSemesterId }
      });
      setAiSuggestions(Array.isArray(data) ? data : []);
      if (!data || data.length === 0) {
        addToast('No suggestions found. Faculty might be overloaded.', 'warning');
      } else {
        addToast('AI Suggestions generated!', 'success');
      }
    } catch (e) {
      addToast('Failed to fetch AI suggestions', 'error');
    } finally {
      setIsFetchingSuggestions(false);
    }
  };

  // Real-time conflict check
  useEffect(() => {
    if (formData.subject_id && formData.start_time) {
      const conflicts = detectConflicts({
        ...formData,
        room_name: rooms.find(r => r.id === parseInt(formData.room_id))?.name,
        teacher: teachers.find(t => t.id === parseInt(formData.faculty_id))?.name
      }, schedules);
      setFormConflicts(conflicts);
    }
  }, [formData, schedules, rooms, teachers]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!activeSemesterId) {
      addToast('No active semester found', 'error');
      return;
    }
    try {
      const submissionData = {
        semester_id: activeSemesterId,
        curriculum_id: parseInt(formData.subject_id),
        room_id: parseInt(formData.room_id),
        faculty_id: parseInt(formData.faculty_id),
        day_of_week: formData.day_of_week,
        start_time: formData.start_time,
        end_time: formData.end_time,
        section: formData.section
      };
      await api.post('/schedules', submissionData);
      fetchSchedules();
      setIsModalOpen(false);
      addToast('Schedule created successfully', 'success');
    } catch (error) {
      addToast(error.message || 'Failed to create schedule', 'error');
    }
  };

  const fetchSchedules = async () => {
    try {
      const rawData = await api.get('/schedules');
      const formattedData = Array.isArray(rawData) ? rawData.map(s => ({
        ...s,
        date: s.date ? new Date(s.date) : new Date()
      })) : [];
      setSchedules(checkScheduleIntegrity(formattedData));
    } catch (error) {
      console.error('Failed to fetch schedules', error);
      setSchedules([]);
    }
  };

  // `handleAutoResolveAll` was removed with the button that called it. It
  // looped the single-conflict resolver, which force-placed into the first free
  // room on failure, so one click could double-book a whole term and report
  // success. `handleAIGeneration` was a one-line wrapper nothing referenced.

  useEffect(() => {
    fetchSchedules();
  }, []);

  /**
   * The conflict count had two competing sources: this button counted overlaps
   * found by client-side detection, while the panel (now the lens) was fed by
   * the API's conflict table. A generator conflict — an unplaced subject, a
   * workload cap — produces no client-side overlap, so the button stayed hidden
   * while real conflicts existed. The server's record is authoritative; local
   * detection only catches grid overlaps the server has not recorded yet.
   */
  const localOverlaps = React.useMemo(
    () =>
      schedules
        .filter((s) => s.isConflicting)
        .map((s) => ({
          id: `local-${s.id}`,
          conflict_id: null,
          type: 'Unsaved Overlap',
          reason:
            'This class overlaps another in the grid. The server has not recorded it as a conflict yet.',
          curriculum: s.curriculum?.code || s.subject || 'Subject',
          faculty_name: s.faculty_name || s.teacher || 'Faculty',
          curriculum_id: s.curriculum_id ?? null,
          faculty_id: s.faculty_id ?? null,
          schedule_id_1: s.id ?? null,
          schedule_id_2: null,
          // No conflict row exists for these, so /solve-conflict has nothing to
          // act on. The lens reads this and explains instead of offering an
          // action that would fail.
          unresolvable: true,
        })),
    [schedules]
  );

  // Previously `Math.max(activeConflicts.length, localOverlapCount)`. That is
  // not a union: two server conflicts plus three *different* local overlaps are
  // five problems, reported as three. It also fed the button a number the lens
  // could not account for -- the lens received only the server list, so a count
  // driven by local overlaps opened a panel that immediately closed itself.
  // Concatenating keeps the original intent (generator conflicts the grid
  // cannot see, plus grid overlaps the server has not stored) and makes the
  // count equal to what the lens actually displays.
  const lensConflicts = React.useMemo(
    () => [...activeConflicts, ...localOverlaps],
    [activeConflicts, localOverlaps]
  );
  const activeConflictsCount = lensConflicts.length;

  useEffect(() => {
    if (isLensOpen && lensConflicts.length === 0) {
      setIsLensOpen(false);
      setLensCauseFilter(null);
    }
  }, [lensConflicts.length, isLensOpen]);

  return (
    <>
      {/* Main Content Area */}
      <main className="flex-1 max-w-full mx-auto px-6 sm:px-10 lg:px-12 py-8 w-full relative">
        
        {/* Print-only chrome. Hidden on screen; see the @media print block in
            index.css. A draft posted on a department door is the failure the
            watermark prevents (FLOW-04). */}
        <div className="print-header mb-4 pb-2">
          <div className="flex items-baseline justify-between">
            <span className="font-display text-lead">De La Salle Araneta University — ATLAS</span>
            <span className="font-ui text-caption">
              {localStorage.getItem('atlas_department') || ''} · {semesters.find(s => s.id === activeSemesterId)
                ? `A.Y. ${semesters.find(s => s.id === activeSemesterId).academic_year} ${formatSemesterTerm(semesters.find(s => s.id === activeSemesterId).term)}`
                : ''}
            </span>
          </div>
        </div>
        {publishState.status !== 'published' && (
          <div className="print-draft-watermark" aria-hidden="true">DRAFT</div>
        )}

        <div>
          {/* Publication status and the Publish control are both gone from this
              screen. Publishing is an administrator action, and administrators
              no longer reach the Schedule screen at all — so the button here was
              permanently restricted for the only people who could see it, and
              the Draft badge reported a state nobody on this screen could
              change. The printed schedule still carries its DRAFT watermark and
              footer, which is where the "this is not official yet" warning
              actually does its job. */}
          <PageHeader
            title="Schedule"
            // Counts what is on screen, not `publishState.total`. That figure
            // comes from /schedules/status, which generation never refetches —
            // so after generating, the header went on reporting the count from
            // before the run while the boards below showed the new one.
            meta={
              globalSchedules.length > 0
                ? `${pluralize(globalSchedules.length, 'class', 'classes')} across your department`
                : 'Weekly view of schedules for the professors in your department.'
            }
            actions={
              <>
                {conflictsUnavailable && (
                  // The absence of a Conflicts button normally means there are
                  // none. When the check itself failed, say so rather than let
                  // that silence be read as an all-clear.
                  <span
                    className="no-print inline-flex items-center gap-1.5 h-9 px-3 rounded-control border border-sem-warning text-sem-warning font-ui text-caption"
                    role="status"
                  >
                    <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                    Conflict check unavailable
                  </span>
                )}

                {activeConflictsCount > 0 && (
                  // Destructive-adjacent controls are outlines, not solid red
                  // fills — a red fill reads as alarm in a dense grid, and the
                  // lens is where the system is allowed to be loud.
                  <AtlasButton
                    variant="destructive"
                    icon={AlertTriangle}
                    onClick={() => setIsLensOpen(true)}
                    className="no-print"
                  >
                    {pluralize(activeConflictsCount, 'Conflict')}
                  </AtlasButton>
                )}

                <SelectInput
                  label="Faculty"
                  className="w-56 no-print"
                  value={selectedProfessorFilter}
                  onChange={(e) => setSelectedProfessorFilter(e.target.value)}
                  options={[
                    { value: '', label: 'All faculty' },
                    ...allTeachers.map((t) => ({ value: t.name, label: t.name })),
                  ]}
                />

                {canManageSchedules && (
                  <>
                    <AtlasButton
                      icon={Sparkles}
                      className="no-print"
                      onClick={() => {
                        fetchGenerateData();
                        setIsGenerateModalOpen(true);
                        setGenerationResults(null);
                      }}
                    >
                      Generate
                    </AtlasButton>
                    <AtlasButton variant="secondary" icon={Plus} onClick={handleOpenModal} className="no-print">
                      Create
                    </AtlasButton>
                    {/* One button, not a menu. The format is chosen inside the
                        dialog, next to the preview of what it will contain. */}
                    <AtlasButton variant="secondary" icon={Download} onClick={openExport} className="no-print">
                      Export
                    </AtlasButton>
                    <AtlasButton
                      variant="destructive"
                      icon={Trash2}
                      onClick={() => setIsClearConfirmOpen(true)}
                      title="Clear all schedules for this semester"
                      className="no-print"
                    >
                      Clear All
                    </AtlasButton>
                  </>
                )}
              </>
            }
          />

          {/* View switch. "By professor" is the default because it is the only
              one of the two that can show every professor's classes at once. */}
          {globalSchedules.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 no-print mb-4">
              <div className="inline-flex rounded-control glass p-1">
                {[
                  { id: 'faculty', label: 'By professor', icon: LayoutList },
                  { id: 'grid', label: 'Week grid', icon: LayoutGrid },
                ].map((v) => {
                  const Icon = v.icon;
                  const isActive = scheduleView === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setScheduleView(v.id)}
                      aria-pressed={isActive}
                      className={`h-9 px-4 rounded-field font-ui text-body flex items-center gap-2
                                  transition-colors duration-state ease-standard ${focusRing} ${
                        isActive
                          ? 'bg-white text-atlas-ink font-medium shadow-[0_1px_2px_rgb(5_48_31/0.10)]'
                          : 'text-atlas-slate hover:text-atlas-ink'
                      }`}
                    >
                      <Icon className="w-4 h-4" aria-hidden="true" />
                      {v.label}
                    </button>
                  );
                })}
              </div>
              <p className="font-ui text-caption text-atlas-slate tabular-nums">
                {pluralize(globalSchedules.length, 'class', 'classes')} ·{' '}
                {facultyBoards.filter((b) => b.classes.length > 0).length} of {facultyBoards.length} professors scheduled
              </p>
            </div>
          )}

          {/* Faculty colour legend, which doubles as the filter. */}
          {globalSchedules.length > 0 && (
            <div className="glass sheen rounded-panel surface p-4 mb-5 no-print">
              <p className="font-ui text-micro uppercase text-atlas-slate mb-2.5 flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-atlas-700" aria-hidden="true" />
                Faculty — select one to filter
              </p>
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set(globalSchedules.map(s => s.faculty_name).filter(Boolean))).map(prof => {
                  const color = getFacultyColor(prof);
                  const isSelected = selectedProfessorFilter === prof;
                  return (
                    <button
                      key={prof}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setSelectedProfessorFilter(isSelected ? '' : prof)}
                      className={`h-8 px-3 rounded-control font-ui text-table flex items-center gap-2 border
                                  transition-all duration-state ease-standard ${focusRing} ${
                        isSelected
                          ? 'bg-atlas-900 text-white border-atlas-900 font-medium'
                          : `${color.bg} ${color.border} ${color.text} hover:-translate-y-px`
                      }`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isSelected ? 'bg-white' : color.dot}`} />
                      <span>{prof}</span>
                    </button>
                  );
                })}
                {selectedProfessorFilter && (
                  <AtlasButton size="row" variant="ghost" onClick={() => setSelectedProfessorFilter('')}>
                    Clear filter
                  </AtlasButton>
                )}
              </div>
            </div>
          )}

          {isGlobalLoading ? (
            <div className="flex justify-center py-20"><Sparkles className="w-8 h-8 text-indigo-400 animate-spin" /></div>
          ) : scheduleView === 'faculty' ? (
            <div className="print-grid mt-8 flex flex-col gap-8">
              {visibleBoards.length === 0 && (
                <div className="glass sheen rounded-panel surface p-16 text-center">
                  <h3 className="font-display text-section text-atlas-ink">Nothing scheduled yet.</h3>
                  <p className="mt-2 font-ui text-body text-atlas-slate">
                    Generate the timetable, or add a class manually, and every professor&apos;s week appears here.
                  </p>
                </div>
              )}

              {visibleBoards.map((board) => {
                const color = getFacultyColor(board.name);
                const hasClasses = board.classes.length > 0;

                return (
                  <section
                    key={board.name}
                    aria-label={`Schedule for ${board.name}`}
                    className="glass sheen rounded-panel surface overflow-hidden break-inside-avoid rise"
                  >
                    <header className="flex flex-wrap items-center justify-between gap-3 px-7 py-5 border-b border-slate-100 bg-slate-50/60">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`w-3.5 h-3.5 rounded-full shrink-0 ${color.dot}`} aria-hidden="true" />
                        <h3 className="font-ui text-lead text-atlas-ink truncate">
                          {board.name}
                        </h3>
                      </div>
                      <p className="font-ui text-caption text-atlas-slate tabular-nums">
                        {hasClasses
                          ? `${board.classes.length} ${board.classes.length === 1 ? 'class' : 'classes'} · ${board.hours % 1 === 0 ? board.hours : board.hours.toFixed(1)} hrs / week`
                          : 'No classes scheduled'}
                      </p>
                    </header>

                    {hasClasses ? (
                      /* Six day columns that reflow rather than scroll sideways.
                         Classes stack in time order, so two at the same hour sit
                         one below the other instead of one behind the other. */
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-px bg-slate-100">
                        {board.days.map(({ day, classes }) => (
                          <div key={day} className="bg-white/60 p-4 flex flex-col gap-3 min-h-[7rem]">
                            <h4 className="font-ui text-micro uppercase text-atlas-slate text-center py-2 bg-atlas-canvas rounded-field">
                              <abbr title={DAY_LABEL[day]} className="no-underline">{day}</abbr>
                            </h4>

                            {classes.length === 0 ? (
                              <p className="font-ui text-caption text-atlas-disabled text-center py-4">No classes</p>
                            ) : (
                              classes.map((sched) => {
                                const inConflict = conflictedCurriculumIds.has(sched.curriculum_id);
                                return (
                                  <ClassCard
                                    key={sched.id}
                                    sched={sched}
                                    color={color}
                                    dayLabel={DAY_LABEL[day]}
                                    lensDim={isLensOpen && !inConflict}
                                    lensLit={isLensOpen && inConflict}
                                    canManage={canManageSchedules}
                                    onDelete={handleDeleteSchedule}
                                  />
                                );
                              })
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="px-7 py-10 text-center text-sm font-semibold text-slate-400">
                        The generator placed no classes for {board.name} this term.
                      </p>
                    )}
                  </section>
                );
              })}
            </div>
          ) : (
            /* The scroll container and the wide content must be separate elements:
               `overflow-x-auto` and `min-w-[900px]` on the same div meant the div
               grew to 900px and overflowed its parent instead of scrolling. */
            <div className="print-grid relative mt-12 overflow-x-auto pb-8">
            <div className="flex relative min-w-[900px]">
              {/* Time column (7:30 AM to 7:30 PM - 12 hours) */}
              <div className="w-20 flex flex-col relative border-r border-slate-200 pr-4 shrink-0" style={{ height: '1400px' }}>
                {Array.from({length: 13}).map((_, i) => (
                  <div key={i} className="absolute w-full text-right font-data text-caption text-atlas-slate" style={{ top: `${(i/12)*100}%`, transform: 'translateY(-50%)' }}>
                    {(() => {
                      const hr = Math.floor(7.5 + i);
                      const min = (7.5 + i) % 1 === 0 ? '30' : '00';
                      return `${hr % 12 || 12}:${min} ${hr >= 12 ? 'PM' : 'AM'}`;
                    })()}
                  </div>
                ))}
              </div>
              
              {/* Days columns */}
              <div className="flex-1 flex relative" style={{ height: '1400px' }}>
                {/* Grid lines */}
                {Array.from({length: 13}).map((_, i) => (
                  <div key={`line-${i}`} className="absolute w-full border-t border-slate-200/80 border-dashed" style={{ top: `${(i/12)*100}%` }} />
                ))}
                
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => {
                  let dayScheds = globalSchedules.filter(s => s.day_of_week === day || s.day_of_week === day.substring(0,3));
                  if (selectedProfessorFilter) {
                      dayScheds = dayScheds.filter(s => s.faculty_name === selectedProfessorFilter);
                  }

                  return (
                    <div key={day} className="flex-1 relative border-r border-slate-200 last:border-r-0 min-w-[140px]">
                      <div className="absolute -top-10 w-full text-center font-ui text-micro uppercase text-atlas-slate bg-atlas-canvas py-1.5 rounded-field border border-atlas-line">{day}</div>
                      {dayScheds.map(sched => {
                        const [h, m] = sched.start_time.split(':').map(Number);
                        const [eh, em] = sched.end_time.split(':').map(Number);
                        const start = h + m / 60;
                        const end = eh + em / 60;
                        if (start < 7.5 || start > 19.5) return null;
                        const top = ((start - 7.5) / 12) * 100;
                        const height = Math.max(((end - start) / 12) * 100, 6.5);
                        
                        const color = getFacultyColor(sched.faculty_name);

                        // While the lens is active only conflicting blocks stay
                        // lit and reachable. Dimmed blocks leave the tab order
                        // and the accessibility tree so AT users are not walked
                        // through 60 irrelevant classes to find 7.
                        const inConflict = conflictedCurriculumIds.has(sched.curriculum_id);
                        const lensDim = isLensOpen && !inConflict;
                        const lensLit = isLensOpen && inConflict;

                        const blockLabel =
                          `${formatSubjectCode(sched)}, ${sched.subject_name}, ` +
                          `${sched.faculty_name}, ${sched.room_name || 'no room'}, ` +
                          `${day} ${sched.start_time} to ${sched.end_time}` +
                          (canManageSchedules ? '. Press Delete to remove this class.' : '');

                        return (
                          // A11Y-02: these were plain divs with cursor-default.
                          // tabIndex in this file was 0 and onKeyDown was 0
                          // app-wide, so the product's primary work surface
                          // could not be reached, read or edited without a
                          // mouse. Now each class is a real control with a
                          // spoken name and a keyboard action.
                          <div
                            key={sched.id}
                            role="button"
                            tabIndex={lensDim ? -1 : 0}
                            aria-hidden={lensDim || undefined}
                            aria-label={blockLabel}
                            onKeyDown={(e) => {
                              if ((e.key === 'Delete' || e.key === 'Backspace') && canManageSchedules) {
                                e.preventDefault();
                                handleDeleteSchedule(sched);
                              }
                            }}
                            className={`print-block absolute w-[calc(100%-10px)] mx-[5px] rounded-2xl border shadow-xs flex flex-col overflow-hidden transition-all hover:scale-[1.02] hover:z-30 hover:shadow-2xl group border-l-[6px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atlas-700 focus-visible:ring-offset-2 focus-visible:z-30 ${lensDim ? 'lens-dimmed' : ''} ${lensLit ? 'lens-conflict' : ''} ${color.bg} ${color.border} ${color.accent}`}
                            style={{ top: `${top}%`, height: `${height}%` }}
                          >
                            {lensLit && (
                              <span
                                className="absolute top-1 right-1 z-10 text-sem-conflict font-bold text-sm leading-none"
                                aria-hidden="true"
                              >
                                ▲
                              </span>
                            )}
                            <div className="px-3 py-1.5 bg-white/70 backdrop-blur-xs border-b border-black/5 flex justify-between items-center shrink-0">
                              <span className="font-data text-caption text-atlas-ink">{formatSubjectCode(sched)}</span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-extrabold text-slate-600">{(() => {
                                  const formatT = (t) => {
                                    if (!t) return '';
                                    const [h,m] = t.split(':'); 
                                    const hr = parseInt(h); 
                                    return `${hr%12||12}:${m}${hr>=12?'PM':'AM'}`;
                                  };
                                  return `${formatT(sched.start_time)}-${formatT(sched.end_time)}`;
                                })()}</span>
                                {canManageSchedules && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteSchedule(sched);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-0.5 text-rose-600 hover:bg-rose-100 rounded transition-all"
                                    title="Delete this schedule"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="p-3 flex flex-col flex-1 justify-between gap-1 overflow-y-auto">
                              <div className="font-ui text-table leading-snug text-atlas-ink" title={sched.subject_name}>
                                {sched.subject_name}
                              </div>
                              <div className="pt-1 border-t border-black/5 space-y-1">
                                <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                  <User className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                  <span className="truncate">{sched.faculty_name}</span>
                                </div>
                                <div className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                                  <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  <span className="truncate">{sched.room_name || '—'}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
            </div>
          )}
        </div>
        <div className="print-footer mt-4 pt-2 font-ui text-caption">
          Generated {new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
          {' · '}
          {publishState.status === 'published'
            ? `Published by ${localStorage.getItem('atlas_user_name') || 'System Administrator'}`
            : 'Draft — not an official schedule'}
        </div>
      </main>

      {/* The publish confirmation dialog was removed with the button that was
          its only opener. The backend rule is unchanged: PATCH
          /schedules/status is still administrator-only. */}

      {/* Replaces the ConflictPanel slide-over, which sat physically apart from
          the grid so resolving a conflict meant reading a description and then
          hunting for the block it referred to (HEU-08). */}
      <ConflictLens
        isOpen={isLensOpen}
        conflicts={lensConflicts}
        onClose={() => { setIsLensOpen(false); setLensCauseFilter(null); }}
        onResolve={handleSolveConflict}
        onRegenerate={() => { setIsLensOpen(false); setIsGenerateModalOpen(true); }}
        resolvingId={resolvingId}
        causeFilter={lensCauseFilter}
        onFilterCause={setLensCauseFilter}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create New Schedule"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formConflicts.length > 0 && (
            <div className="bg-red-50 border-l-4 border-red-500 p-3 flex items-start">
              <AlertTriangle className="w-5 h-5 text-red-600 mr-3 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-red-800">Potential Conflict Detected!</p>
                <p className="text-[11px] text-red-700 mt-0.5">
                  This time slot overlaps with another class in the same {formConflicts[0].type.toLowerCase()}.
                </p>
              </div>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700">Subject</label>
            <select
              required
              className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm"
              value={formData.subject_id}
              onChange={(e) => setFormData({ ...formData, subject_id: e.target.value })}
            >
              <option value="">Select Subject</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.code} - {s.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Professor</label>
              <select
                required
                className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm"
                value={formData.faculty_id}
                onChange={(e) => setFormData({ ...formData, faculty_id: e.target.value })}
              >
                <option value="">Select Professor</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Room (Optional for Lectures)</label>
              <select
                className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm"
                value={formData.room_id}
                onChange={(e) => setFormData({ ...formData, room_id: e.target.value })}
              >
                <option value="">No Room (Lecture / N/A)</option>
                {rooms.map(r => <option key={r.id} value={r.id}>{r.name} ({r.building}) - {r.type}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Day</label>
              <select
                required
                className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm"
                value={formData.day_of_week}
                onChange={(e) => setFormData({ ...formData, day_of_week: e.target.value })}
              >
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Start Time</label>
              <input
                type="time"
                required
                className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm"
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">End Time</label>
              <input
                type="time"
                required
                className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm"
                value={formData.end_time}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
              />
            </div>
          </div>

          <div className="pt-4 flex justify-between items-center">
            <button
              type="button"
              onClick={handleGetSuggestions}
              disabled={isFetchingSuggestions}
              className="px-4 py-2 text-sm font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-md shadow-sm flex items-center transition-colors disabled:opacity-50"
            >
              <Sparkles className={`w-4 h-4 mr-2 ${isFetchingSuggestions ? 'animate-spin' : ''}`} />
              {isFetchingSuggestions ? 'Analyzing...' : 'Get AI Suggestions'}
            </button>
            <div className="flex space-x-3">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 border border-gray-300 rounded-md shadow-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`px-4 py-2 text-sm font-medium text-white rounded-md shadow-sm ${formConflicts.length > 0 ? 'bg-orange-600 hover:bg-orange-700' : 'bg-green-700 hover:bg-green-800'
                  }`}
              >
                {formConflicts.length > 0 ? 'Save Anyway' : 'Save Schedule'}
              </button>
            </div>
          </div>

          {/* AI Suggestions Panel */}
          {aiSuggestions.length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center">
                <Sparkles className="w-4 h-4 text-indigo-500 mr-2" />
                Recommended Assignments
              </h4>
              <div className="space-y-3">
                {aiSuggestions.map((sug, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-indigo-50/50 border border-indigo-100 rounded-lg hover:border-indigo-300 transition-colors">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{sug.faculty_name} <span className="text-xs font-normal text-slate-500 ml-1">in {sug.room_name}</span></p>
                      <p className="text-xs font-medium text-indigo-600 mt-0.5">{sug.day_of_week} • {sug.start_time} - {sug.end_time} • {sug.confidence}% Match</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormData({
                        ...formData,
                        faculty_id: sug.faculty_id.toString(),
                        room_id: sug.room_id.toString(),
                        day_of_week: sug.day_of_week,
                        start_time: sug.start_time,
                        end_time: sug.end_time
                      })}
                      className="px-3 py-1.5 bg-white text-indigo-600 border border-indigo-200 text-xs font-bold rounded shadow-sm hover:bg-indigo-50"
                    >
                      Apply
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>
      </Modal>

      <Modal
        isOpen={isGenerateModalOpen}
        onClose={() => setIsGenerateModalOpen(false)}
        title="AI Schedule Generation"
      >
        <form onSubmit={handleGenerateSubmit} className="space-y-6">
          {!generationResults ? (
            <>
              <div>
                <p className="font-ui text-micro uppercase text-atlas-slate mb-2">Academic term</p>
                {(() => {
                  const activeSem = semesters.find(s => s.is_active) || (selectedGenSemester ? semesters.find(s => s.id === Number(selectedGenSemester)) : null);
                  return (
                    <div className="p-4 rounded-panel bg-atlas-100/70 border border-atlas-700/20 flex items-center justify-between gap-3">
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
                  );
                })()}
              </div>

              {/* Rooms. Asked before generating because it changes what the
                  generator will refuse: with this on, a laboratory with no free
                  room comes back unplaced; with it off, laboratories are placed
                  on faculty availability alone and the room is settled
                  elsewhere. Lecture subjects are never given a room either way,
                  which the copy says outright rather than leaving to be
                  discovered in the results. */}
              <fieldset>
                <legend className="font-ui text-micro uppercase text-atlas-slate mb-2">
                  Laboratory rooms
                </legend>
                <label
                  className={`flex items-start gap-3 p-4 rounded-panel border cursor-pointer
                              transition-colors duration-state ease-standard ${
                    assignLabRooms
                      ? 'bg-atlas-100/70 border-atlas-700/25'
                      : 'glass hover:bg-white/90'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={assignLabRooms}
                    onChange={(e) => setAssignLabRooms(e.target.checked)}
                    className={`mt-0.5 w-4 h-4 shrink-0 accent-[var(--atlas-green-700)] ${focusRing}`}
                  />
                  <span className="min-w-0">
                    <span className="block font-ui text-body text-atlas-ink">
                      Assign rooms to laboratory subjects
                    </span>
                    <span className="block font-ui text-caption text-atlas-slate mt-1">
                      {assignLabRooms
                        ? 'Each laboratory is placed in a free laboratory or computer laboratory room. A laboratory with no free room is reported as unplaced.'
                        : 'Laboratories are scheduled without a room, so none is reserved and none can clash. Use this when rooms are assigned outside ATLAS.'}
                    </span>
                    <span className="block font-ui text-caption text-atlas-disabled mt-1.5">
                      Lecture subjects are never assigned a room.
                    </span>
                  </span>
                </label>
              </fieldset>

              <fieldset>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <legend className="font-ui text-micro uppercase text-atlas-slate">
                    Professors to schedule
                  </legend>
                  <AtlasButton
                    size="row"
                    variant="ghost"
                    onClick={() => setSelectedGenProfessors(
                      selectedGenProfessors.length === allTeachers.length ? [] : allTeachers.map(t => t.id)
                    )}
                  >
                    {selectedGenProfessors.length === allTeachers.length ? 'Clear all' : 'Select all'}
                  </AtlasButton>
                </div>
                <div className="rounded-panel border border-atlas-line max-h-60 overflow-y-auto divide-y divide-atlas-line">
                  {allTeachers.map(prof => {
                    const checked = selectedGenProfessors.includes(prof.id);
                    return (
                      <label
                        key={prof.id}
                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer
                                    transition-colors duration-state ease-standard ${
                          checked ? 'bg-atlas-100/60' : 'hover:bg-atlas-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedGenProfessors([...selectedGenProfessors, prof.id]);
                            else setSelectedGenProfessors(selectedGenProfessors.filter(id => id !== prof.id));
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

              <div className="pt-5 flex justify-end items-center gap-3 border-t border-white/45">
                <AtlasButton variant="ghost" onClick={() => setIsGenerateModalOpen(false)} disabled={isGenerating}>
                  Cancel
                </AtlasButton>
                <AtlasButton type="submit" icon={Sparkles} loading={isGenerating}>
                  {isGenerating ? 'Generating…' : 'Generate Schedule'}
                </AtlasButton>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-5 rise">
              {/* The three outcomes, side by side, so "12 generated" is not read
                  without "3 unplaced" beside it. */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Generated', value: generationResults.generated, tone: 'good' },
                  { label: 'Unplaced', value: generationResults.unplaced_count,
                    tone: generationResults.unplaced_count > 0 ? 'conflict' : 'default' },
                  { label: 'Skipped GenEd', value: generationResults.skipped_gened, tone: 'default' },
                ].map((s) => (
                  <div key={s.label} className="glass sheen rounded-panel surface px-4 py-3.5 text-center">
                    <p className="font-ui text-micro uppercase text-atlas-slate">{s.label}</p>
                    <p className={`font-display text-page tabular-nums mt-1 leading-none ${
                      s.tone === 'good' ? 'text-atlas-700'
                      : s.tone === 'conflict' ? 'text-sem-conflict'
                      : 'text-atlas-ink'
                    }`}>
                      {s.value}
                    </p>
                  </div>
                ))}
              </div>

              {generationResults.unplaced_items?.length > 0 && (
                <div>
                  {/* The second "Auto-Solve All" was here. Same removal
                      reasoning as the panel's: it looped a resolver that
                      force-placed on failure, so one click could double-book
                      an entire term and report success. Unplaced subjects are
                      resolved one at a time below. */}
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
                          onClick={() => handleSolveConflict(item)}
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
                  onClick={() => {
                    setIsGenerateModalOpen(false);
                    setGenerationResults(null);
                  }}
                  className="h-10 px-4 rounded-control glass font-ui font-medium text-body text-atlas-700 hover:bg-white/90 transition-colors duration-state ease-standard"
                >
                  Close & View Schedule
                </button>
              </div>
            </div>
          )}
        </form>
      </Modal>
      {/* Export preview. Everything the file will contain, before it is written:
          the same rows, the same columns, in the same order. */}
      <Modal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        title="Export Schedule"
        maxWidth="max-w-5xl"
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200/70">
            <div className="min-w-0">
              <p className="font-ui text-micro uppercase text-atlas-slate">File</p>
              <p className="font-data text-table text-atlas-ink mt-1 break-all">{exportFileName}</p>
              <p className="text-xs font-bold text-slate-500 mt-1">
                {EXPORT_FORMATS.find((f) => f.id === exportFormat)?.sub}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-ui text-micro uppercase text-atlas-slate">Rows</p>
              <p className="font-display text-section text-atlas-ink tabular-nums">{exportRows.length}</p>
              <p className="text-xs font-bold text-slate-500">
                {exportTerm
                  ? `${exportTerm.academic_year} ${formatSemesterTerm(exportTerm.term)}`
                  : 'No active term'}
              </p>
            </div>
          </div>

          <fieldset>
            <legend className="font-ui text-micro uppercase text-atlas-slate mb-2">
              Save as
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {EXPORT_FORMATS.map((f) => (
                <label
                  key={f.id}
                  className={`flex items-start gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${
                    exportFormat === f.id
                      ? 'bg-emerald-50/70 border-emerald-200'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="export-format"
                    className="sr-only"
                    checked={exportFormat === f.id}
                    onChange={() => setExportFormat(f.id)}
                  />
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 w-4 h-4 rounded-full border-4 shrink-0 transition-all ${
                      exportFormat === f.id ? 'border-green-600 bg-white' : 'border-slate-200 bg-white'
                    }`}
                  />
                  <span className="min-w-0">
                    <span className="block font-ui text-body text-atlas-ink">{f.label}</span>
                    <span className="block text-[11px] font-bold text-slate-500 leading-snug mt-0.5">{f.sub}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Scope is only a question when a filter is already narrowing the
              screen. Otherwise there is one honest answer and no control. */}
          {selectedProfessorFilter ? (
            <fieldset>
              <legend className="font-ui text-micro uppercase text-atlas-slate mb-2">
                What to include
              </legend>
              <div className="flex flex-col sm:flex-row gap-2">
                {[
                  { id: 'filtered', label: selectedProfessorFilter, count: globalSchedules.filter((s) => s.faculty_name === selectedProfessorFilter).length },
                  { id: 'all', label: 'All professors', count: globalSchedules.length },
                ].map((opt) => (
                  <label
                    key={opt.id}
                    className={`flex-1 flex items-center gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${
                      exportScope === opt.id
                        ? 'bg-emerald-50/70 border-emerald-200'
                        : 'bg-white border-slate-200 hover:border-slate-300'
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
                      className={`w-4 h-4 rounded-full border-4 shrink-0 transition-all ${
                        exportScope === opt.id ? 'border-green-600 bg-white' : 'border-slate-200 bg-white'
                      }`}
                    />
                    <span className="min-w-0">
                      <span className="block font-ui text-body text-atlas-ink truncate">{opt.label}</span>
                      <span className="block text-[11px] font-bold text-slate-500 tabular-nums">
                        {opt.count} {opt.count === 1 ? 'class' : 'classes'}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <p className="text-xs font-bold text-slate-500">
              Every professor in your department is included.
            </p>
          )}

          <div>
            <p className="font-ui text-micro uppercase text-atlas-slate mb-2">
              Preview — {exportRows.length} {exportRows.length === 1 ? 'row' : 'rows'} in the file
            </p>
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <div className="max-h-[45vh] overflow-auto">
                <table className="w-full text-left border-collapse">
                  <caption className="sr-only">
                    Preview of the exported schedule, {exportRows.length} rows
                  </caption>
                  <thead className="sticky top-0 bg-slate-50 z-10">
                    <tr>
                      {EXPORT_COLUMNS.map((col) => (
                        <th
                          key={col.key}
                          scope="col"
                          className="px-4 py-3 font-ui text-micro uppercase text-atlas-slate whitespace-nowrap border-b border-atlas-line"
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {exportRows.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/80">
                        {EXPORT_COLUMNS.map((col) => (
                          <td
                            key={col.key}
                            className="px-4 py-2.5 text-xs font-semibold text-slate-700 whitespace-nowrap"
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
                <p className="p-8 text-center text-sm font-bold text-slate-400">
                  Nothing to export in this selection.
                </p>
              )}
            </div>
          </div>

          <div className="pt-4 flex justify-end items-center gap-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsExportOpen(false)}
              className="h-10 px-4 rounded-control font-ui font-medium text-body text-atlas-slate hover:text-atlas-ink transition-colors duration-state ease-standard"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={exportRows.length === 0 || isExporting}
              className="h-10 px-5 rounded-control font-ui font-medium text-body text-white bg-atlas-700 hover:bg-atlas-800 transition-colors duration-state ease-standard disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Download className={`w-4 h-4 ${isExporting ? 'animate-pulse' : ''}`} />
              {isExporting ? 'Preparing…' : `Download ${EXPORT_FORMATS.find((f) => f.id === exportFormat)?.ext.toUpperCase()}`}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isClearConfirmOpen}
        onClose={() => setIsClearConfirmOpen(false)}
        title="Clear All Schedules"
      >
        <div className="space-y-4">
          <p className="text-sm font-bold text-slate-700">
            Are you sure you want to delete all generated schedules for this semester?
          </p>
          <p className="text-xs text-slate-500 font-medium">
            You will be able to restore them immediately using the Undo button after clearing.
          </p>
          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsClearConfirmOpen(false)}
              className="h-10 px-4 rounded-control font-ui font-medium text-body text-atlas-slate hover:text-atlas-ink transition-colors duration-state ease-standard"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleClearAllSchedules}
              className="h-10 px-4 rounded-control glass font-ui font-medium text-body text-sem-conflict !border-sem-conflict/40 hover:bg-sem-conflict-bg/80 transition-colors duration-state ease-standard"
            >
              Yes, Clear All
            </button>
          </div>
        </div>
      </Modal>

      {undoBackup && (
        <div className="fixed bottom-6 right-6 z-[250] bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-5 duration-300 border border-slate-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <span className="text-sm font-bold">{undoBackup.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRestoreSchedules}
              className="h-9 px-4 rounded-control font-ui font-medium text-table text-atlas-900 bg-white hover:bg-atlas-100 transition-colors duration-state ease-standard flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Undo / Restore
            </button>
            <button
              type="button"
              onClick={() => setUndoBackup(null)}
              className="text-slate-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
