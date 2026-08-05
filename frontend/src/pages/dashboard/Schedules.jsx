import React, { useState, useEffect } from 'react';
import { ChevronDown, Plus, AlertTriangle, Sparkles, MapPin, User, Trash2, RotateCcw, X, Download, Printer, FileSpreadsheet } from 'lucide-react';
import Modal from '../../components/Modal';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';
import { detectConflicts, checkScheduleIntegrity } from '../../utils/conflictDetection';
import AtlasButton from '../../components/ui/Button';
import ConflictLens from '../../components/ui/ConflictLens';
import Badge from '../../components/ui/Badge';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { restrictionReason } from '../../components/ui/tokens';
import { isAdmin as isAdminRole, canEditSchedules } from '../../utils/session';

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

export default function Schedules() {
  const { addToast } = useToast();
  const [schedules, setSchedules] = useState([]);
  const [formConflicts, setFormConflicts] = useState([]);

  const [activeSemesterId, setActiveSemesterId] = useState(null);

  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [semesters, setSemesters] = useState([]);
  const [selectedGenSemester, setSelectedGenSemester] = useState('');
  const [selectedGenProfessors, setSelectedGenProfessors] = useState([]);
  const [generationResults, setGenerationResults] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const [globalSchedules, setGlobalSchedules] = useState([]);
  const [isGlobalLoading, setIsGlobalLoading] = useState(false);
  const [activeConflicts, setActiveConflicts] = useState([]);

  // --- Publication (FLOW-05 / DEP-1) -------------------------------------
  const isAdmin = isAdminRole();
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

  // The lens dismisses itself when the last conflict clears.
  useEffect(() => {
    if (isLensOpen && activeConflicts.length === 0) {
      setIsLensOpen(false);
      setLensCauseFilter(null);
    }
  }, [activeConflicts.length, isLensOpen]);

  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishBlockedReason, setPublishBlockedReason] = useState('');

  const fetchPublishState = async (semesterId) => {
    if (!semesterId) return;
    try {
      const data = await api.get(`/schedules/status?semester_id=${semesterId}`);
      setPublishState(data || { status: 'draft', total: 0, published: 0, unresolved_conflicts: 0 });
    } catch (e) {
      /* leave the badge on Draft rather than claiming a state we could not read */
    }
  };

  const handleTogglePublish = async () => {
    const next = publishState.status === 'published' ? 'draft' : 'published';
    setIsPublishing(true);
    try {
      const res = await api.patch('/schedules/status', {
        semester_id: activeSemesterId,
        department_id: publishState.department_id ?? undefined,
        status: next,
      });
      addToast(
        next === 'published'
          ? `Schedule published. ${res.affected} classes are now official.`
          : `Schedule unpublished and returned to draft.`,
        'success'
      );
      setIsPublishOpen(false);
      fetchPublishState(activeSemesterId);
      fetchGlobalSchedules(activeSemesterId);
    } catch (err) {
      // 409 carries the reason: unresolved conflicts, or nothing to publish.
      if (err.status === 409) setPublishBlockedReason(err.message);
      else addToast(err.message || 'Could not change the schedule status.', 'error');
    } finally {
      setIsPublishing(false);
    }
  };

  const [undoBackup, setUndoBackup] = useState(null);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);

  const fetchActiveConflicts = async () => {
    try {
      const data = await api.get('/ai-scheduler/conflicts');
      setActiveConflicts(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
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

  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);

  const handleExportCSV = () => {
    if (!globalSchedules || globalSchedules.length === 0) {
      addToast('No schedule entries to export', 'warning');
      return;
    }
    const headers = ['Subject Code', 'Subject Name', 'Day', 'Start Time', 'End Time', 'Room', 'Faculty', 'Department'];
    const rows = globalSchedules.map(s => [
      `"${formatSubjectCode(s)}"`,
      `"${(s.subject_name || '').replace(/"/g, '""')}"`,
      `"${s.day_of_week || ''}"`,
      `"${s.start_time || ''}"`,
      `"${s.end_time || ''}"`,
      `"${s.room_name || ''}"`,
      `"${s.faculty_name || ''}"`,
      `"${s.department_name || ''}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ATLAS_Schedule_Export_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast('Exported schedule to CSV file! 📊', 'success');
  };

  const handlePrintSchedule = () => {
    if (!globalSchedules || globalSchedules.length === 0) {
      addToast('No schedule entries to print', 'warning');
      return;
    }
    window.print();
  };

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

  useEffect(() => {
    api.get('/semesters').then(sems => {
      const safeSems = Array.isArray(sems) ? sems : [];
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
  const localOverlapCount = schedules.filter(s => s.isConflicting).length;
  const activeConflictsCount = Math.max(activeConflicts.length, localOverlapCount);

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

        <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden p-8">
          <div className="flex justify-between items-center mb-8">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-3xl font-black text-slate-900 tracking-tighter leading-none">Department Faculty Schedules</h3>
                {/* The schedule's publication state is the first thing anyone
                    needs to read, and it was previously invisible (FLOW-05). */}
                <Badge status={publishState.status === 'published' ? 'published' : 'draft'} />
              </div>
              <p className="text-slate-400 font-medium text-sm">
                {publishState.total > 0
                  ? `${publishState.total} classes · ${publishState.status === 'published' ? 'official and visible to all departments' : 'not yet published'}`
                  : 'Weekly view of schedules for the professors in your department.'}
              </p>
            </div>
            <div className="flex gap-4 items-center">
              {/* Publishing is what makes a schedule official (DEP-1). Chairs see
                  the restricted variant naming who can do it, rather than a
                  control that fails after the fact. */}
              {isAdmin ? (
                <AtlasButton
                  onClick={() => setIsPublishOpen(true)}
                  variant={publishState.status === 'published' ? 'secondary' : 'primary'}
                  disabled={publishState.total === 0}
                  className="no-print"
                >
                  {publishState.status === 'published' ? 'Unpublish' : 'Publish Schedule'}
                </AtlasButton>
              ) : (
                <AtlasButton
                  restricted
                  restrictionReason={restrictionReason('admin', 'publish schedules')}
                  className="no-print"
                >
                  Publish Schedule
                </AtlasButton>
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
                  {activeConflictsCount} {activeConflictsCount === 1 ? 'Conflict' : 'Conflicts'}
                </AtlasButton>
              )}
              {/* Professor Filter */}
              <div className="min-w-[280px] relative group">
                <select
                  className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200/50 rounded-2xl text-[11px] font-black text-slate-700 focus:ring-2 focus:ring-green-500 uppercase tracking-[0.2em] shadow-sm appearance-none cursor-pointer transition-all hover:bg-slate-100/50 pr-12"
                  value={selectedProfessorFilter}
                  onChange={(e) => setSelectedProfessorFilter(e.target.value)}
                >
                  <option value="">All Faculty</option>
                  {allTeachers.map(t => (
                    <option key={t.id} value={t.name}>{t.name}</option>
                  ))}
                </select>
                <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 group-hover:text-slate-600 transition-colors">
                  <ChevronDown className="w-4 h-4" />
                </div>
              </div>

              {canManageSchedules && (
                <div className="flex gap-3 items-center ml-2">
                  <button
                    onClick={() => {
                      fetchGenerateData();
                      setIsGenerateModalOpen(true);
                      setGenerationResults(null);
                    }}
                    className="bg-green-700 hover:bg-green-800 text-white px-8 py-3.5 rounded-2xl flex items-center shadow-lg shadow-green-900/20 transition-all font-black text-[11px] uppercase tracking-[0.2em] transform hover:scale-105 active:scale-95 whitespace-nowrap"
                  >
                    <Sparkles className="w-4 h-4 mr-2" /> Generate
                  </button>
                  <button
                    onClick={handleOpenModal}
                    className="px-6 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-[11px] font-black flex items-center shadow-sm transition-colors uppercase tracking-[0.2em] transform hover:scale-105 active:scale-95 whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4 mr-1" /> Create
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
                      className="px-5 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl text-[11px] font-black flex items-center shadow-xs transition-all uppercase tracking-[0.2em] transform hover:scale-105 active:scale-95 whitespace-nowrap"
                    >
                      <Download className="w-4 h-4 mr-1.5" /> Export
                    </button>
                    {isExportDropdownOpen && (
                      <div className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-xl border border-slate-100 z-50 overflow-hidden py-1.5 animate-in fade-in slide-in-from-top-2">
                        <button
                          type="button"
                          onClick={() => { handleExportCSV(); setIsExportDropdownOpen(false); }}
                          className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                        >
                          <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Export CSV / Excel
                        </button>
                        <button
                          type="button"
                          onClick={() => { handlePrintSchedule(); setIsExportDropdownOpen(false); }}
                          className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 border-t border-slate-100"
                        >
                          <Printer className="w-4 h-4 text-indigo-600" /> Print / Save PDF
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setIsClearConfirmOpen(true)}
                    className="px-5 py-3.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/60 rounded-2xl text-[11px] font-black flex items-center shadow-xs transition-all uppercase tracking-[0.2em] transform hover:scale-105 active:scale-95 whitespace-nowrap"
                    title="Clear all schedules for this semester"
                  >
                    <Trash2 className="w-4 h-4 mr-1.5" /> Clear All
                  </button>
                </div>
              )}
            </div>
          </div>


          <div className="mt-12 mb-8"></div>

          {/* Faculty Color Legend Bar */}
          {globalSchedules.length > 0 && (
            <div className="mt-8 mb-4 p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] mb-2.5 flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-green-700" /> Faculty Color Legend (Click to filter)
              </div>
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set(globalSchedules.map(s => s.faculty_name).filter(Boolean))).map(prof => {
                  const color = getFacultyColor(prof);
                  const isSelected = selectedProfessorFilter === prof;
                  return (
                    <button
                      key={prof}
                      type="button"
                      onClick={() => setSelectedProfessorFilter(isSelected ? '' : prof)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all ${
                        isSelected
                          ? 'ring-2 ring-green-600 shadow-md bg-slate-900 text-white border-slate-900 scale-105'
                          : `${color.bg} ${color.border} ${color.text} hover:scale-105 shadow-2xs`
                      }`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full ${color.dot}`} />
                      <span>{prof}</span>
                    </button>
                  );
                })}
                {selectedProfessorFilter && (
                  <button
                    type="button"
                    onClick={() => setSelectedProfessorFilter('')}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200 transition-all"
                  >
                    Clear Filter
                  </button>
                )}
              </div>
            </div>
          )}

          {isGlobalLoading ? (
            <div className="flex justify-center py-20"><Sparkles className="w-8 h-8 text-indigo-400 animate-spin" /></div>
          ) : (
            /* The scroll container and the wide content must be separate elements:
               `overflow-x-auto` and `min-w-[900px]` on the same div meant the div
               grew to 900px and overflowed its parent instead of scrolling. */
            <div className="print-grid relative mt-12 overflow-x-auto pb-8">
            <div className="flex relative min-w-[900px]">
              {/* Time column (7:30 AM to 7:30 PM - 12 hours) */}
              <div className="w-20 flex flex-col relative border-r border-slate-200 pr-4 shrink-0" style={{ height: '1400px' }}>
                {Array.from({length: 13}).map((_, i) => (
                  <div key={i} className="absolute w-full text-right text-xs font-black text-slate-400" style={{ top: `${(i/12)*100}%`, transform: 'translateY(-50%)' }}>
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
                      <div className="absolute -top-10 w-full text-center text-xs font-black text-slate-600 uppercase tracking-[0.25em] bg-slate-100 py-1.5 rounded-xl border border-slate-200">{day}</div>
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
                              <span className="text-xs font-black uppercase tracking-wider text-slate-900">{formatSubjectCode(sched)}</span>
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
                              <div className="font-black text-xs sm:text-sm leading-snug text-slate-900" title={sched.subject_name}>
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

      {/* Publishing is what makes a schedule official, so it names its blast
          radius and requires the term typed back (Phase 2 Screen 2). */}
      <ConfirmDialog
        isOpen={isPublishOpen}
        onClose={() => { setIsPublishOpen(false); setPublishBlockedReason(''); }}
        onConfirm={handleTogglePublish}
        title={
          publishBlockedReason
            ? 'This schedule cannot be published yet'
            : publishState.status === 'published'
              ? 'Return this schedule to draft?'
              : 'Publish this schedule?'
        }
        description={
          publishState.status === 'published'
            ? `${publishState.total} classes will stop being official and the published notice will be removed.`
            : `This makes ${publishState.total} classes official and visible to all departments. Published schedules must be returned to draft before they can be edited.`
        }
        confirmLabel={publishState.status === 'published' ? 'Return to Draft' : 'Publish Schedule'}
        confirmPhrase={publishState.status === 'published' ? undefined : 'PUBLISH'}
        destructive={publishState.status === 'published'}
        loading={isPublishing}
        blocked={Boolean(publishBlockedReason)}
        blockedReason={publishBlockedReason}
      />

      {/* Replaces the ConflictPanel slide-over, which sat physically apart from
          the grid so resolving a conflict meant reading a description and then
          hunting for the block it referred to (HEU-08). */}
      <ConflictLens
        isOpen={isLensOpen}
        conflicts={activeConflicts}
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
                <label className="block text-xs font-black text-slate-400 mb-2 uppercase tracking-[0.2em]">Active Semester</label>
                {(() => {
                  const activeSem = semesters.find(s => s.is_active) || (selectedGenSemester ? semesters.find(s => s.id === Number(selectedGenSemester)) : null);
                  return (
                    <div className="p-4 bg-emerald-50/80 border border-emerald-200/90 rounded-2xl flex items-center justify-between pointer-events-none select-none">
                      <div>
                        <p className="text-sm font-black text-emerald-950">
                          {activeSem ? `${activeSem.academic_year} ${formatSemesterTerm(activeSem.term)}` : 'No Active Semester Configured'}
                        </p>
                        <p className="text-[11px] font-bold text-emerald-700/80 mt-0.5">
                          Target Academic Period for AI Scheduling Engine
                        </p>
                      </div>
                      {activeSem && (
                        <span className="bg-emerald-700 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 shadow-xs">
                          Status: ACTIVE
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 mb-2 uppercase tracking-[0.2em]">Select Professors to Schedule</label>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl max-h-60 overflow-y-auto p-2">
                  {allTeachers.map(prof => (
                    <label key={prof.id} className="flex items-center p-3 hover:bg-white rounded-xl cursor-pointer transition-all gap-3 group">
                      <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                        selectedGenProfessors.includes(prof.id) ? 'bg-green-600 border-green-600' : 'bg-white border-slate-300 group-hover:border-slate-400'
                      }`}>
                        {selectedGenProfessors.includes(prof.id) && <span className="text-white text-xs font-black">✓</span>}
                      </div>
                      <input 
                        type="checkbox" 
                        className="hidden"
                        checked={selectedGenProfessors.includes(prof.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedGenProfessors([...selectedGenProfessors, prof.id]);
                          else setSelectedGenProfessors(selectedGenProfessors.filter(id => id !== prof.id));
                        }}
                      />
                      <span className={`text-sm font-bold ${selectedGenProfessors.includes(prof.id) ? 'text-slate-800' : 'text-slate-600'}`}>
                        {prof.name}
                      </span>
                    </label>
                  ))}
                  {allTeachers.length === 0 && (
                    <div className="p-4 text-center text-xs font-bold text-slate-400">No professors found.</div>
                  )}
                </div>
                <div className="flex justify-end mt-2">
                  <button 
                    type="button" 
                    onClick={() => setSelectedGenProfessors(allTeachers.map(t => t.id))}
                    className="text-[10px] font-black text-green-600 uppercase tracking-widest hover:underline"
                  >
                    Select All
                  </button>
                </div>
              </div>

              <div className="pt-4 flex justify-end items-center gap-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsGenerateModalOpen(false)}
                  className="text-[11px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-[0.25em] transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isGenerating}
                  className="px-10 py-3 text-[13px] font-black text-white bg-green-700 hover:bg-green-800 rounded-full shadow-lg shadow-green-100 uppercase tracking-[0.15em] transition-all disabled:opacity-50 flex items-center"
                >
                  {isGenerating ? <Sparkles className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  {isGenerating ? 'Generating...' : 'Start Engine'}
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-6 animate-in zoom-in-95 duration-300">
              <div className="text-center bg-green-50 rounded-[2rem] p-8 border border-green-100">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm text-green-600 mb-4">
                  <Sparkles className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tighter mb-2">Generation Complete</h3>
                <p className="text-sm font-bold text-slate-600">
                  <span className="text-green-700 text-lg font-black">{generationResults.generated}</span> schedules generated successfully.
                </p>
                <p className="text-sm font-bold text-slate-600">
                  <span className="text-rose-600 text-lg font-black">{generationResults.unplaced_count}</span> subjects unplaced.
                </p>
                <p className="text-xs font-bold text-slate-500 mt-2">
                  Skipped GenEd: {generationResults.skipped_gened}
                </p>
              </div>

              {generationResults.unplaced_items?.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-xs font-black text-rose-600 uppercase tracking-[0.2em]">Unplaced Subjects ({generationResults.unplaced_items.length})</h4>
                    {/* The second "Auto-Solve All" was here. Same removal
                        reasoning as the panel's: it looped a resolver that
                        force-placed on failure, so one click could double-book
                        an entire term and report success. Unplaced subjects are
                        resolved one at a time below. */}
                  </div>
                  <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                    {generationResults.unplaced_items.map((item, idx) => (
                      <div key={idx} className="bg-rose-50/50 border border-rose-100 rounded-2xl p-4 flex gap-4 items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-12 h-10 bg-white rounded-xl flex items-center justify-center text-rose-500 shadow-sm shrink-0 font-black text-xs px-2">
                            {item.subject}
                          </div>
                          <div className="min-w-0">
                            {item.section && item.section.trim() !== "" && (
                              <p className="text-sm font-black text-slate-900 leading-tight">{item.section}</p>
                            )}
                            <p className="text-xs font-bold text-rose-600 mt-0.5">{item.reason}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSolveConflict(item)}
                          className="shrink-0 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-black rounded-xl shadow-xs transition-all flex items-center gap-1 uppercase tracking-wider"
                        >
                          <Sparkles className="w-3 h-3" />
                          Solve Issue
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {generationResults.workload_warnings?.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-black text-amber-700 uppercase tracking-[0.2em]">
                      Faculty Workload Exceeded ({generationResults.workload_warnings.length})
                    </h4>
                  </div>
                  <div className="space-y-2.5 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                    {generationResults.workload_warnings.map((warn, idx) => (
                      <div key={idx} className="bg-amber-50/80 border border-amber-200/90 rounded-2xl p-4 flex items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-slate-900 text-xs">{warn.faculty_name}</span>
                            <span className="px-2 py-0.5 rounded-md bg-amber-200/80 text-amber-900 font-black text-[9px] uppercase tracking-wider">
                              {warn.employment_type || 'Full-Time'}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-amber-800 mt-1">
                            Current: <strong className="text-slate-900">{warn.current_units} units</strong> / Max: <strong className="text-slate-900">{warn.max_units} units</strong>
                          </p>
                          <p className="text-[11px] font-medium text-amber-700 mt-0.5">
                            Subject Conflict: <span className="font-bold">{warn.subject_code}</span> (+{warn.additional_units} units)
                          </p>
                        </div>
                        <span className="px-3 py-1 bg-amber-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shrink-0 shadow-xs">
                          APPROVAL REQUIRED
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-4 flex justify-center border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsGenerateModalOpen(false);
                    setGenerationResults(null);
                  }}
                  className="px-10 py-3 text-[13px] font-black text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full uppercase tracking-[0.15em] transition-all"
                >
                  Close & View Schedule
                </button>
              </div>
            </div>
          )}
        </form>
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
              className="px-5 py-2.5 text-xs font-black text-slate-500 hover:text-slate-700 uppercase tracking-wider"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleClearAllSchedules}
              className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl uppercase tracking-wider shadow-sm"
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
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-black rounded-xl uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md"
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
