import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, AlertTriangle, Sparkles, MapPin, User, Trash2, RotateCcw, X, Download, LayoutGrid, LayoutList, FileText, FileSpreadsheet, Table as TableIcon, Clock, Calendar, ChevronDown, Check } from 'lucide-react';
import Modal from '../../components/Modal';
import AtlasDialog from '../../components/ui/Dialog';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';
import { detectConflicts, checkScheduleIntegrity } from '../../utils/conflictDetection';
import AtlasButton from '../../components/ui/Button';
import ConflictLens from '../../components/ui/ConflictLens';
// Badge, ConfirmDialog, restrictionReason and the admin check left with the
// publish control — they had no other consumer on this screen.
import Badge from '../../components/ui/Badge';
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

/**
 * Faculty identity colours — Uxintace Palette Design System
 * (#0F2A1D, #375534, #6B9071, #AEC3B0, #E3EED4).
 *
 * Each variant provides a harmonious palette configuration matching the modern
 * timetable card UI (solid left accent strip, pastel background fill, dark header text,
 * and accent-tinted time label).
 */
const FACULTY_COLOR_PALETTES = [
  {
    name: 'deep-pine',
    accent: '#0F2A1D',
    bg: '#EAF0EB',
    border: 'rgba(15, 42, 29, 0.22)',
    title: '#0F2A1D',
    time: '#2B4D39',
    meta: '#446450',
    dot: 'bg-[#0F2A1D]',
    badgeBg: '#DCE8DE',
    badgeText: '#0F2A1D',
    text: 'text-[#0F2A1D]',
  },
  {
    name: 'hunter-green',
    accent: '#375534',
    bg: '#E7EFE5',
    border: 'rgba(55, 85, 52, 0.22)',
    title: '#1B3618',
    time: '#375534',
    meta: '#4D6B4A',
    dot: 'bg-[#375534]',
    badgeBg: '#D9E8D6',
    badgeText: '#1B3618',
    text: 'text-[#1B3618]',
  },
  {
    name: 'sage-green',
    accent: '#6B9071',
    bg: '#EFF5EE',
    border: 'rgba(107, 144, 113, 0.25)',
    title: '#1D3B24',
    time: '#4F7556',
    meta: '#5A8062',
    dot: 'bg-[#6B9071]',
    badgeBg: '#E0EDE0',
    badgeText: '#1D3B24',
    text: 'text-[#1D3B24]',
  },
  {
    name: 'soft-pistachio',
    accent: '#476949',
    bg: '#E3EED4',
    border: 'rgba(71, 105, 73, 0.22)',
    title: '#1A331C',
    time: '#375534',
    meta: '#4E6C4F',
    dot: 'bg-[#476949]',
    badgeBg: '#D5E4C3',
    badgeText: '#1A331C',
    text: 'text-[#1A331C]',
  },
  {
    name: 'light-celadon',
    accent: '#527A5F',
    bg: '#E8F2EC',
    border: 'rgba(82, 122, 95, 0.22)',
    title: '#133521',
    time: '#3D654D',
    meta: '#4F775F',
    dot: 'bg-[#527A5F]',
    badgeBg: '#DAEAE0',
    badgeText: '#133521',
    text: 'text-[#133521]',
  },
  {
    name: 'olive-moss',
    accent: '#4A5E33',
    bg: '#EFF3E8',
    border: 'rgba(74, 94, 51, 0.22)',
    title: '#1E2C11',
    time: '#4A5E33',
    meta: '#5E7245',
    dot: 'bg-[#4A5E33]',
    badgeBg: '#E2EAC7',
    badgeText: '#1E2C11',
    text: 'text-[#1E2C11]',
  },
  {
    name: 'dark-spruce',
    accent: '#1F4332',
    bg: '#E5ECE7',
    border: 'rgba(31, 67, 50, 0.22)',
    title: '#0E271C',
    time: '#2B5541',
    meta: '#426B57',
    dot: 'bg-[#1F4332]',
    badgeBg: '#D4E2D8',
    badgeText: '#0E271C',
    text: 'text-[#0E271C]',
  },
  {
    name: 'eucalyptus',
    accent: '#3E6652',
    bg: '#E9F2ED',
    border: 'rgba(62, 102, 82, 0.22)',
    title: '#163828',
    time: '#3E6652',
    meta: '#527A66',
    dot: 'bg-[#3E6652]',
    badgeBg: '#DAE9E0',
    badgeText: '#163828',
    text: 'text-[#163828]',
  },
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

/**
 * Standard Academic Periods for the Structured Timetable Matrix.
 * Covers 7:30 AM to 7:30 PM with clean institutional slot thresholds.
 */
const ACADEMIC_PERIODS = [
  { id: 'p1', num: '1', title: 'Period 1', time: '07:30 – 09:00', thresholdStart: 0, thresholdEnd: 525 },
  { id: 'p2', num: '2', title: 'Period 2', time: '09:00 – 10:30', thresholdStart: 525, thresholdEnd: 605 },
  { id: 'p3', num: '3', title: 'Period 3', time: '10:30 – 12:00', thresholdStart: 605, thresholdEnd: 685 },
  { id: 'p4', num: '4', title: 'Midday', time: '12:00 – 01:30', thresholdStart: 685, thresholdEnd: 795, isMidday: true },
  { id: 'p5', num: '5', title: 'Period 5', time: '01:30 – 03:00', thresholdStart: 795, thresholdEnd: 885 },
  { id: 'p6', num: '6', title: 'Period 6', time: '03:00 – 04:30', thresholdStart: 885, thresholdEnd: 975 },
  { id: 'p7', num: '7', title: 'Period 7', time: '04:30 – 06:00', thresholdStart: 975, thresholdEnd: 1055 },
  { id: 'p8', num: '8', title: 'Period 8', time: '06:00 – 07:30', thresholdStart: 1055, thresholdEnd: 1440 },
];

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
    const isLec = sched.part_type === 'lecture';
    return isLec ? `${baseCode}A` : `${baseCode}B`;
  }
  return rawCode;
};

const isLabSession = (sched) => {
  if (!sched) return false;
  if (sched.part_type === 'lab') return true;
  if (sched.curriculum?.type === 'lab') return true;
  const rawCode = sched.subject_code || sched.code || sched.curriculum?.code || '';
  if (rawCode.toUpperCase().endsWith('B')) return true;
  const dur = durationHours(sched);
  if (dur >= 2.0 && sched.curriculum?.lab_units > 0) return true;
  return false;
};


