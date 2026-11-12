import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, AlertTriangle, Sparkles, User, Trash2, X, Download, LayoutGrid, LayoutList, Calendar, ChevronDown, Check } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';
import { detectConflicts, checkScheduleIntegrity } from '../../utils/conflictDetection';
import AtlasButton from '../../components/ui/Button';
import ConflictLens from '../../components/ui/ConflictLens';
import { PageHeader } from '../../components/ui/Page';
import { focusRing, pluralize } from '../../components/ui/tokens';
import { canEditSchedules } from '../../utils/session';
import {
  ALLOWED_DAY_ABBR,
  validateSectionName,
  validateTimeOrder,
  parseErrorResponse,
} from '../../utils/validation';
import {
  getFacultyColor,
  DAY_ORDER,
  DAY_LABEL,
  ACADEMIC_PERIODS,
  to12h,
  minutesOf,
  durationHours,
  dayKey,
  formatSubjectCode,
  isLabSession,
  sortForExport,
  filterActiveTermSubjects,
} from '../../utils/scheduleHelpers';
import ClassCard from '../../components/schedules/ClassCard';
import ScheduleHoverPopover from '../../components/schedules/ScheduleHoverPopover';
import ConflictResolutionDialog from '../../components/schedules/ConflictResolutionDialog';
import GenerateScheduleModal from '../../components/schedules/GenerateScheduleModal';
import ExportScheduleDialog from '../../components/schedules/ExportScheduleDialog';
import CreateScheduleModal from '../../components/schedules/CreateScheduleModal';
import { ClearSchedulesDialog, UndoBackupToast } from '../../components/schedules/ClearSchedulesDialog';

const formatSemesterTerm = (term) => {
  if (!term) return '';
  if (term === '1st') return '1st Semester';
  if (term === '2nd') return '2nd Semester';
  if (term === '3rd semester') return '3rd Semester';
  return term;
};

