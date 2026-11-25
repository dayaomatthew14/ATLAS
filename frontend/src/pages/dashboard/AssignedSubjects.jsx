import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  UserX,
  Search,
  RefreshCw,
  Monitor,
  ShieldCheck,
  Building2,
  Check,
  X,
} from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';
import Button from '../../components/ui/Button';
import Modal from '../../components/Modal';
import { focusRing } from '../../components/ui/tokens';
import { ValidationAnchor } from '../../components/ui/ValidationPopup';
import { parseErrorResponse } from '../../utils/validation';
import {
  formatMinutesLabel,
  computeSubjectMinutes,
  employmentTypeLabel,
  CT_TIER_OPTIONS,
  CT_TIERS,
} from '../../utils/load';
import { canManageCastLabRooms, isCastUser, isPriorityLabProgram } from '../../utils/session';

const formatYearLevel = (val) => {
  if (!val) return '—';
  const s = String(val).trim();
  if (s === '1') return '1st Year';
  if (s === '2') return '2nd Year';
  if (s === '3') return '3rd Year';
  if (s === '4') return '4th Year';
  if (s.toLowerCase().includes('year')) return s;
  return `${s} Year`;
};

export default function AssignedSubjects() {
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    active_semester: null,
    department: null,
    summary: { total: 0, assigned: 0, unassigned: 0, ct_count: 0, lab_count: 0, lab_assigned_room_count: 0, pending_room_approval_count: 0, all_assigned: true },
    subjects: []
  });

  // Filter states
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'assigned' | 'unassigned' | 'ct' | 'lab' | 'pending_room'
  const [courseFilter, setCourseFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [professorFilter, setProfessorFilter] = useState('all'); // 'all' | professor_name
  const [roomFilter, setRoomFilter] = useState('all'); // 'all' | 'assigned' | 'unassigned' | 'pending_approval' | room_name
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [updatingCtId, setUpdatingCtId] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 120);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Professor roster for assignment modal
  const [allProfessors, setAllProfessors] = useState([]);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [selectedProfId, setSelectedProfId] = useState('');
  const [assignError, setAssignError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Lab Rooms roster and modal
  const [labRooms, setLabRooms] = useState([]);
  const [roomModalOpen, setRoomModalOpen] = useState(false);
  const [selectedRoomSubject, setSelectedRoomSubject] = useState(null);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [roomSubmitting, setRoomSubmitting] = useState(false);
  const [roomError, setRoomError] = useState('');

  // Review modal state (for CS/COE chair approving/rejecting non-priority programs)
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewSubject, setReviewSubject] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  // Confirmation modal for Gen Ed subject assignment / override
  const [confirmOverrideModalOpen, setConfirmOverrideModalOpen] = useState(false);
  const [pendingOverrideData, setPendingOverrideData] = useState(null);

  const canManageLabs = canManageCastLabRooms();

  // Fetch assigned subjects for active term
  const fetchAssignedSubjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/subject-offerings/assigned-subjects');
      setData(res || {
        active_semester: null,
        department: null,
        summary: { total: 0, assigned: 0, unassigned: 0, ct_count: 0, lab_count: 0, lab_assigned_room_count: 0, pending_room_approval_count: 0, all_assigned: true },
        subjects: []
      });
    } catch (err) {
      console.error('Failed to fetch assigned subjects:', err);
      addToast(err.message || 'Failed to load assigned subjects.', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  // Fetch professors list for the assignment modal
  const fetchProfessors = useCallback(async () => {
    try {
      const profs = await api.get('/professors').catch(() => []);
      const formatted = (Array.isArray(profs) ? profs : []).map(p => ({
        ...p,
        name: `${p.first_name} ${p.last_name}`.trim()
      }));
      setAllProfessors(formatted);
    } catch (e) {
      console.error('Failed to load professors:', e);
    }
  }, []);

  // Fetch available CAST lab rooms
  const fetchLabRooms = useCallback(async () => {
    try {
      const rooms = await api.get('/subject-offerings/available-lab-rooms').catch(() => []);
      setLabRooms(Array.isArray(rooms) ? rooms : []);
    } catch (e) {
      console.error('Failed to load lab rooms:', e);
    }
  }, []);

  useEffect(() => {
    fetchAssignedSubjects();
    fetchProfessors();
    fetchLabRooms();
  }, [fetchAssignedSubjects, fetchProfessors, fetchLabRooms]);

  // Unique list of programs / courses for dropdown
  const courseOptions = useMemo(() => {
    const set = new Set();
    if (Array.isArray(data.curriculum_courses)) {
      data.curriculum_courses.forEach(b => {
        if (b.name && b.name.trim()) set.add(b.name.trim());
      });
    }
    (data.subjects || []).forEach(s => {
      const prog = s.program_name;
      if (prog && prog.trim()) set.add(prog.trim());
    });
    return Array.from(set).sort();
  }, [data.curriculum_courses, data.subjects]);

  // Unique list of year levels for dropdown
  const yearOptions = useMemo(() => {
    const set = new Set();
    (data.subjects || []).forEach(s => {
      const y = String(s.year_level || '').trim();
      if (y) set.add(y);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [data.subjects]);

  // Unique list of assigned professors for dropdown
  const assignedProfessorOptions = useMemo(() => {
    const set = new Set();
    (data.subjects || []).forEach(s => {
      if (s.status === 'assigned' && s.assigned_professors?.length) {
        s.assigned_professors.forEach(p => {
          if (p.faculty_name) set.add(p.faculty_name);
        });
      }
    });
    return Array.from(set).sort();
  }, [data.subjects]);

  // Filtered subjects
  const filteredSubjects = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return (data.subjects || []).filter(sub => {
      // 1. Status tab filter
      if (statusFilter === 'assigned' && sub.status !== 'assigned') return false;
      if (statusFilter === 'unassigned' && sub.status !== 'unassigned') return false;
      if (statusFilter === 'ct' && !sub.is_ct) return false;
      if (statusFilter === 'lab' && !sub.is_lab) return false;
      if (statusFilter === 'pending_room' && sub.room_approval_status !== 'pending_approval') return false;

      // 2. Course filter
      if (courseFilter !== 'all') {
        const progName = (sub.program_name || '').trim();
        const progCode = (sub.program_code || '').trim();
        if (progName !== courseFilter && progCode !== courseFilter) return false;
      }

      // 3. Year level filter
      if (yearFilter !== 'all') {
        const y = String(sub.year_level || '').trim();
        if (y !== yearFilter) return false;
      }

      // 4. Professor filter
      if (professorFilter !== 'all') {
        const matchesProf = sub.assigned_professors?.some(p => p.faculty_name === professorFilter);
        if (!matchesProf) return false;
      }

      // 5. Consolidated Laboratory Room filter
      if (roomFilter === 'assigned') {
        if (!sub.room_id) return false;
      } else if (roomFilter === 'unassigned') {
        if (!sub.is_lab || sub.room_id) return false;
      } else if (roomFilter === 'pending_approval') {
        if (sub.room_approval_status !== 'pending_approval') return false;
      } else if (roomFilter !== 'all') {
        if (sub.room_name !== roomFilter) return false;
      }

      // 6. Search query
      if (q) {
        const matchCode = (sub.code || '').toLowerCase().includes(q);
        const matchName = (sub.name || '').toLowerCase().includes(q);
        const matchRoom = (sub.room_name || '').toLowerCase().includes(q);
        const matchProf = sub.assigned_professors?.some(p => p.faculty_name.toLowerCase().includes(q));
        if (!matchCode && !matchName && !matchProf && !matchRoom) return false;
      }

      return true;
    });
  }, [data.subjects, statusFilter, courseFilter, yearFilter, professorFilter, roomFilter, debouncedQuery]);

  // Open assignment modal for a subject
  const handleOpenAssignModal = (subject) => {
    setSelectedSubject(subject);
    setAssignError('');
    if (subject.assigned_professors?.length > 0) {
      setSelectedProfId(String(subject.assigned_professors[0].faculty_id));
    } else {
      setSelectedProfId('');
    }
    setAssignModalOpen(true);
  };

  // Open room modal for a laboratory subject
  const handleOpenRoomModal = (subject) => {
    setSelectedRoomSubject(subject);
    setRoomError('');
    setSelectedRoomId(subject.room_id ? String(subject.room_id) : '');
    setRoomModalOpen(true);
  };

  // Open approval review modal for a pending room assignment
  const handleOpenReviewModal = (subject) => {
    setReviewSubject(subject);
    setRejectReason('');
    setReviewModalOpen(true);
  };

  // Perform the actual API assignment / reassignment
  const executeAssignment = async (subject, profId) => {
    setIsSubmitting(true);
    try {
      await api.post('/subject-offerings', {
        faculty_id: parseInt(profId, 10),
        curriculum_id: subject.curriculum_id,
        semester_id: data.active_semester.id
      });

      addToast(`Assigned professor to ${subject.code}.`, 'success');
      setAssignModalOpen(false);
      setAssignError('');
      setConfirmOverrideModalOpen(false);
      setPendingOverrideData(null);
      fetchAssignedSubjects();
    } catch (err) {
      console.error(err);
      const parsed = parseErrorResponse(err, 'Failed to assign professor.');
      setAssignError(parsed.message);
      addToast(parsed.message || 'Failed to assign professor.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Unassign professor from inside the Change Assigned Professor modal
  const handleUnassignFromModal = async () => {
    if (!selectedSubject?.assigned_professors?.length) return;
    const currentOffering = selectedSubject.assigned_professors[0];
    setIsSubmitting(true);
    try {
      await api.delete(`/subject-offerings/${currentOffering.offering_id}`);
      addToast(`Unassigned ${currentOffering.faculty_name} from ${selectedSubject.code}.`, 'success');
      setAssignModalOpen(false);
      setAssignError('');
      fetchAssignedSubjects();
    } catch (err) {
      console.error(err);
      const parsed = parseErrorResponse(err, 'Failed to remove assignment.');
      setAssignError(parsed.message);
      addToast(parsed.message || 'Failed to remove assignment.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit assignment / re-assignment
  const handleSaveAssignment = async (e) => {
    e.preventDefault();
    if (!selectedSubject) return;
    if (!selectedProfId) {
      setAssignError('Please select a professor to assign.');
      return;
    }
    if (!data.active_semester) {
      setAssignError('No active semester configured.');
      addToast('No active semester configured.', 'error');
      return;
    }

    const currentOffering = selectedSubject.assigned_professors?.[0];
    const isOverride = Boolean(currentOffering && String(currentOffering.faculty_id) !== String(selectedProfId));
    const targetProf = allProfessors.find(p => String(p.id) === String(selectedProfId));

    if (!selectedSubject.is_major) {
      setPendingOverrideData({
        subject: selectedSubject,
        profId: selectedProfId,
        targetProfName: targetProf?.name || 'Selected Professor',
        currentProfName: currentOffering?.faculty_name || 'Unassigned',
        isOverride
      });
      setConfirmOverrideModalOpen(true);
      return;
    }

    await executeAssignment(selectedSubject, selectedProfId);
  };

  // Save room assignment for a laboratory subject
  const handleSaveRoomAssignment = async (e) => {
    if (e) e.preventDefault();
    if (!selectedRoomSubject || !data.active_semester) return;
    setRoomSubmitting(true);
    setRoomError('');
    try {
      const res = await api.post('/subject-offerings/assign-room', {
        curriculum_id: selectedRoomSubject.curriculum_id,
        semester_id: data.active_semester.id,
        room_id: selectedRoomId ? parseInt(selectedRoomId, 10) : null,
      });
      addToast(res.message || 'Room assignment saved.', 'success');
      setRoomModalOpen(false);
      fetchAssignedSubjects();
    } catch (err) {
      console.error(err);
      const parsed = parseErrorResponse(err, 'Failed to assign room.');
      setRoomError(parsed.message);
      addToast(parsed.message || 'Failed to assign room.', 'error');
    } finally {
      setRoomSubmitting(false);
    }
  };

  // Clear room assignment
  const handleUnassignRoom = async () => {
    if (!selectedRoomSubject || !data.active_semester) return;
    setRoomSubmitting(true);
    try {
      await api.post('/subject-offerings/assign-room', {
        curriculum_id: selectedRoomSubject.curriculum_id,
        semester_id: data.active_semester.id,
        room_id: null,
      });
      addToast(`Cleared room assignment for ${selectedRoomSubject.code}.`, 'success');
      setRoomModalOpen(false);
      fetchAssignedSubjects();
    } catch (err) {
      console.error(err);
      addToast(err.message || 'Failed to clear room assignment.', 'error');
    } finally {
      setRoomSubmitting(false);
    }
  };

  // Approve a pending room assignment
  const handleApproveRoom = async () => {
    const offId = reviewSubject?.offering_id || reviewSubject?.assigned_professors?.[0]?.offering_id;
    if (!offId) return;
    setReviewSubmitting(true);
    try {
      await api.post(`/subject-offerings/${offId}/approve-room`);
      addToast(`Approved room assignment for ${reviewSubject.code}.`, 'success');
      setReviewModalOpen(false);
      fetchAssignedSubjects();
    } catch (err) {
      console.error(err);
      addToast(err.message || 'Failed to approve room assignment.', 'error');
    } finally {
      setReviewSubmitting(false);
    }
  };

  // Decline a pending room assignment
  const handleRejectRoom = async () => {
    const offId = reviewSubject?.offering_id || reviewSubject?.assigned_professors?.[0]?.offering_id;
    if (!offId) return;
    setReviewSubmitting(true);
    try {
      await api.post(`/subject-offerings/${offId}/reject-room`, {
        reason: rejectReason.trim() || 'Room request declined by CS/COE Program Chair.',
      });
      addToast(`Declined room request for ${reviewSubject.code}.`, 'warning');
      setReviewModalOpen(false);
      fetchAssignedSubjects();
    } catch (err) {
      console.error(err);
      addToast(err.message || 'Failed to decline room request.', 'error');
    } finally {
      setReviewSubmitting(false);
    }
  };

  // Inline update for Converted Tutorial (CT) tier
  const handleUpdateCtTier = async (subject, nextTier) => {
    const offeringId = subject?.offering_id || subject?.assigned_professors?.[0]?.offering_id;
    if (!offeringId) return;
    setUpdatingCtId(offeringId);
    try {
      const updated = await api.patch(`/subject-offerings/${offeringId}/ct`, {
        ct_tier: nextTier,
      });
      setData((prev) => {
        const nextSubjects = (prev.subjects || []).map((item) => {
          if (item.curriculum_id !== subject.curriculum_id) return item;
          return {
            ...item,
            enrolled_students: updated.enrolled_students,
            ct_tier: updated.ct_tier,
            is_ct: updated.is_ct,
            ct_label: updated.ct_label,
            ct_short_label: updated.ct_short_label,
            regular_minutes: updated.regular_minutes,
            regular_hours: updated.regular_hours,
            regular_hours_label: updated.regular_hours_label,
            required_minutes: updated.required_minutes,
            required_hours: updated.required_hours,
            required_hours_label: updated.required_hours_label,
          };
        });
        const nextCtCount = nextSubjects.filter((s) => s.is_ct).length;
        return {
          ...prev,
          summary: {
            ...(prev.summary || {}),
            ct_count: nextCtCount,
          },
          subjects: nextSubjects,
        };
      });
      const baseToast = updated.is_ct
        ? `${subject.code} set to ${updated.ct_label} — ${updated.required_hours_label}/week.`
        : `${subject.code} restored to Regular (13+ students) — ${updated.required_hours_label}/week.`;
      const rescheduleNote = updated.needs_reschedule
        ? ' Regenerate or adjust its timetable slot on Schedule to match the new CT duration.'
        : '';
      addToast(`${baseToast}${rescheduleNote}`, updated.needs_reschedule ? 'warning' : 'success');
    } catch (err) {
      console.error(err);
      addToast(err.message || 'Failed to update Converted Tutorial status.', 'error');
    } finally {
      setUpdatingCtId(null);
    }
  };

  const summary = data?.summary || {
    total: 0,
    assigned: 0,
    unassigned: 0,
    ct_count: 0,
    lab_count: 0,
    lab_assigned_room_count: 0,
    pending_room_approval_count: 0,
    all_assigned: true,
  };
  const ctCount = summary.ct_count ?? (data?.subjects || []).filter((s) => s.is_ct).length;
  const labCount = summary.lab_count ?? (data?.subjects || []).filter((s) => s.is_lab).length;
  const labAssignedCount = summary.lab_assigned_room_count ?? (data?.subjects || []).filter((s) => s.is_lab && s.room_id).length;
  const pendingApprovalCount = summary.pending_room_approval_count ?? (data?.subjects || []).filter((s) => s.room_approval_status === 'pending_approval').length;
  const active_semester = data?.active_semester;
  const department = data?.department;

  const isRoomSubjectPriority = selectedRoomSubject ? isPriorityLabProgram(selectedRoomSubject.program_code || selectedRoomSubject.program_name) : false;

  return (
    <div className="w-full max-w-[1640px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              {department?.code || 'Department'}
            </span>
            <span className="text-slate-400">·</span>
            <span className="font-ui text-xs font-semibold text-slate-500">
              Major Subjects, General Education & Laboratory Rooms · Active Term
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Subjects & Rooms
          </h1>
          <p className="font-ui text-sm text-slate-600 mt-1">
            {active_semester
              ? `${active_semester.academic_year} · ${
                  /semester/i.test(String(active_semester.term || ''))
                    ? active_semester.term.replace(/semester/i, 'Semester')
                    : `${active_semester.term} Semester`
                }`
              : 'No active academic term configured'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            icon={RefreshCw}
            loading={loading}
            onClick={fetchAssignedSubjects}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Stat Tiles (Total, Assigned, Lab Rooms, Unassigned) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Subjects */}
        <div className="glass rounded-panel p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="font-ui text-xs font-bold uppercase tracking-wider text-slate-500">
              Total Subjects
            </p>
            <p className="text-3xl font-extrabold text-slate-900 mt-1 tabular-nums">
              {summary.total}
            </p>
            <p className="font-ui text-xs text-slate-500 mt-1">
              Major subjects & assigned Gen Ed
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
            <BookOpen className="w-6 h-6 stroke-[2]" />
          </div>
        </div>

        {/* Assigned Faculty */}
        <div className="glass rounded-panel p-5 border border-emerald-200/80 bg-emerald-50/40 shadow-xs flex items-center justify-between">
          <div>
            <p className="font-ui text-xs font-bold uppercase tracking-wider text-emerald-900">
              Assigned Faculty
            </p>
            <p className="text-3xl font-extrabold text-emerald-950 mt-1 tabular-nums">
              {summary.assigned}
            </p>
            <p className="font-ui text-xs text-emerald-800 mt-1">
              {summary.total > 0
                ? `${Math.round((summary.assigned / summary.total) * 100)}% faculty assigned`
                : 'Ready for scheduling'}
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
            <UserCheck className="w-6 h-6 stroke-[2]" />
          </div>
        </div>

        {/* Laboratory Rooms Assigned */}
        <div className="glass rounded-panel p-5 border border-teal-200/80 bg-teal-50/40 shadow-xs flex items-center justify-between">
          <div>
            <p className="font-ui text-xs font-bold uppercase tracking-wider text-teal-900">
              Lab Rooms Assigned
            </p>
            <p className="text-3xl font-extrabold text-teal-950 mt-1 tabular-nums">
              {labAssignedCount}
              <span className="text-base font-normal text-teal-700 ml-1.5">/ {labCount}</span>
            </p>
            <p className="font-ui text-xs text-teal-800 mt-1">
              {pendingApprovalCount > 0 ? (
                <span className="font-bold text-amber-800 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  {pendingApprovalCount} pending CS/COE approval
                </span>
              ) : (
                'Computer lab allocations'
              )}
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center shrink-0">
            <Monitor className="w-6 h-6 stroke-[2]" />
          </div>
        </div>

        {/* Unassigned Faculty */}
        <div className={`glass rounded-panel p-5 border shadow-xs flex items-center justify-between ${
          summary.unassigned > 0
            ? 'border-amber-300 bg-amber-50/60 ring-2 ring-amber-300/40'
            : 'border-slate-200 bg-white'
        }`}>
          <div>
            <div className="flex items-center gap-1.5">
              <p className={`font-ui text-xs font-bold uppercase tracking-wider ${
                summary.unassigned > 0 ? 'text-amber-900' : 'text-slate-500'
              }`}>
                Unassigned Faculty
              </p>
              {summary.unassigned > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              )}
            </div>
            <p className={`text-3xl font-extrabold mt-1 tabular-nums ${
              summary.unassigned > 0 ? 'text-amber-950' : 'text-slate-900'
            }`}>
              {summary.unassigned}
            </p>
            <p className={`font-ui text-xs mt-1 ${
              summary.unassigned > 0 ? 'text-amber-800 font-medium' : 'text-slate-500'
            }`}>
              {summary.unassigned > 0 ? 'Must assign before scheduling' : 'All subjects assigned'}
            </p>
          </div>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
            summary.unassigned > 0
              ? 'bg-amber-100 text-amber-900 border border-amber-300'
              : 'bg-slate-100 text-slate-500'
          }`}>
            <UserX className="w-6 h-6 stroke-[2]" />
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="glass rounded-panel p-4 border border-slate-200 shadow-xs space-y-4">
        {/* Row 1: Segmented Status Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center rounded-xl bg-slate-100/90 p-1 border border-slate-200/80 flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-ui text-[13px] font-bold transition-all ${
                statusFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Subjects ({summary.total})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('unassigned')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-ui text-[13px] font-bold transition-all ${
                statusFilter === 'unassigned'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : summary.unassigned > 0
                    ? 'text-amber-800 hover:bg-amber-100/60'
                    : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Unassigned ({summary.unassigned})
              {summary.unassigned > 0 && statusFilter !== 'unassigned' && (
                <span className="w-2 h-2 rounded-full bg-amber-500" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('assigned')}
              className={`px-3 py-1.5 rounded-lg font-ui text-[13px] font-bold transition-all ${
                statusFilter === 'assigned'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Assigned ({summary.assigned})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('ct')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-ui text-[13px] font-bold transition-all ${
                statusFilter === 'ct'
                  ? 'bg-teal-700 text-white shadow-xs'
                  : ctCount > 0
                    ? 'text-teal-800 hover:bg-teal-100/60'
                    : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Converted Tutorial ({ctCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('lab')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-ui text-[13px] font-bold transition-all ${
                statusFilter === 'lab'
                  ? 'bg-purple-700 text-white shadow-xs'
                  : 'text-purple-800 hover:bg-purple-100/60'
              }`}
            >
              Laboratory Only ({labCount})
            </button>
            {pendingApprovalCount > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter('pending_room')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-ui text-[13px] font-bold transition-all ${
                  statusFilter === 'pending_room'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-amber-800 hover:bg-amber-100/60'
                }`}
              >
                Pending Room Approvals ({pendingApprovalCount})
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              </button>
            )}
          </div>

          {/* Quick Clear Filters */}
          {(statusFilter !== 'all' || courseFilter !== 'all' || yearFilter !== 'all' || professorFilter !== 'all' || roomFilter !== 'all' || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setStatusFilter('all');
                setCourseFilter('all');
                setYearFilter('all');
                setProfessorFilter('all');
                setRoomFilter('all');
                setSearchQuery('');
              }}
              className="font-ui text-[13px] font-semibold text-emerald-800 hover:underline cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Row 2: 5 Clean, Balanced Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 pt-1">
          {/* 1. Course / Program Filter */}
          <div>
            <label className="block font-ui text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Course / Program
            </label>
            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className={`w-full h-10 px-3 rounded-lg bg-white border border-slate-300 font-ui text-sm text-slate-800 focus:outline-hidden ${focusRing}`}
            >
              <option value="all">All Programs</option>
              {courseOptions.map((prog) => (
                <option key={prog} value={prog}>
                  {prog}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Year Level Filter */}
          <div>
            <label className="block font-ui text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Year Level
            </label>
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className={`w-full h-10 px-3 rounded-lg bg-white border border-slate-300 font-ui text-sm text-slate-800 focus:outline-hidden ${focusRing}`}
            >
              <option value="all">All Years</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {formatYearLevel(y)}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Professor Filter */}
          <div>
            <label className="block font-ui text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Professor
            </label>
            <select
              value={professorFilter}
              onChange={(e) => setProfessorFilter(e.target.value)}
              className={`w-full h-10 px-3 rounded-lg bg-white border border-slate-300 font-ui text-sm text-slate-800 focus:outline-hidden ${focusRing}`}
            >
              <option value="all">All Professors</option>
              {assignedProfessorOptions.map((prof) => (
                <option key={prof} value={prof}>
                  {prof}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Laboratory Room Filter (Consolidated) */}
          <div>
            <label className="block font-ui text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Laboratory Room
            </label>
            <select
              value={roomFilter}
              onChange={(e) => setRoomFilter(e.target.value)}
              className={`w-full h-10 px-3 rounded-lg bg-white border border-slate-300 font-ui text-sm text-slate-800 focus:outline-hidden ${focusRing}`}
            >
              <option value="all">All Rooms</option>
              <option value="assigned">Room Assigned</option>
              <option value="unassigned">Unassigned Lab Room</option>
              {pendingApprovalCount > 0 && (
                <option value="pending_approval">
                  Pending Approval ({pendingApprovalCount})
                </option>
              )}
              {labRooms.map((r) => (
                <option key={r.id} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          {/* 5. Search Query */}
          <div>
            <label className="block font-ui text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Search Code / Title / Room
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="e.g. CS101, 608..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full h-10 pl-9 pr-3 rounded-lg bg-white border border-slate-300 font-ui text-sm text-slate-800 placeholder:text-slate-400 focus:outline-hidden ${focusRing}`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Subjects & Rooms Table */}
      <div className="bg-white rounded-panel overflow-hidden border border-slate-200 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-600">
                <th className="pl-5 pr-3 py-3.5 whitespace-nowrap">Subject Code</th>
                <th className="px-3.5 py-3.5">Subject Title</th>
                <th className="px-3.5 py-3.5 whitespace-nowrap">Teaching Load / Units</th>
                <th className="px-3.5 py-3.5 whitespace-nowrap">Class Mode (CT)</th>
                <th className="px-3.5 py-3.5 whitespace-nowrap">Course & Year</th>
                <th className="px-3.5 py-3.5 whitespace-nowrap">Assigned Professor</th>
                <th className="px-3.5 py-3.5 whitespace-nowrap">Laboratory Room</th>
                <th className="pl-3 pr-5 py-3.5 text-right whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 font-ui text-[15px] text-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-700 mb-2" />
                    Loading subjects and laboratory rooms...
                  </td>
                </tr>
              ) : filteredSubjects.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center">
                    <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="font-bold text-slate-800">No subjects found</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {searchQuery || statusFilter !== 'all' || courseFilter !== 'all' || yearFilter !== 'all' || professorFilter !== 'all' || subjectTypeFilter !== 'all' || roomFilter !== 'all' || approvalFilter !== 'all'
                        ? 'Try clearing or adjusting your filters.'
                        : 'No major curriculum subjects found for the active term.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredSubjects.map((subject) => {
                  const isAssigned = subject.status === 'assigned';
                  const profName = subject.professor_name || 'Unassigned';

                  return (
                    <tr
                      key={subject.curriculum_id}
                      className={`transition-colors ${
                        !isAssigned
                          ? 'bg-amber-50/40 hover:bg-amber-50/80'
                          : 'hover:bg-slate-50/70'
                      }`}
                    >
                      {/* Subject Code */}
                      <td className="pl-5 pr-3 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[15px] text-slate-900">
                            {subject.code}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider ${
                              subject.is_lab
                                ? 'bg-purple-100 text-purple-900 border border-purple-200'
                                : 'bg-blue-100 text-blue-900 border border-blue-200'
                            }`}
                          >
                            {subject.is_lab ? 'LAB' : 'LEC'}
                          </span>
                        </div>
                      </td>

                      {/* Subject Name & Category */}
                      <td className="px-3.5 py-3.5 min-w-[165px]">
                        <p className="font-medium text-[15px] text-slate-900 leading-snug">
                          {subject.name}
                        </p>
                        {subject.is_major ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200 mt-0.5">
                            Major Subject
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-violet-50 text-violet-800 border border-violet-200 mt-0.5">
                            General Education
                          </span>
                        )}
                      </td>

                      {/* Teaching Load & Units */}
                      <td className="px-3.5 py-3.5 whitespace-nowrap tabular-nums">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {subject.is_ct && subject.regular_hours_label && (
                              <span className="text-xs text-slate-400 line-through">
                                {subject.regular_hours_label}
                              </span>
                            )}
                            <span
                              className={`font-semibold text-sm ${
                                subject.is_ct ? 'text-teal-800 font-bold' : 'text-slate-900'
                              }`}
                            >
                              {subject.required_hours_label || formatMinutesLabel(computeSubjectMinutes(subject))}
                            </span>
                            {subject.is_ct && (
                              <span className="px-1.5 py-0.2 rounded text-[11px] font-extrabold uppercase tracking-wider bg-teal-50 text-teal-800 border border-teal-300">
                                CT
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-500">
                            {subject.units} {subject.units === 1 ? 'unit' : 'units'} ({subject.lec_units || 0}L / {subject.lab_units || 0}Lab)
                          </span>
                        </div>
                      </td>

                      {/* Class Mode / Converted Tutorial (CT) */}
                      <td className="px-3.5 py-3.5 whitespace-nowrap">
                        {isAssigned ? (
                          <select
                            aria-label={`Class mode for ${subject.code}`}
                            value={subject.ct_tier || CT_TIERS.REGULAR}
                            disabled={updatingCtId === (subject.offering_id || subject.assigned_professors?.[0]?.offering_id)}
                            onChange={(e) => handleUpdateCtTier(subject, e.target.value)}
                            className={`h-9 px-2.5 rounded-lg border font-ui text-[13px] transition-colors focus:outline-hidden ${focusRing} ${
                              subject.is_ct
                                ? 'bg-teal-50 border-teal-300 text-teal-900 font-bold'
                                : 'bg-white border-slate-300 text-slate-700 hover:border-slate-400'
                            } disabled:opacity-60`}
                          >
                            {CT_TIER_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span
                            className="inline-flex items-center px-2.5 py-1 rounded-lg text-[13px] text-slate-400 bg-slate-50 border border-slate-200/80"
                            title="Assign a professor first to set Converted Tutorial (CT) status"
                          >
                            Regular (13+)
                          </span>
                        )}
                      </td>

                      {/* Course & Year */}
                      <td className="px-3.5 py-3.5 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-800 text-sm">
                            {subject.program_name || '—'}
                          </span>
                          <span className="text-xs text-slate-500">
                            {formatYearLevel(subject.year_level)}
                          </span>
                        </div>
                      </td>

                      {/* Assigned Professor */}
                      <td className="px-3.5 py-3.5 min-w-[145px]">
                        {isAssigned ? (
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center shrink-0 border border-emerald-300">
                              {profName.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 text-sm truncate">
                                {profName}
                              </p>
                              {subject.assigned_professors?.[0]?.faculty_type && (
                                <span className="inline-block px-1.5 py-0.2 rounded text-[11px] font-medium bg-slate-100 text-slate-600">
                                  {subject.assigned_professors[0].faculty_type_label ||
                                    employmentTypeLabel(subject.assigned_professors[0].faculty_type)}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[13px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                            Unassigned
                          </span>
                        )}
                      </td>

                      {/* Laboratory Room Column */}
                      <td className="px-3.5 py-3.5 whitespace-nowrap min-w-[170px]">
                        {subject.is_lab ? (
                          subject.room_name ? (
                            <div className="flex flex-col gap-1 items-start">
                              <div className="flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-800 border border-slate-300">
                                  <Monitor className="w-3.5 h-3.5 text-emerald-700" />
                                  {subject.room_name}
                                </span>
                                {subject.room_approval_status === 'approved' && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                                    Approved
                                  </span>
                                )}
                                {subject.room_approval_status === 'pending_approval' && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
                                    Pending
                                  </span>
                                )}
                                {subject.room_approval_status === 'rejected' && (
                                  <span
                                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-300"
                                    title={subject.room_rejection_reason || 'Declined'}
                                  >
                                    Declined
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-xs">
                                {canManageLabs && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenRoomModal(subject)}
                                    className="font-medium text-emerald-800 hover:text-emerald-950 hover:underline cursor-pointer"
                                  >
                                    Change
                                  </button>
                                )}
                                {subject.room_approval_status === 'pending_approval' && canManageLabs && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenReviewModal(subject)}
                                    className="font-bold text-amber-800 hover:text-amber-950 hover:underline cursor-pointer"
                                  >
                                    Review Request
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : (
                            canManageLabs ? (
                              <button
                                type="button"
                                onClick={() => handleOpenRoomModal(subject)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 transition-colors shadow-2xs cursor-pointer"
                              >
                                <Monitor className="w-3.5 h-3.5 text-emerald-700" />
                                + Assign Room
                              </button>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs text-amber-800 bg-amber-50 border border-amber-200">
                                Unassigned Room
                              </span>
                            )
                          )
                        ) : (
                          <span className="text-xs text-slate-400 italic">
                            — Lecture (Centrally Assigned)
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="pl-3 pr-5 py-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end">
                          <Button
                            size="row"
                            variant={isAssigned ? 'secondary' : 'primary'}
                            onClick={() => handleOpenAssignModal(subject)}
                          >
                            {isAssigned ? 'Change' : 'Assign'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Professor Assignment Modal */}
      <Modal
        isOpen={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        title={selectedSubject?.status === 'assigned' ? 'Change Assigned Professor' : 'Assign Professor'}
      >
        {selectedSubject && (
          <form noValidate onSubmit={handleSaveAssignment} className="space-y-5">
            {/* Subject Context Box */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl font-bold flex items-center justify-center shrink-0 border ${
                selectedSubject.is_major
                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                  : 'bg-violet-100 text-violet-900 border-violet-300'
              }`}>
                {selectedSubject.code.substring(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-slate-900">
                    {selectedSubject.code}
                  </span>
                  <span className="text-xs text-slate-500">
                    ({selectedSubject.units} units)
                  </span>
                  {selectedSubject.is_major ? (
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                      Major
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold uppercase bg-violet-100 text-violet-800 border border-violet-300">
                      Gen Ed
                    </span>
                  )}
                  {selectedSubject.is_lab && (
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold uppercase bg-purple-100 text-purple-900 border border-purple-300">
                      Lab
                    </span>
                  )}
                </div>
                <p className="font-ui text-sm text-slate-700 font-medium truncate mt-0.5">
                  {selectedSubject.name}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {selectedSubject.program_name || selectedSubject.program_code} · {selectedSubject.type}
                </p>
              </div>
            </div>

            {/* Professor Selection */}
            <ValidationAnchor
              error={assignError}
              label="Select Professor"
              errorId="assign-professor-error"
            >
              {({ badge }) => (
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5 min-h-5">
                    <label
                      htmlFor="assign-professor-select"
                      className="block font-ui text-xs font-bold uppercase tracking-wider text-slate-700"
                    >
                      Select Professor <span className="text-red-600">*</span>
                    </label>
                    {badge}
                  </div>
                  <select
                    id="assign-professor-select"
                    value={selectedProfId}
                    onChange={(e) => {
                      setSelectedProfId(e.target.value);
                      if (assignError) setAssignError('');
                    }}
                    onBlur={() => {
                      if (!selectedProfId) setAssignError('Please select a professor to assign.');
                    }}
                    required
                    aria-invalid={Boolean(assignError)}
                    aria-describedby={assignError ? 'assign-professor-error' : undefined}
                    className={`w-full h-10 px-3 rounded-lg bg-white border font-ui text-sm text-slate-900 focus:outline-hidden ${focusRing} ${
                      assignError ? 'border-sem-conflict ring-1 ring-sem-conflict/20' : 'border-slate-300'
                    }`}
                  >
                    <option value="">-- Choose a Professor --</option>
                    {allProfessors.map((prof) => (
                      <option key={prof.id} value={prof.id}>
                        {prof.name} ({prof.employment_type_label || employmentTypeLabel(prof.type)}, {prof.allowed_hours || prof.max_units} hrs limit)
                      </option>
                    ))}
                  </select>
                  {allProfessors.length === 0 && (
                    <p className="text-xs text-amber-700 mt-1.5">
                      No professors found in this department. Please add professors under Faculty first.
                    </p>
                  )}
                </div>
              )}
            </ValidationAnchor>

            {/* Actions */}
            <div className="pt-4 flex items-center justify-between gap-3 border-t border-slate-200">
              <div>
                {selectedSubject?.status === 'assigned' && (
                  <button
                    type="button"
                    onClick={handleUnassignFromModal}
                    disabled={isSubmitting}
                    className="text-xs font-semibold text-rose-700 hover:text-rose-800 hover:underline disabled:opacity-50 cursor-pointer"
                  >
                    Remove assignment
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => setAssignModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  loading={isSubmitting}
                >
                  Save Assignment
                </Button>
              </div>
            </div>
          </form>
        )}
      </Modal>

      {/* Laboratory Room Assignment Modal */}
      <Modal
        isOpen={roomModalOpen}
        onClose={() => setRoomModalOpen(false)}
        title={selectedRoomSubject?.room_id ? 'Change Laboratory Room' : 'Assign Laboratory Room'}
      >
        {selectedRoomSubject && (
          <form noValidate onSubmit={handleSaveRoomAssignment} className="space-y-5">
            {/* Subject Context Box */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl font-bold flex items-center justify-center shrink-0 border bg-purple-100 text-purple-900 border-purple-300">
                <Monitor className="w-5 h-5 text-purple-800" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-slate-900">
                    {selectedRoomSubject.code}
                  </span>
                  <span className="text-xs text-slate-500">
                    ({selectedRoomSubject.units} units · {selectedRoomSubject.lab_units || 0} Lab)
                  </span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold uppercase bg-purple-100 text-purple-800 border border-purple-300">
                    Computer Lab Subject
                  </span>
                </div>
                <p className="font-ui text-sm text-slate-700 font-medium truncate mt-0.5">
                  {selectedRoomSubject.name}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Program: {selectedRoomSubject.program_name || selectedRoomSubject.program_code}
                </p>
              </div>
            </div>

            {/* Room Selection */}
            <div>
              <label
                htmlFor="select-lab-room"
                className="block font-ui text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
              >
                Computer Laboratory Room <span className="text-red-600">*</span>
              </label>
              <select
                id="select-lab-room"
                value={selectedRoomId}
                onChange={(e) => {
                  setSelectedRoomId(e.target.value);
                  if (roomError) setRoomError('');
                }}
                className={`w-full h-11 px-3 rounded-lg bg-white border font-ui text-sm text-slate-900 focus:outline-hidden ${focusRing} ${
                  roomError ? 'border-rose-400 ring-1 ring-rose-400' : 'border-slate-300'
                }`}
              >
                <option value="">-- Choose a Laboratory Room --</option>
                {labRooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name} — {room.building || 'Main Building'} ({room.capacity || 45} capacity)
                  </option>
                ))}
              </select>
              {roomError && (
                <p className="text-xs text-rose-600 mt-1">{roomError}</p>
              )}
            </div>

            {/* Priority & Approval Notice */}
            <div className={`p-3.5 rounded-xl border text-xs space-y-1 ${
              isRoomSubjectPriority
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                : 'bg-amber-50/70 border-amber-200 text-amber-950'
            }`}>
              <div className="flex items-center gap-2 font-bold">
                {isRoomSubjectPriority ? (
                  <>
                    <ShieldCheck className="w-4 h-4 text-emerald-700" />
                    <span>CS / COE Priority Program</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-700" />
                    <span>Requires CS/COE Chair Approval</span>
                  </>
                )}
              </div>
              <p className="text-slate-600 leading-relaxed">
                {isRoomSubjectPriority
                  ? 'Computer Science and Computer Engineering subjects have priority and room assignments are confirmed immediately.'
                  : 'Room assignments for other CAST programs are flagged as pending until reviewed and approved by the CS/COE Program Chair.'}
              </p>
            </div>

            {/* Actions */}
            <div className="pt-4 flex items-center justify-between gap-3 border-t border-slate-200">
              <div>
                {selectedRoomSubject?.room_id && (
                  <button
                    type="button"
                    onClick={handleUnassignRoom}
                    disabled={roomSubmitting}
                    className="text-xs font-semibold text-rose-700 hover:text-rose-800 hover:underline disabled:opacity-50 cursor-pointer"
                  >
                    Unassign Room
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => setRoomModalOpen(false)}
                  disabled={roomSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  loading={roomSubmitting}
                >
                  Save Room Assignment
                </Button>
              </div>
            </div>
          </form>
        )}
      </Modal>

      {/* Review Pending Room Approval Modal */}
      <Modal
        isOpen={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        title="Review Laboratory Room Request"
      >
        {reviewSubject && (
          <div className="space-y-5">
            <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-950 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-700" />
                <span className="font-bold text-sm">Pending Room Approval</span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                <strong className="text-slate-900">{reviewSubject.program_name || reviewSubject.program_code}</strong> has requested assignment of <strong className="text-slate-900">{reviewSubject.room_name || 'Laboratory Room'}</strong> for <strong className="font-mono text-slate-900">{reviewSubject.code}</strong> ({reviewSubject.name}).
              </p>
            </div>

            <div>
              <label className="block font-ui text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Decline Reason (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Reserved for CS/COE major laboratory schedule"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className={`w-full h-10 px-3 rounded-lg bg-white border border-slate-300 font-ui text-sm text-slate-900 focus:outline-hidden ${focusRing}`}
              />
            </div>

            <div className="pt-4 flex items-center justify-between gap-3 border-t border-slate-200">
              <Button
                variant="destructive"
                onClick={handleRejectRoom}
                loading={reviewSubmitting}
              >
                Decline Request
              </Button>
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  onClick={() => setReviewModalOpen(false)}
                  disabled={reviewSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleApproveRoom}
                  loading={reviewSubmitting}
                >
                  Approve Assignment
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirmation Modal before overriding/assigning a Gen Ed subject */}
      <Modal
        isOpen={confirmOverrideModalOpen}
        onClose={() => {
          if (!isSubmitting) {
            setConfirmOverrideModalOpen(false);
            setPendingOverrideData(null);
          }
        }}
        title={pendingOverrideData?.isOverride ? 'Confirm Assignment Override' : 'Confirm General Education Assignment'}
      >
        {pendingOverrideData && (
          <div className="space-y-4">
            <div className={`p-4 rounded-xl border flex items-start gap-3 ${
              pendingOverrideData.isOverride
                ? 'bg-amber-50 border-amber-200 text-amber-950'
                : 'bg-violet-50 border-violet-200 text-violet-950'
            }`}>
              <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${
                pendingOverrideData.isOverride ? 'text-amber-600' : 'text-violet-600'
              }`} />
              <div className="text-xs space-y-1.5 min-w-0">
                <p className="font-bold text-sm">
                  {pendingOverrideData.isOverride
                    ? 'General Education Assignment Override'
                    : 'Assign General Education Subject'}
                </p>
                <p className="text-slate-700 leading-relaxed">
                  <span className="font-mono font-bold text-slate-900">{pendingOverrideData.subject.code}</span> ({pendingOverrideData.subject.name}) is a <strong className="text-slate-900">General Education subject</strong>.
                </p>
                {pendingOverrideData.isOverride ? (
                  <p className="text-amber-900 font-medium leading-relaxed">
                    This subject is currently assigned to <strong className="text-slate-900">{pendingOverrideData.currentProfName}</strong>. Assigning it will <span className="underline font-bold">override</span> the current assignment and reassign it to <strong className="text-slate-900">{pendingOverrideData.targetProfName}</strong>.
                  </p>
                ) : (
                  <p className="text-slate-700 leading-relaxed">
                    You are assigning this General Education subject to <strong className="text-slate-900">{pendingOverrideData.targetProfName}</strong>.
                  </p>
                )}
              </div>
            </div>

            <p className="font-ui text-xs text-slate-600">
              {pendingOverrideData.isOverride
                ? 'Are you sure you want to proceed with overriding this assignment?'
                : 'Are you sure you want to proceed with this assignment?'}
            </p>

            <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-200">
              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  setConfirmOverrideModalOpen(false);
                  setPendingOverrideData(null);
                }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant={pendingOverrideData.isOverride ? 'destructive' : 'primary'}
                loading={isSubmitting}
                onClick={() => executeAssignment(pendingOverrideData.subject, pendingOverrideData.profId)}
              >
                {pendingOverrideData.isOverride ? 'Confirm & Override' : 'Confirm & Assign'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