/**
 * Calculates column positions and widths for overlapping timetable events
 * so simultaneous classes sit side-by-side cleanly without obscuring each other.
 */
const computeEventLayout = (scheds) => {
  if (!scheds || scheds.length === 0) return new Map();

  const sorted = [...scheds].sort((a, b) => {
    const startA = minutesOf(a.start_time);
    const startB = minutesOf(b.start_time);
    if (startA !== startB) return startA - startB;
    return (minutesOf(b.end_time) - startB) - (minutesOf(a.end_time) - startA);
  });

  const layout = new Map();
  const clusters = [];
  let currentCluster = [];
  let clusterEnd = -1;

  for (const item of sorted) {
    const start = minutesOf(item.start_time);
    const end = minutesOf(item.end_time);

    if (start < clusterEnd) {
      currentCluster.push(item);
      clusterEnd = Math.max(clusterEnd, end);
    } else {
      if (currentCluster.length > 0) clusters.push(currentCluster);
      currentCluster = [item];
      clusterEnd = end;
    }
  }
  if (currentCluster.length > 0) clusters.push(currentCluster);

  for (const cluster of clusters) {
    const cols = [];
    for (const item of cluster) {
      const start = minutesOf(item.start_time);
      let placed = false;
      for (let c = 0; c < cols.length; c++) {
        if (cols[c] <= start) {
          cols[c] = minutesOf(item.end_time);
          layout.set(item.id, { colIndex: c, totalCols: 1 });
          placed = true;
          break;
        }
      }
      if (!placed) {
        layout.set(item.id, { colIndex: cols.length, totalCols: 1 });
        cols.push(minutesOf(item.end_time));
      }
    }
    const totalCols = Math.max(1, cols.length);
    for (const item of cluster) {
      const curr = layout.get(item.id);
      if (curr) curr.totalCols = totalCols;
    }
  }

  return layout;
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
  { key: 'section', label: 'Section', value: (s) => s.section || '—' },
  { key: 'day', label: 'Day', value: (s) => DAY_LABEL[dayKey(s.day_of_week)] || s.day_of_week || '' },
  { key: 'start', label: 'Start Time', value: (s) => to12h(s.start_time) },
  { key: 'end', label: 'End Time', value: (s) => to12h(s.end_time) },
];

/**
 * Official Excel export format.
 */
const EXPORT_FORMATS = [
  {
    id: 'excel',
    ext: 'xlsx',
    label: 'Excel Workbook',
    tag: 'Official Format',
    tagClass: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
    iconColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    icon: FileSpreadsheet,
    sub: 'Styled .xlsx spreadsheet with green header, auto-fit columns & frozen panes',
  },
];

const htmlEscape = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * A Word document, built as HTML with institutional DLSAU styling.
 */