export default function Schedules() {
  const { addToast } = useToast();
  const [schedules, setSchedules] = useState([]);
  const [formConflicts, setFormConflicts] = useState([]);
  // A room clash does not stop a save; a faculty or section clash does.
  const blockingFormConflicts = formConflicts.filter((c) => c.severity !== 'advisory');

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
    const nextGenErrors = {};
    if (!selectedGenSemester) {
      nextGenErrors.semester = 'No active academic term configured. Activate a semester first.';
    }
    if (selectedGenProfessors.length === 0) {
      nextGenErrors.professors = 'Select at least one professor to schedule.';
    }
    setGenErrors(nextGenErrors);
    if (Object.keys(nextGenErrors).length > 0) return;

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
      const parsed = parseErrorResponse(e, 'Generation failed');
      setGenErrors({ submit: parsed.message });
      addToast(parsed.message || 'Generation failed', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const canManageSchedules = canEditSchedules();

  // A month-grid calendar (monthNames, getDaysInMonth, getFirstDayOfMonth,
  // prevMonth, nextMonth, renderCalendarDays and the `currentDate` state that
  // fed them) used to sit here. Nothing rendered any of it — this screen shows
  // a week grid — so it was ~40 lines of unreachable date arithmetic.

  const INITIAL_SCHEDULE_FORM = {
    subject_id: '',
    faculty_id: '',
    day_of_week: 'Mon',
    start_time: '07:30',
    end_time: '08:30',
    section: '',
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
  const [isLoadingDropdowns, setIsLoadingDropdowns] = useState(false);
  const [isSubmittingSchedule, setIsSubmittingSchedule] = useState(false);
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [formData, setFormData] = useState(INITIAL_SCHEDULE_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [genErrors, setGenErrors] = useState({});

  const validateScheduleField = (field, data) => {
    if (field === 'subject_id') {
      return data.subject_id ? '' : 'Please select a subject.';
    }
    if (field === 'faculty_id') {
      return data.faculty_id ? '' : 'Please select a professor.';
    }
    if (field === 'day_of_week') {
      return ALLOWED_DAY_ABBR.includes(data.day_of_week)
        ? ''
        : 'Select a valid day from Monday to Saturday (Mon–Sat).';
    }
    if (field === 'section') {
      return validateSectionName(data.section, { required: false });
    }
    if (field === 'start_time') {
      return data.start_time ? '' : 'Select a start time.';
    }
    if (field === 'end_time') {
      if (!data.end_time) return 'Select an end time.';
      if (!data.start_time) return '';
      return validateTimeOrder(data.start_time, data.end_time, { contextLabel: 'Schedule' });
    }
    return '';
  };

  const validateScheduleForm = () => {
    const errors = {};
    ['subject_id', 'faculty_id', 'section', 'day_of_week', 'start_time', 'end_time'].forEach((f) => {
      const msg = validateScheduleField(f, formData);
      if (msg) errors[f] = msg;
    });
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const updateScheduleField = (field, value) => {
    const next = { ...formData, [field]: value };
    setFormData(next);
    setFormErrors((prev) => {
      const updated = { ...prev };
      if (field === 'section') {
        const msg = validateSectionName(value, { required: false });
        if (value.trim() && msg) updated.section = msg;
        else if (prev.section) updated.section = msg || undefined;
      } else if (field === 'start_time' || field === 'end_time') {
        if (field === 'start_time') {
          updated.start_time = validateScheduleField('start_time', next) || undefined;
        }
        if (next.start_time && next.end_time) {
          updated.end_time = validateTimeOrder(next.start_time, next.end_time, { contextLabel: 'Schedule' }) || undefined;
        } else if (prev.end_time || field === 'end_time') {
          updated.end_time = validateScheduleField('end_time', next) || undefined;
        }
      } else if (prev[field]) {
        updated[field] = validateScheduleField(field, next) || undefined;
      }
      return updated;
    });
  };

  const handleScheduleBlur = (field) => {
    const msg = validateScheduleField(field, formData);
    setFormErrors((prev) => {
      const updated = { ...prev, [field]: msg || undefined };
      if (field === 'start_time' && formData.end_time) {
        updated.end_time = validateScheduleField('end_time', formData) || undefined;
      }
      return updated;
    });
  };

  const fetchDropdownData = async () => {
    setIsLoadingDropdowns(true);
    try {
      let currentSem =
        semesters.find((s) => s.id === activeSemesterId) ||
        semesters.find((s) => s.is_active) ||
        null;
      if (!currentSem) {
        const semList = await api.get('/semesters').catch(() => []);
        if (Array.isArray(semList) && semList.length > 0) {
          currentSem = semList.find((s) => s.is_active) || semList[0] || null;
        }
      }
      const semId = currentSem?.id || activeSemesterId;

      const [curriculumData, blocksData, offeringsData, teachersData] = await Promise.all([
        api.get('/curriculum').catch(() => []),
        api.get('/curriculum/blocks').catch(() => []),
        semId
          ? api.get('/subject-offerings', { params: { semester_id: semId } }).catch(() => [])
          : Promise.resolve([]),
        api.get('/professors').catch(() => []),
      ]);

      const activeTermSubjects = filterActiveTermSubjects(
        curriculumData,
        blocksData,
        currentSem,
        offeringsData
      );
      const formattedTeachers = (Array.isArray(teachersData) ? teachersData : []).map((t) => ({
        ...t,
        name: `${t.first_name} ${t.last_name}`,
      }));

      setSubjects(activeTermSubjects);
      setTeachers(formattedTeachers);
      setFormData((prev) =>
        prev.subject_id && !activeTermSubjects.some((s) => String(s.id) === String(prev.subject_id))
          ? { ...prev, subject_id: '' }
          : prev
      );
    } catch (error) {
      console.error('Error fetching dropdown data');
      addToast('Failed to fetch required data', 'error');
    } finally {
      setIsLoadingDropdowns(false);
    }
  };

  const handleSelectSubject = (subjectId) => {
    const chosen = subjects.find((s) => String(s.id) === String(subjectId));
    const next = { ...formData, subject_id: subjectId };
    let matchedProfessor = false;
    if (chosen?.assigned_offerings?.length === 1) {
      const assignedId = String(chosen.assigned_offerings[0].faculty_id);
      const teacherExists = teachers.some((t) => String(t.id) === assignedId);
      const currentAlreadyAssigned = chosen.assigned_offerings.some(
        (o) => String(o.faculty_id) === String(formData.faculty_id)
      );
      if (teacherExists && (!formData.faculty_id || !currentAlreadyAssigned)) {
        next.faculty_id = assignedId;
        matchedProfessor = true;
      }
    }
    setFormData(next);
    setFormErrors((prev) => {
      const updated = { ...prev };
      if (prev.subject_id) {
        updated.subject_id = validateScheduleField('subject_id', next) || undefined;
      }
      if (matchedProfessor) {
        updated.faculty_id = undefined;
      }
      return updated;
    });
  };

  const handleOpenModal = () => {
    fetchDropdownData();
    setAiSuggestions([]);
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleGetSuggestions = async () => {
    if (!formData.subject_id) {
      setFormErrors((prev) => ({
        ...prev,
        subject_id: 'Select a subject first before requesting AI suggestions.',
      }));
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
    if (!validateScheduleForm()) return;
    if (!activeSemesterId) {
      addToast('No active semester found', 'error');
      return;
    }
    setIsSubmittingSchedule(true);
    try {
      const submissionData = {
        semester_id: activeSemesterId,
        curriculum_id: parseInt(formData.subject_id),
        room_id: null,
        faculty_id: parseInt(formData.faculty_id),
        day_of_week: formData.day_of_week,
        start_time: formData.start_time,
        end_time: formData.end_time,
        section: formData.section.trim()
      };
      await api.post('/schedules', submissionData);
      fetchSchedules();
      setIsModalOpen(false);
      setFormData(INITIAL_SCHEDULE_FORM);
      setFormConflicts([]);
      setAiSuggestions([]);
      setFormErrors({});
      addToast('Schedule created successfully', 'success');
    } catch (error) {
      const parsed = parseErrorResponse(error, 'Failed to create schedule', {
        curriculum_id: 'subject_id',
        faculty_id: 'faculty_id',
        day_of_week: 'day_of_week',
        start_time: 'start_time',
        end_time: 'end_time',
        section: 'section',
      });
      const nextFields = { ...parsed.fields };
      if (!Object.keys(nextFields).length) {
        if (/unassigned/i.test(parsed.message)) {
          nextFields.subject_id = parsed.message;
        } else if (/professor|not assigned/i.test(parsed.message)) {
          nextFields.faculty_id = parsed.message;
        } else if (/end time|start time/i.test(parsed.message)) {
          nextFields.end_time = parsed.message;
        }
      }
      if (Object.keys(nextFields).length > 0) {
        setFormErrors((prev) => ({ ...prev, ...nextFields }));
      }
      addToast(parsed.message || 'Failed to create schedule', 'error');
    } finally {
      setIsSubmittingSchedule(false);
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
                        setGenErrors({});
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

        <ScheduleHoverPopover
          hoveredSchedule={hoveredSchedule}
          getPopoverStyle={getPopoverStyle}
          onMouseEnter={handlePopoverMouseEnter}
          onMouseLeave={handlePopoverMouseLeave}
          canManageSchedules={canManageSchedules}
          onDeleteSchedule={(sched) => {
            handleDeleteSchedule(sched);
            setHoveredSchedule(null);
          }}
        />
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
        onRegenerate={() => { setIsLensOpen(false); setGenErrors({}); setIsGenerateModalOpen(true); }}
        resolvingId={resolvingId}
        causeFilter={lensCauseFilter}
        onFilterCause={setLensCauseFilter}
      />

      <ConflictResolutionDialog
        data={resolutionModalData}
        onClose={() => setResolutionModalData(null)}
      />

      <CreateScheduleModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmit}
        currentSemester={
          semesters.find((s) => s.id === activeSemesterId) ||
          semesters.find((s) => s.is_active) ||
          null
        }
        formatSemesterTerm={formatSemesterTerm}
        subjects={subjects}
        teachers={teachers}
        isLoadingDropdowns={isLoadingDropdowns}
        formData={formData}
        formErrors={formErrors}
        blockingFormConflicts={blockingFormConflicts}
        onSelectSubject={handleSelectSubject}
        onFieldChange={updateScheduleField}
        onFieldBlur={handleScheduleBlur}
        onGetSuggestions={handleGetSuggestions}
        isFetchingSuggestions={isFetchingSuggestions}
        aiSuggestions={aiSuggestions}
        onApplySuggestion={(sug) => {
          setFormData({
            ...formData,
            faculty_id: sug.faculty_id.toString(),
            day_of_week: sug.day_of_week,
            start_time: sug.start_time,
            end_time: sug.end_time,
          });
          setFormErrors((prev) => ({
            ...prev,
            faculty_id: undefined,
            day_of_week: undefined,
            start_time: undefined,
            end_time: undefined,
          }));
        }}
        isSubmitting={isSubmittingSchedule}
      />

      <GenerateScheduleModal
        isOpen={isGenerateModalOpen}
        onClose={() => setIsGenerateModalOpen(false)}
        onSubmit={handleGenerateSubmit}
        semesters={semesters}
        selectedGenSemester={selectedGenSemester}
        genErrors={genErrors}
        setGenErrors={setGenErrors}
        formatSemesterTerm={formatSemesterTerm}
        unassignedOfferingsData={unassignedOfferingsData}
        onReviewAssigned={() => {
          setIsGenerateModalOpen(false);
          navigate('/dashboard/assigned-subjects');
        }}
        allTeachers={allTeachers}
        selectedGenProfessors={selectedGenProfessors}
        setSelectedGenProfessors={setSelectedGenProfessors}
        isGenerating={isGenerating}
        generationResults={generationResults}
        onCloseAndClearResults={() => {
          setIsGenerateModalOpen(false);
          setGenerationResults(null);
        }}
        onSolveConflict={handleSolveConflict}
      />

      <ExportScheduleDialog
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        onDownload={handleDownload}
        isExporting={isExporting}
        exportRows={exportRows}
        exportFileName={exportFileName}
        exportTerm={exportTerm}
        formatSemesterTerm={formatSemesterTerm}
        selectedProfessorFilter={selectedProfessorFilter}
        globalSchedules={globalSchedules}
        exportScope={exportScope}
        setExportScope={setExportScope}
      />

      <ClearSchedulesDialog
        isOpen={isClearConfirmOpen}
        onClose={() => setIsClearConfirmOpen(false)}
        onConfirm={handleClearAllSchedules}
      />

      <UndoBackupToast
        undoBackup={undoBackup}
        onRestore={handleRestoreSchedules}
        onDismiss={() => setUndoBackup(null)}
      />
    </>
  );
}