const buildWordHtml = (rows, opts = {}) => {
  const dept = opts.dept || opts.title || (getDepartment() || 'All Departments');
  const term = opts.term || 'Active Term';
  const scope = opts.scope || 'All Faculty Members';
  const dateStr = opts.dateStr || new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });

  return `
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
<style>
  @page { size: 29.7cm 21cm; margin: 1.2cm 1.5cm; mso-page-orientation: landscape; }
  body { font-family: 'Segoe UI', Calibri, Arial, sans-serif; font-size: 9.5pt; color: #0f172a; margin: 0; padding: 0; }
  
  .banner { background-color: #05301F; color: #ffffff; padding: 14pt 18pt; border-bottom: 3.5pt solid #C8A227; margin-bottom: 12pt; }
  .univ-title { font-size: 10pt; font-weight: bold; letter-spacing: 1.5pt; text-transform: uppercase; color: #C8A227; margin: 0 0 3pt; }
  .doc-title { font-size: 16pt; font-weight: bold; color: #ffffff; margin: 0 0 3pt; }
  .sub-title { font-size: 8.5pt; color: #D0DFD6; margin: 0; }

  .summary-bar { width: 100%; border-collapse: collapse; margin-bottom: 12pt; background: #F2F7F4; border: 1pt solid #C8D9CF; }
  .summary-bar td { padding: 6pt 10pt; font-size: 8.5pt; color: #1E293B; border-right: 1pt solid #DDE7E1; vertical-align: middle; }
  .summary-bar td:last-child { border-right: none; }
  .summary-label { font-weight: bold; color: #05301F; }

  table.data-table { border-collapse: collapse; width: 100%; margin-bottom: 18pt; }
  table.data-table th, table.data-table td { border: 0.5pt solid #D5DFD9; padding: 5.5pt 6.5pt; font-size: 8.5pt; vertical-align: top; }
  table.data-table th { background: #05301F; color: #ffffff; font-weight: bold; font-size: 8pt; text-transform: uppercase; border-bottom: 2pt solid #C8A227; text-align: center; }
  table.data-table th.left, table.data-table td.left { text-align: left; }
  table.data-table th.center, table.data-table td.center { text-align: center; }
  table.data-table tr.alt td { background: #F4F8F5; }
  .prof-name { font-weight: bold; color: #0F172A; }
  .subj-code { font-weight: bold; color: #05301F; }
  
  .signatures { width: 100%; border-collapse: collapse; margin-top: 24pt; page-break-inside: avoid; }
  .signatures td { width: 50%; padding: 10pt 24pt; vertical-align: top; font-size: 9pt; color: #1E293B; }
  .sig-line { border-bottom: 1pt solid #0F172A; width: 85%; margin-top: 36pt; margin-bottom: 4pt; }
  .sig-title { font-weight: bold; color: #05301F; font-size: 9pt; }
  .sig-meta { color: #64748B; font-size: 8pt; }
</style>
</head>
<body>
  <div class="banner">
    <div class="univ-title">De La Salle Araneta University</div>
    <div class="doc-title">Official Class Timetable &amp; Faculty Load</div>
    <div class="sub-title">Automated Timetable &amp; Load Allocation System (ATLAS)</div>
  </div>

  <table class="summary-bar">
    <tr>
      <td><span class="summary-label">Department:</span> ${htmlEscape(dept)}</td>
      <td><span class="summary-label">Academic Term:</span> ${htmlEscape(term)}</td>
      <td><span class="summary-label">Faculty Scope:</span> ${htmlEscape(scope)}</td>
      <td><span class="summary-label">Total Classes:</span> ${rows.length} scheduled</td>
      <td><span class="summary-label">Generated:</span> ${htmlEscape(dateStr)}</td>
    </tr>
  </table>

  <table class="data-table">
    <thead>
      <tr>
        <th class="left">Professor</th>
        <th class="center">Subject Code</th>
        <th class="left">Subject Name</th>
        <th class="center">Section</th>
        <th class="center">Day</th>
        <th class="center">Start Time</th>
        <th class="center">End Time</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map((s, i) => `
        <tr${i % 2 ? ' class="alt"' : ''}>
          <td class="left prof-name">${htmlEscape(s.faculty_name || 'TBA')}</td>
          <td class="center subj-code">${htmlEscape(formatSubjectCode(s))}</td>
          <td class="left">${htmlEscape(s.subject_name || '')}</td>
          <td class="center">${htmlEscape(s.section || '—')}</td>
          <td class="center font-bold">${htmlEscape(DAY_LABEL[dayKey(s.day_of_week)] || s.day_of_week || '—')}</td>
          <td class="center">${htmlEscape(to12h(s.start_time))}</td>
          <td class="center">${htmlEscape(to12h(s.end_time))}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <table class="signatures">
    <tr>
      <td>
        <div style="font-weight: bold; color: #05301F;">Certified Correct:</div>
        <div class="sig-line"></div>
        <div class="sig-title">Program Chair</div>
        <div class="sig-meta">Date: ________________________</div>
      </td>
      <td>
        <div style="font-weight: bold; color: #05301F;">Approved by:</div>
        <div class="sig-line"></div>
        <div class="sig-title">Dean / Vice Chancellor for Academic Affairs</div>
        <div class="sig-meta">Date: ________________________</div>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
};

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
    `${to12h(sched.start_time)} to ${to12h(sched.end_time)}` +
    (sched.section ? `, Section ${sched.section}` : '') +
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
      style={{
        backgroundColor: color.bg,
        borderColor: color.border,
      }}
      className={`print-block group relative rounded-2xl border p-4 shadow-xs hover:shadow-lg transition-all duration-200 overflow-hidden
                  focus-visible:outline-none
                  focus-visible:ring-2 focus-visible:ring-[#375534] focus-visible:ring-offset-2
                  ${lensDim ? 'lens-dimmed' : ''} ${lensLit ? 'lens-conflict' : ''}`}
    >
      {/* The solid left accent bar from Image 1 */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[5px] rounded-l-md pointer-events-none transition-all group-hover:w-[6px]"
        style={{ backgroundColor: color.accent }}
      />

      {lensLit && (
        <span className="absolute top-2 right-2 text-rose-600 font-extrabold text-sm z-10" aria-hidden="true">▲</span>
      )}

      {/* Header: Code badge, Section & Delete action */}
      <div className="flex items-start justify-between gap-2 pl-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="font-mono text-caption font-bold px-2 py-0.5 rounded shadow-2xs"
            style={{ backgroundColor: color.badgeBg, color: color.badgeText }}
          >
            {code}
          </span>
          <span
            className={`font-mono text-[9.5px] font-extrabold px-1.5 py-0.5 rounded shadow-2xs ${
              isLabSession(sched)
                ? 'bg-amber-100 text-amber-900 border border-amber-300/80'
                : 'bg-emerald-100 text-emerald-900 border border-emerald-300/80'
            }`}
          >
            {isLabSession(sched) ? 'LAB' : 'LEC'}
          </span>
          {sched.section && (
            <span className="font-mono text-caption font-semibold text-[#375534]">
              Sec {sched.section}
            </span>
          )}
        </div>
        {canManage && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(sched);
            }}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 -m-1 shrink-0 text-slate-400
                       hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all no-print"
            aria-label={`Delete ${code} on ${dayLabel}`}
            title="Delete this class"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Subject Title */}
      <h4
        className="mt-2 pl-1.5 font-ui text-body font-bold leading-snug break-words"
        style={{ color: color.title }}
      >
        {sched.subject_name}
      </h4>

      {/* Footer: Time range */}
      <div className="mt-3 pt-2.5 border-t border-[#AEC3B0]/30 pl-1.5 flex items-center">
        <span
          className="font-data text-caption font-bold tabular-nums whitespace-nowrap"
          style={{ color: color.time }}
        >
          {to12h(sched.start_time)} – {to12h(sched.end_time)}
        </span>
      </div>
    </div>
  );
}

export default function Schedules() {
  const { addToast } = useToast();
  const [schedules, setSchedules] = useState([]);
  const [formConflicts, setFormConflicts] = useState([]);
  // A room clash does not stop a save; a faculty or section clash does.
  const blockingFormConflicts = formConflicts.filter((c) => c.severity !== 'advisory');
  const advisoryFormConflicts = formConflicts.filter((c) => c.severity === 'advisory');

  const [activeSemesterId, setActiveSemesterId] = useState(null);

  // Live timer for current time indicator line on the calendar grid
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const navigate = useNavigate();
  const [unassignedOfferingsData, setUnassignedOfferingsData] = useState({ unassigned: 0, total: 0 });
  // Whether the generator should put laboratory subjects in a room. Lecture
  // subjects never get one either way. Defaults on, which is what the generator
  // did before this was a choice.
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
  const [resolutionModalData, setResolutionModalData] = useState(null);

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

  // Hover state for Week Grid class cards
  const [hoveredSchedule, setHoveredSchedule] = useState(null);
  const hoverTimerRef = React.useRef(null);

  const handleCardMouseEnter = (sched, color, day, inConflict, event) => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setHoveredSchedule({ sched, color, day, rect, inConflict });
  };

  const handleCardMouseLeave = () => {
    hoverTimerRef.current = setTimeout(() => {
      setHoveredSchedule(null);
    }, 180);
  };

  const handlePopoverMouseEnter = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  };

  const handlePopoverMouseLeave = () => {
    hoverTimerRef.current = setTimeout(() => {
      setHoveredSchedule(null);
    }, 180);
  };

  useEffect(() => {
    const handleScroll = () => {
      if (hoveredSchedule) {
        setHoveredSchedule(null);
      }
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, [hoveredSchedule]);

  const getPopoverStyle = (rect) => {
    if (!rect) return { display: 'none' };
    const popoverWidth = 300;
    const popoverHeight = 250;
    const padding = 12;

    // Prefer placing popover to the right of the card
    let left = rect.right + 12;
    if (left + popoverWidth > window.innerWidth - padding) {
      // If overflowing right viewport edge, flip to the left of the card
      left = rect.left - popoverWidth - 12;
    }
    // If still offscreen on the left, clamp to padding
    if (left < padding) {
      left = Math.max(padding, window.innerWidth - popoverWidth - padding);
    }

    // Align vertically with card top, clamped within viewport
    let top = rect.top;
    if (top + popoverHeight > window.innerHeight - padding) {
      top = Math.max(padding, window.innerHeight - popoverHeight - padding);
    }
    if (top < padding) {
      top = padding;
    }

    return {
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      width: `${popoverWidth}px`,
      zIndex: 60,
    };
  };

  // Custom Faculty Filter Dropdown state
  const [isFacultyDropdownOpen, setIsFacultyDropdownOpen] = useState(false);
  const facultyDropdownRef = React.useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (facultyDropdownRef.current && !facultyDropdownRef.current.contains(e.target)) {
        setIsFacultyDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

      setResolutionModalData({
        title: res.title || 'Conflict Resolved',
        message: res.message || 'Conflict resolved successfully.',
        details: res.details || res.message || 'The resolution has been applied.',
        action_taken: res.action_taken || 'resolved'
      });

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
      setSelectedProfessorFilter('');
      setGlobalSchedules([]);
      setSchedules([]);
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
        const assignedRes = await api.get('/subject-offerings/assigned-subjects').catch(() => null);
        if (assignedRes?.summary) {
          setUnassignedOfferingsData({
            unassigned: assignedRes.summary.unassigned || 0,
            total: assignedRes.summary.total || 0
          });
        }
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
  const [exportFormat] = useState('excel');
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

  const filteredMatrixSchedules = React.useMemo(() => {
    if (selectedProfessorFilter) {
      return globalSchedules.filter((s) => s.faculty_name === selectedProfessorFilter);
    }
    return globalSchedules;
  }, [globalSchedules, selectedProfessorFilter]);

  const facultyOptions = React.useMemo(() => {
    const profMap = new Map();
    allTeachers.forEach((t) => {
      if (t.name && t.name.trim()) {
        profMap.set(t.name, { name: t.name, count: 0 });
      }
    });
    globalSchedules.forEach((s) => {
      if (s.faculty_name) {
        const entry = profMap.get(s.faculty_name) || { name: s.faculty_name, count: 0 };
        entry.count += 1;
        profMap.set(s.faculty_name, entry);
      }
    });
    return Array.from(profMap.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name);
    });
  }, [globalSchedules, allTeachers]);

  const exportFileName = (() => {
    const parts = ['ATLAS_Schedule'];
    if (exportTerm) parts.push(`${exportTerm.academic_year}_${exportTerm.term}`);
    if (exportScope === 'filtered' && selectedProfessorFilter) parts.push(selectedProfessorFilter);
    parts.push(new Date().toISOString().slice(0, 10));
    const stem = parts.join('_').replace(/[^A-Za-z0-9_\-.]/g, '_');
    return `${stem}.xlsx`;
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
      const blob = await api.getBlob('/schedules/export/excel', {
        params: { semester_id: activeSemesterId, faculty_name: exportScopeName || undefined },
      });
      saveBlob(blob, exportFileName);
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
   * When no classes are scheduled (such as before generation or after Clear All),
   * no professor cards are rendered so the empty state is properly displayed.
   */
  const facultyBoards = React.useMemo(() => {
    if (!globalSchedules || globalSchedules.length === 0) {
      return [];
    }

    const boards = new Map();

    globalSchedules.forEach((s) => {
      const name = s.faculty_name || 'Unassigned';
      if (!boards.has(name)) boards.set(name, { name, classes: [] });
      boards.get(name).classes.push(s);
    });

    // If a specific professor filter is selected, ensure their card exists
    // so any filter status or empty state for that professor is viewable.
    if (selectedProfessorFilter && !boards.has(selectedProfessorFilter)) {
      boards.set(selectedProfessorFilter, { name: selectedProfessorFilter, classes: [] });
    }

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
  }, [globalSchedules, selectedProfessorFilter]);

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
        faculty_ids: selectedGenProfessors
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
  const [teachers, setTeachers] = useState([]);
  const [formData, setFormData] = useState({
    subject_id: '',
    faculty_id: '',
    day_of_week: 'Mon',
    start_time: '07:30',
    end_time: '08:30',
    section: ''
  });

  const fetchDropdownData = async () => {
    try {
      const [subjectsData, teachersData] = await Promise.all([
        api.get('/curriculum').catch(() => []),
        api.get('/professors').catch(() => [])
      ]);
      const formattedTeachers = (teachersData || []).map(t => ({
        ...t,
        name: `${t.first_name} ${t.last_name}`
      }));
      setSubjects(subjectsData || []);
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
        teacher: teachers.find(t => t.id === parseInt(formData.faculty_id))?.name
      }, schedules);
      setFormConflicts(conflicts);
    }
  }, [formData, schedules, teachers]);

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
        room_id: null,
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
                      Clear all
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
              <div className="inline-flex rounded-2xl bg-[#E3EED4]/50 border border-[#AEC3B0]/40 p-1 shadow-2xs">
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
                      className={`h-9 px-4 rounded-xl font-ui text-caption font-bold flex items-center gap-2 transition-all duration-200 ${
                        isActive
                          ? 'bg-[#0F2A1D] text-[#E3EED4] shadow-xs'
                          : 'text-[#375534] hover:text-[#0F2A1D] hover:bg-[#E3EED4]/60'
                      }`}
                    >
                      <Icon className="w-4 h-4" aria-hidden="true" />
                      {v.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-ui text-caption font-semibold text-[#375534] shrink-0">Showing</span>

                {/* Custom Faculty Filter Dropdown */}
                <div className="relative" ref={facultyDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsFacultyDropdownOpen(!isFacultyDropdownOpen)}
                    aria-haspopup="listbox"
                    aria-expanded={isFacultyDropdownOpen}
                    className={`h-9 min-w-[210px] max-w-full rounded-xl border bg-white px-3 py-1.5 font-ui text-caption font-bold text-[#0F2A1D] flex items-center justify-between gap-2 shadow-2xs transition-all duration-150 cursor-pointer ${
                      isFacultyDropdownOpen
                        ? 'border-[#046A38] ring-2 ring-[#046A38]/20'
                        : 'border-[#AEC3B0]/60 hover:border-[#375534]'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {selectedProfessorFilter ? (
                        <>
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                            style={{ backgroundColor: getFacultyColor(selectedProfessorFilter).accent }}
                          />
                          <span className="truncate">{selectedProfessorFilter}</span>
                        </>
                      ) : (
                        <>
                          <User className="w-3.5 h-3.5 text-[#375534] shrink-0" />
                          <span>All faculty</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {selectedProfessorFilter && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProfessorFilter('');
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.stopPropagation();
                              setSelectedProfessorFilter('');
                            }
                          }}
                          className="p-0.5 text-slate-400 hover:text-rose-600 rounded-md transition-colors"
                          title="Clear filter"
                        >
                          <X className="w-3.5 h-3.5" />
                        </span>
                      )}
                      <ChevronDown
                        className={`w-4 h-4 text-[#6B9071] transition-transform duration-200 ${
                          isFacultyDropdownOpen ? 'rotate-180 text-[#0F2A1D]' : ''
                        }`}
                      />
                    </div>
                  </button>

                  {/* Dropdown Menu Popover */}
                  {isFacultyDropdownOpen && (
                    <div
                      role="listbox"
                      className="absolute right-0 sm:left-0 top-full mt-1.5 w-64 max-h-72 overflow-y-auto rounded-2xl border border-[#D5DFD9] bg-white shadow-xl py-1.5 z-40 animate-in fade-in zoom-in-95 duration-100"
                    >
                      {/* All Faculty Option */}
                      <button
                        type="button"
                        role="option"
                        aria-selected={!selectedProfessorFilter}
                        onClick={() => {
                          setSelectedProfessorFilter('');
                          setIsFacultyDropdownOpen(false);
                        }}
                        className={`w-full px-3.5 py-2 text-left font-ui text-caption flex items-center justify-between gap-2 transition-colors ${
                          !selectedProfessorFilter
                            ? 'bg-[#E6F0EA] font-bold text-[#05301F]'
                            : 'hover:bg-[#FAFBF9] text-[#141414] font-medium'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-[#375534]" />
                          <span>All faculty</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-semibold font-data px-1.5 py-0.5 rounded-full bg-[#E3EED4] text-[#0F2A1D]">
                            {globalSchedules.length}
                          </span>
                          {!selectedProfessorFilter && <Check className="w-3.5 h-3.5 text-[#046A38]" />}
                        </div>
                      </button>

                      <div className="my-1 border-t border-[#E1E5E2]" />

                      {/* Individual Faculty Options */}
                      {facultyOptions.map((prof) => {
                        const isSelected = selectedProfessorFilter === prof.name;
                        const color = getFacultyColor(prof.name);
                        return (
                          <button
                            key={prof.name}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => {
                              setSelectedProfessorFilter(prof.name);
                              setIsFacultyDropdownOpen(false);
                            }}
                            className={`w-full px-3.5 py-2 text-left font-ui text-caption flex items-center justify-between gap-2 transition-colors ${
                              isSelected
                                ? 'bg-[#E6F0EA] font-bold text-[#05301F]'
                                : 'hover:bg-[#FAFBF9] text-[#141414] font-medium'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                                style={{ backgroundColor: color.accent }}
                              />
                              <span className="truncate">{prof.name}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[10px] font-semibold font-data px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                {pluralize(prof.count, 'class')}
                              </span>
                              {isSelected && <Check className="w-3.5 h-3.5 text-[#046A38]" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Summary text that dynamically reflects filter state */}
                <div className="flex items-center gap-2 font-ui text-caption text-[#375534] font-medium tabular-nums">
                  {selectedProfessorFilter ? (
                    <>
                      <span className="font-bold text-[#0F2A1D]">
                        {pluralize(filteredMatrixSchedules.length, 'class', 'classes')}
                      </span>
                      <span>for <strong className="text-[#0F2A1D]">{selectedProfessorFilter}</strong></span>
                      <button
                        type="button"
                        onClick={() => setSelectedProfessorFilter('')}
                        className="ml-1 text-[11px] font-bold text-[#046A38] hover:text-[#05301F] hover:underline cursor-pointer"
                      >
                        (Clear)
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="font-bold text-[#0F2A1D]">
                        {pluralize(globalSchedules.length, 'class', 'classes')}
                      </span>
                      <span>·</span>
                      <span>
                        <strong className="text-[#0F2A1D]">
                          {facultyBoards.filter((b) => b.classes.length > 0).length}
                        </strong>{' '}
                        of {allTeachers.length > 0 ? allTeachers.length : facultyBoards.length} professors scheduled
                      </span>
                    </>
                  )}
                </div>
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
                    className="rounded-3xl border border-[#AEC3B0]/35 bg-white/95 overflow-hidden break-inside-avoid shadow-xs hover:shadow-sm transition-all"
                  >
                    <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-[#AEC3B0]/30 bg-gradient-to-r from-[#E3EED4]/35 via-white/80 to-transparent">
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0 shadow-2xs"
                          style={{ backgroundColor: color.accent }}
                          aria-hidden="true"
                        />
                        <h3 className="font-ui text-lead font-bold text-[#0F2A1D] truncate tracking-tight">
                          {board.name}
                        </h3>
                      </div>
                      <span className="font-ui text-caption font-bold px-3.5 py-1.5 rounded-full bg-[#E3EED4]/80 border border-[#AEC3B0]/50 text-[#0F2A1D] tabular-nums shadow-2xs">
                        {hasClasses
                          ? `${pluralize(board.classes.length, 'class', 'classes')} · ${board.hours % 1 === 0 ? board.hours : board.hours.toFixed(1)} hrs / week`
                          : 'No classes scheduled'}
                      </span>
                    </header>

                    {hasClasses ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 wide:grid-cols-6 gap-3 p-5 bg-[#FAFBF9]">
                        {board.days.map(({ day, classes }) => (
                          <div key={day} className="bg-white rounded-2xl p-3.5 border border-[#AEC3B0]/30 flex flex-col gap-3 min-h-[8rem] shadow-2xs">
                            <h4 className="font-ui text-xs font-bold uppercase text-[#0F2A1D] text-center py-1.5 bg-[#E3EED4]/50 border border-[#AEC3B0]/30 rounded-xl">
                              <abbr title={DAY_LABEL[day]} className="no-underline">{day}</abbr>
                            </h4>

                            {classes.length === 0 ? (
                              <p className="font-ui text-caption text-[#6B9071] text-center py-4">No classes</p>
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
                      <p className="px-7 py-10 text-center text-sm font-semibold text-[#6B9071]">
                        The generator placed no classes for {board.name} this term.
                      </p>
                    )}
                  </section>
                );
              })}
            </div>
          ) : (
            /* Structured Academic Period Matrix View — Institutional DLSAU / ATLAS Style */
            <div className="print-grid relative mt-6 bg-white rounded-3xl border border-[#D5DFD9] shadow-xs overflow-hidden">
              {/* Matrix Institutional Header Bar - Clean light aesthetic */}
              <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 bg-white border-b border-[#E1E5E2]">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-2xl bg-[#E6F0EA] border border-[#8FBFA6]/40 flex items-center justify-center shrink-0 shadow-2xs">
                    <Calendar className="w-5 h-5 text-[#05301F]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-ui text-base font-bold text-[#05301F] tracking-tight">
                        Weekly Timetable Matrix
                      </h3>
                      <span className="font-data text-[11px] font-semibold text-[#03502A] uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#E6F0EA] border border-[#8FBFA6]/40">
                        {DAY_ORDER.length} Days
                      </span>
                      {selectedProfessorFilter && (
                        <span className="font-ui text-xs font-semibold text-[#05301F] bg-[#E6F0EA] px-2.5 py-0.5 rounded-full border border-[#046A38]/30">
                          {selectedProfessorFilter}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#527A66] mt-0.5 font-medium">
                      Structured academic period schedule · {exportTerm ? `A.Y. ${exportTerm.academic_year} ${formatSemesterTerm(exportTerm.term)}` : 'Current Term'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-data text-xs font-bold px-3.5 py-1.5 rounded-full bg-[#E6F0EA] text-[#05301F] border border-[#8FBFA6]/40 shadow-2xs">
                    {pluralize(filteredMatrixSchedules.length, 'class', 'classes')} scheduled
                  </span>
                </div>
              </div>

              {/* Matrix Table with overflow scroll for small viewports */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left min-w-[1020px]">
                  <thead>
                    <tr className="border-b-2 border-[#8FBFA6]/60 bg-[#F4F8F5] text-[#05301F]">
                      {/* Day Column Headers */}
                      {DAY_ORDER.map((day, dIdx) => {
                        const todayKey = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][currentTime.getDay()];
                        const isToday = day === todayKey;
                        const dayCount = filteredMatrixSchedules.filter(s => s.day_of_week === day || s.day_of_week === day.substring(0, 3)).length;

                        return (
                          <th
                            key={day}
                            className={`w-1/6 px-4 py-3.5 text-center transition-colors ${
                              dIdx > 0 ? 'border-l border-[#E1E5E2]' : ''
                            } ${isToday ? 'bg-[#E3EED4]' : 'bg-[#F4F8F5]'}`}
                          >
                            <div className="flex items-center justify-center gap-1.5">
                              <span className="font-ui text-xs font-extrabold uppercase tracking-wider text-[#05301F]">
                                {DAY_LABEL[day] || day}
                              </span>
                              {isToday && (
                                <span className="font-ui text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-[#05301F] text-[#E3EED4] uppercase tracking-wider shadow-2xs">
                                  Today
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-semibold text-[#4D6B4A] mt-0.5">
                              {dayCount > 0 ? pluralize(dayCount, 'class', 'classes') : 'No classes'}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>

                  <tbody>
                    {ACADEMIC_PERIODS.map((period, pIdx) => {
                      const isAlt = pIdx % 2 === 1;

                      return (
                        <tr
                          key={period.id}
                          className={`border-b border-[#E1E5E2] last:border-b-0 transition-colors ${
                            period.isMidday
                              ? 'bg-[#F2F7F4]/70'
                              : isAlt
                              ? 'bg-[#FAFBF9]'
                              : 'bg-white'
                          }`}
                        >
                          {/* 6 Day Matrix Cells */}
                          {DAY_ORDER.map((day, dIdx) => {
                            const todayKey = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][currentTime.getDay()];
                            const isToday = day === todayKey;

                            // Filter classes falling into this period on this day
                            const cellClasses = filteredMatrixSchedules.filter((s) => {
                              const matchesDay = s.day_of_week === day || s.day_of_week === day.substring(0, 3);
                              if (!matchesDay) return false;
                              const sMin = minutesOf(s.start_time);
                              return sMin >= period.thresholdStart && sMin < period.thresholdEnd;
                            });

                            return (
                              <td
                                key={day}
                                className={`w-1/6 p-2.5 align-top ${
                                  dIdx > 0 ? 'border-l border-[#E1E5E2]' : ''
                                } ${isToday ? 'bg-[#E3EED4]/15' : ''}`}
                              >
                                {cellClasses.length > 0 ? (
                                  <div className="flex flex-col gap-2">
                                    {cellClasses.map((sched) => {
                                      const color = getFacultyColor(sched.faculty_name);
                                      const inConflict = conflictedCurriculumIds.has(sched.curriculum_id);
                                      const lensDim = isLensOpen && !inConflict;
                                      const lensLit = isLensOpen && inConflict;
                                      const isLab = isLabSession(sched);

                                      const blockLabel =
                                        `${formatSubjectCode(sched)} (${isLab ? 'LAB' : 'LEC'}), ${sched.subject_name}, ` +
                                        `${sched.faculty_name}, ` +
                                        `${day} ${sched.start_time} to ${sched.end_time}` +
                                        (canManageSchedules ? '. Press Delete to remove this class.' : '');

                                      return (
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
                                              if (hoveredSchedule?.sched?.id === sched.id) {
                                                setHoveredSchedule(null);
                                              }
                                            }
                                          }}
                                          onMouseEnter={(e) => handleCardMouseEnter(sched, color, day, inConflict, e)}
                                          onMouseLeave={handleCardMouseLeave}
                                          onFocus={(e) => handleCardMouseEnter(sched, color, day, inConflict, e)}
                                          onBlur={handleCardMouseLeave}
                                          style={{
                                            backgroundColor: color.bg,
                                            borderColor: color.border,
                                          }}
                                          className={`group relative rounded-xl border p-2.5 shadow-2xs hover:shadow-md transition-all duration-150 cursor-pointer overflow-hidden ${focusRing} ${
                                            lensDim ? 'lens-dimmed' : ''
                                          } ${lensLit ? 'lens-conflict' : ''}`}
                                        >
                                          {/* Accent left indicator stripe */}
                                          <div
                                            className="absolute left-0 top-0 bottom-0 w-1 rounded-l-md pointer-events-none transition-all group-hover:w-1.5"
                                            style={{ backgroundColor: color.accent }}
                                          />

                                          {lensLit && (
                                            <span
                                              className="absolute top-1.5 right-1.5 text-rose-600 font-extrabold text-xs"
                                              aria-hidden="true"
                                              title="Conflict detected"
                                            >
                                              ▲
                                            </span>
                                          )}

                                          <div className="pl-1.5 flex flex-col gap-1">
                                            {/* Badges: Subject code + Session (LEC/LAB) + Section */}
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                              <span
                                                className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded shadow-2xs"
                                                style={{ backgroundColor: color.badgeBg, color: color.badgeText }}
                                              >
                                                {formatSubjectCode(sched)}
                                              </span>
                                              <span
                                                className={`font-mono text-[9px] font-extrabold px-1.5 py-0.5 rounded shadow-2xs ${
                                                  isLab
                                                    ? 'bg-amber-100 text-amber-900 border border-amber-300/80'
                                                    : 'bg-emerald-100 text-emerald-900 border border-emerald-300/80'
                                                }`}
                                              >
                                                {isLab ? 'LAB' : 'LEC'}
                                              </span>
                                              {sched.section && (
                                                <span className="font-mono text-[9.5px] font-semibold text-[#03502A]">
                                                  Sec {sched.section}
                                                </span>
                                              )}
                                            </div>

                                            {/* Subject Title */}
                                            <h4
                                              className="font-ui text-xs font-bold leading-snug line-clamp-2 text-[#05301F]"
                                              title={sched.subject_name}
                                            >
                                              {sched.subject_name}
                                            </h4>

                                            {/* Time range */}
                                            <div className="mt-0.5 flex items-center justify-between gap-1 text-[10.5px]">
                                              <span
                                                className="font-data font-bold tabular-nums whitespace-nowrap"
                                                style={{ color: color.time }}
                                              >
                                                {to12h(sched.start_time)} – {to12h(sched.end_time)}
                                              </span>
                                              {sched.section && (
                                                <span className="font-ui text-[10px] font-semibold text-[#4D6B4A] truncate">
                                                  Sec {sched.section}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div className="h-full min-h-[44px]" />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Floating Hover Preview Popover for Week Grid Class */}
        {hoveredSchedule && (
          <div
            style={getPopoverStyle(hoveredSchedule.rect)}
            onMouseEnter={handlePopoverMouseEnter}
            onMouseLeave={handlePopoverMouseLeave}
            className="no-print pointer-events-auto bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-[#AEC3B0]/60 overflow-hidden transition-all duration-150 animate-in fade-in zoom-in-95 z-50"
          >
            {/* Top Accent Stripe */}
            <div
              className="h-1.5 w-full shrink-0"
              style={{ backgroundColor: hoveredSchedule.color.accent }}
            />

            <div className="p-4 space-y-3">
              {/* Badges & Conflict Row */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span
                  className="text-[11px] font-mono font-bold px-2 py-0.5 rounded shadow-2xs"
                  style={{
                    backgroundColor: hoveredSchedule.color.badgeBg,
                    color: hoveredSchedule.color.badgeText,
                  }}
                >
                  {formatSubjectCode(hoveredSchedule.sched)}
                </span>
                {hoveredSchedule.sched.section && (
                  <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-[#E3EED4] text-[#0F2A1D]">
                    Sec {hoveredSchedule.sched.section}
                  </span>
                )}
                {hoveredSchedule.inConflict && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-700 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                    Conflict
                  </span>
                )}
              </div>

              {/* Subject Title */}
              <h4 className="font-ui text-xs font-bold text-[#0F2A1D] leading-snug break-words">
                {hoveredSchedule.sched.subject_name}
              </h4>

              {/* Metadata details */}
              <div className="border-t border-[#E8EFE8] pt-2.5 space-y-2 text-xs">
                {/* Day & Time & Duration */}
                <div className="flex items-start gap-2 text-[#0F2A1D]">
                  <Clock className="w-3.5 h-3.5 text-[#375534] shrink-0 mt-0.5" />
                  <div className="flex flex-col">
                    <span className="font-semibold text-[#0F2A1D]">
                      {DAY_LABEL[hoveredSchedule.day] || hoveredSchedule.day}
                    </span>
                    <span className="font-data font-medium text-[#375534] tabular-nums">
                      {to12h(hoveredSchedule.sched.start_time)} – {to12h(hoveredSchedule.sched.end_time)}
                      {(() => {
                        const d = durationHours(hoveredSchedule.sched);
                        return d > 0 ? (
                          <span className="ml-1 text-[11px] font-semibold text-[#6B9071]">
                            ({d === 1 ? '1 hr' : `${d} hrs`})
                          </span>
                        ) : null;
                      })()}
                    </span>
                  </div>
                </div>

                {/* Faculty */}
                <div className="flex items-center gap-2 text-[#0F2A1D]">
                  <User className="w-3.5 h-3.5 text-[#375534] shrink-0" />
                  <span className="font-medium truncate">
                    {hoveredSchedule.sched.faculty_name || 'Unassigned Professor'}
                  </span>
                </div>

                {/* Section */}
                {hoveredSchedule.sched.section && (
                  <div className="flex items-center gap-2 text-[#0F2A1D]">
                    <Users className="w-3.5 h-3.5 text-[#6B9071] shrink-0" />
                    <span className="font-medium truncate">
                      Section {hoveredSchedule.sched.section}
                    </span>
                  </div>
                )}
              </div>

              {/* Delete button (if can manage) */}
              {canManageSchedules && (
                <div className="pt-2 border-t border-[#E8EFE8]">
                  <button
                    type="button"
                    onClick={() => {
                      handleDeleteSchedule(hoveredSchedule.sched);
                      setHoveredSchedule(null);
                    }}
                    className="w-full py-1.5 px-3 rounded-xl border border-rose-200 bg-rose-50/70 hover:bg-rose-100 text-rose-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Schedule</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
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

      {/* Conflict Resolution Summary Dialog */}
      <AtlasDialog
        isOpen={Boolean(resolutionModalData)}
        onClose={() => setResolutionModalData(null)}
        title={resolutionModalData?.title || 'Conflict Resolved'}
        description={resolutionModalData?.message || 'The conflict has been resolved successfully.'}
        size="confirm"
        icon={Check}
        dismissible={true}
        footer={
          <AtlasButton
            onClick={() => setResolutionModalData(null)}
          >
            Done
          </AtlasButton>
        }
      >
        <div className="space-y-4 font-ui">
          <div className="p-4 rounded-panel bg-emerald-50 border border-emerald-200/70 text-emerald-950 text-sm">
            <p className="font-semibold text-emerald-950 mb-1.5 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block" />
              What was done
            </p>
            <p className="text-emerald-900/90 leading-relaxed text-caption sm:text-body">
              {resolutionModalData?.details || resolutionModalData?.message}
            </p>
          </div>

          <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-panel bg-slate-50 border border-slate-200 text-xs text-slate-600">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span>This resolution has been recorded in the system <strong>Activity Log</strong>.</span>
          </div>
        </div>
      </AtlasDialog>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create New Schedule"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Blocking and advisory are reported differently, because they ask
              different things of the user: a faculty or section clash has to be
              resolved here, while a shared room is a note for the Registrar. */}
          {blockingFormConflicts.length > 0 && (
            <div className="rounded-panel bg-sem-conflict-bg border border-sem-conflict/30 p-3.5 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-sem-conflict shrink-0 mt-0.5" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-ui text-caption font-semibold text-sem-conflict">
                  {blockingFormConflicts[0].type === 'Teacher'
                    ? 'This professor is already teaching then'
                    : 'This section already has a class then'}
                </p>
                <p className="font-ui text-caption text-sem-conflict/90 mt-0.5 leading-relaxed">
                  Two classes cannot share {blockingFormConflicts[0].type === 'Teacher' ? 'a professor' : 'a section'} at
                  the same time. Change the time, or the {blockingFormConflicts[0].type === 'Teacher' ? 'professor' : 'section'}.
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
              <label className="block text-sm font-medium text-gray-700">Section (Optional)</label>
              <input
                type="text"
                placeholder="e.g. 1A, CS-3A"
                className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm"
                value={formData.section}
                onChange={(e) => setFormData({ ...formData, section: e.target.value })}
              />
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
                className={`px-4 py-2 text-sm font-medium text-white rounded-md shadow-sm ${blockingFormConflicts.length > 0 ? 'bg-orange-600 hover:bg-orange-700' : 'bg-green-700 hover:bg-green-800'
                  }`}
              >
                {blockingFormConflicts.length > 0 ? 'Save Anyway' : 'Save Schedule'}
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
                      <p className="text-sm font-bold text-slate-800">{sug.faculty_name}</p>
                      <p className="text-xs font-medium text-indigo-600 mt-0.5">{sug.day_of_week} • {sug.start_time} - {sug.end_time} • {sug.confidence}% Match</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormData({
                        ...formData,
                        faculty_id: sug.faculty_id.toString(),
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

              {unassignedOfferingsData.unassigned > 0 && (
                <div className="p-4 rounded-panel bg-amber-50/80 border border-amber-300 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="font-ui text-sm font-bold text-amber-950">
                      Notice: {unassignedOfferingsData.unassigned} unassigned major {unassignedOfferingsData.unassigned === 1 ? 'subject' : 'subjects'}
                    </p>
                    <p className="font-ui text-xs text-amber-800 mt-1 leading-relaxed">
                      Unassigned subjects will be skipped until assigned to a professor. You can still proceed to generate schedules for the selected professors below.
                    </p>
                    <div className="mt-2.5">
                      <AtlasButton
                        size="small"
                        variant="secondary"
                        className="bg-white border-amber-300 text-amber-900 hover:bg-amber-100"
                        onClick={() => {
                          setIsGenerateModalOpen(false);
                          navigate('/dashboard/assigned-subjects');
                        }}
                      >
                        Review Assigned Subjects
                      </AtlasButton>
                    </div>
                  </div>
                </div>
              )}

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
                <AtlasButton
                  type="submit"
                  icon={Sparkles}
                  loading={isGenerating}
                  disabled={isGenerating || selectedGenProfessors.length === 0}
                >
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
      <AtlasDialog
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        title="Export Schedule to Excel"
        description="Download an official Excel workbook (.xlsx) formatted with DLSAU institutional styling."
        size="wide"
        icon={FileSpreadsheet}
        dismissible={!isExporting}
        footer={
          <>
            <AtlasButton
              variant="ghost"
              onClick={() => setIsExportOpen(false)}
              disabled={isExporting}
            >
              Cancel
            </AtlasButton>
            <AtlasButton
              onClick={handleDownload}
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
          {/* File summary pill & info */}
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
                  {exportTerm
                    ? `${exportTerm.academic_year} ${formatSemesterTerm(exportTerm.term)}`
                    : 'Active Term'}
                </span>
              </div>
            </div>
          </div>

          {/* Document Format Display */}
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

          {/* Scope Selector */}
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
                        exportScope === opt.id
                          ? 'border-emerald-700 bg-emerald-700'
                          : 'border-slate-300 bg-white'
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

          {/* Preview Section */}
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
                  <caption className="sr-only">
                    Preview of the exported schedule, {exportRows.length} rows
                  </caption>
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
                        className={`hover:bg-emerald-50/40 transition-colors ${
                          idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'
                        }`}
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
                  <p className="font-ui text-body font-bold text-slate-800">
                    No classes match your selection
                  </p>
                  <p className="font-ui text-caption text-slate-500 mt-1">
                    Try adjusting your filters or generating a schedule first.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </AtlasDialog>

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
        <div className="fixed bottom-6 right-6 z-[250] bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 rise-bottom border border-slate-800">
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
