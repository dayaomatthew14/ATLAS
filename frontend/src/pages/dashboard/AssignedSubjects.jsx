import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  UserX,
  Search,
  Filter,
  RefreshCw,
  UserPlus,
  Trash2,
  Calendar,
  GraduationCap,
  Users
} from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';
import Button from '../../components/ui/Button';
import Modal from '../../components/Modal';
import { focusRing } from '../../components/ui/tokens';

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
    summary: { total: 0, assigned: 0, unassigned: 0, all_assigned: true },
    subjects: []
  });

  // Filter states
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'assigned' | 'unassigned'
  const [scopeFilter, setScopeFilter] = useState('all'); // 'all' | 'major' | 'gened'
  const [courseFilter, setCourseFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [professorFilter, setProfessorFilter] = useState('all'); // 'all' | professor_name
  const [searchQuery, setSearchQuery] = useState('');

  // Professor roster for assignment modal
  const [allProfessors, setAllProfessors] = useState([]);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [selectedProfId, setSelectedProfId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Confirmation modal for Gen Ed subject assignment / override
  const [confirmOverrideModalOpen, setConfirmOverrideModalOpen] = useState(false);
  const [pendingOverrideData, setPendingOverrideData] = useState(null);

  // Fetch assigned subjects for active term
  const fetchAssignedSubjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/subject-offerings/assigned-subjects');
      setData(res || {
        active_semester: null,
        department: null,
        summary: { total: 0, assigned: 0, unassigned: 0, all_assigned: true },
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

  useEffect(() => {
    fetchAssignedSubjects();
    fetchProfessors();
  }, [fetchAssignedSubjects, fetchProfessors]);

  // Unique list of programs / courses for dropdown (basis is what we have in curriculum)
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
    const q = searchQuery.trim().toLowerCase();
    return (data.subjects || []).filter(sub => {
      // 0. Scope filter (Major vs Gen Ed)
      if (scopeFilter === 'major' && !sub.is_major) return false;
      if (scopeFilter === 'gened' && sub.is_major) return false;

      // 1. Status filter
      if (statusFilter === 'assigned' && sub.status !== 'assigned') return false;
      if (statusFilter === 'unassigned' && sub.status !== 'unassigned') return false;

      // 2. Course filter (matching curriculum program)
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

      // 5. Search query
      if (q) {
        const matchCode = (sub.code || '').toLowerCase().includes(q);
        const matchName = (sub.name || '').toLowerCase().includes(q);
        const matchProf = sub.assigned_professors?.some(p => p.faculty_name.toLowerCase().includes(q));
        if (!matchCode && !matchName && !matchProf) return false;
      }

      return true;
    });
  }, [data.subjects, scopeFilter, statusFilter, courseFilter, yearFilter, professorFilter, searchQuery]);

  // Open assignment modal for a subject
  const handleOpenAssignModal = (subject) => {
    setSelectedSubject(subject);
    if (subject.assigned_professors?.length > 0) {
      setSelectedProfId(String(subject.assigned_professors[0].faculty_id));
    } else {
      setSelectedProfId('');
    }
    setAssignModalOpen(true);
  };

  // Perform the actual API assignment / reassignment
  const executeAssignment = async (subject, profId) => {
    setIsSubmitting(true);
    try {
      // If already assigned to another professor, remove previous offering
      if (subject.assigned_professors?.length > 0) {
        const currentOffering = subject.assigned_professors[0];
        if (String(currentOffering.faculty_id) !== String(profId)) {
          await api.delete(`/subject-offerings/${currentOffering.offering_id}`).catch(() => {});
        }
      }

      // Create/override offering assignment
      await api.post('/subject-offerings', {
        faculty_id: parseInt(profId),
        curriculum_id: subject.curriculum_id,
        semester_id: data.active_semester.id
      });

      addToast(`Assigned professor to ${subject.code}.`, 'success');
      setAssignModalOpen(false);
      setConfirmOverrideModalOpen(false);
      setPendingOverrideData(null);
      fetchAssignedSubjects();
    } catch (err) {
      console.error(err);
      addToast(err.message || 'Failed to assign professor.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit assignment / re-assignment
  const handleSaveAssignment = async (e) => {
    e.preventDefault();
    if (!selectedSubject) return;
    if (!selectedProfId) {
      addToast('Please select a professor to assign.', 'error');
      return;
    }
    if (!data.active_semester) {
      addToast('No active semester configured.', 'error');
      return;
    }

    const currentOffering = selectedSubject.assigned_professors?.[0];
    const isOverride = Boolean(currentOffering && String(currentOffering.faculty_id) !== String(selectedProfId));
    const targetProf = allProfessors.find(p => String(p.id) === String(selectedProfId));

    // If the subject is not a major subject (Gen Ed):
    // Prompt confirmation before the assignment is overridden (or assigned)
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

    // Major subject: proceed directly
    await executeAssignment(selectedSubject, selectedProfId);
  };

  // Unassign professor
  const handleUnassign = async (subject) => {
    if (!subject?.assigned_professors?.length) return;
    const offeringId = subject.assigned_professors[0].offering_id;
    try {
      await api.delete(`/subject-offerings/${offeringId}`);
      addToast(`Unassigned professor from ${subject.code}.`, 'success');
      fetchAssignedSubjects();
    } catch (err) {
      console.error(err);
      addToast(err.message || 'Failed to unassign professor.', 'error');
    }
  };

  const summary = data?.summary || { total: 0, assigned: 0, unassigned: 0, all_assigned: true };
  const active_semester = data?.active_semester;
  const department = data?.department;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
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
              Major & General Education Subjects · Active Term
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Assigned Subjects
          </h1>
          <p className="font-ui text-sm text-slate-600 mt-1">
            {active_semester
              ? `${active_semester.academic_year} · ${active_semester.term} Semester`
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

      {/* KPI Stat Tiles (Total, Assigned, Unassigned) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              Active term subjects (Major & Gen Ed)
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
            <BookOpen className="w-6 h-6 stroke-[2]" />
          </div>
        </div>

        {/* Assigned Subjects */}
        <div className="glass rounded-panel p-5 border border-emerald-200/80 bg-emerald-50/40 shadow-xs flex items-center justify-between">
          <div>
            <p className="font-ui text-xs font-bold uppercase tracking-wider text-emerald-900">
              Assigned Subjects
            </p>
            <p className="text-3xl font-extrabold text-emerald-950 mt-1 tabular-nums">
              {summary.assigned}
            </p>
            <p className="font-ui text-xs text-emerald-800 mt-1">
              {summary.total > 0
                ? `${Math.round((summary.assigned / summary.total) * 100)}% covered`
                : 'Ready for scheduling'}
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
            <UserCheck className="w-6 h-6 stroke-[2]" />
          </div>
        </div>

        {/* Unassigned Subjects */}
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
                Unassigned Subjects
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


      {/* Filter Toolbar (Status, Course, Professor, Search) */}
      <div className="glass rounded-panel p-4 border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Segmented Status Filter Tabs */}
          <div className="inline-flex items-center rounded-xl bg-slate-100/90 p-1 border border-slate-200/80">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-ui text-xs font-bold transition-all ${
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
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-ui text-xs font-bold transition-all ${
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
              className={`px-3 py-1.5 rounded-lg font-ui text-xs font-bold transition-all ${
                statusFilter === 'assigned'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Assigned ({summary.assigned})
            </button>
          </div>

          {/* Quick Clear Filters if active */}
          {(statusFilter !== 'all' || scopeFilter !== 'all' || courseFilter !== 'all' || yearFilter !== 'all' || professorFilter !== 'all' || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setStatusFilter('all');
                setScopeFilter('all');
                setCourseFilter('all');
                setYearFilter('all');
                setProfessorFilter('all');
                setSearchQuery('');
              }}
              className="font-ui text-xs font-semibold text-emerald-800 hover:underline"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Dropdowns & Search */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-1">
          {/* Category / Scope Filter */}
          <div>
            <label className="block font-ui text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Category
            </label>
            <select
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value)}
              className={`w-full h-9 px-3 rounded-lg bg-white border border-slate-300 font-ui text-xs text-slate-800 focus:outline-hidden ${focusRing}`}
            >
              <option value="all">All Categories</option>
              <option value="major">Major Subjects</option>
              <option value="gened">General Education (Gen Ed)</option>
            </select>
          </div>

          {/* Course / Program Filter */}
          <div>
            <label className="block font-ui text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Course / Program
            </label>
            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className={`w-full h-9 px-3 rounded-lg bg-white border border-slate-300 font-ui text-xs text-slate-800 focus:outline-hidden ${focusRing}`}
            >
              <option value="all">All Courses</option>
              {courseOptions.map((prog) => (
                <option key={prog} value={prog}>
                  {prog}
                </option>
              ))}
            </select>
          </div>

          {/* Year Level Filter */}
          <div>
            <label className="block font-ui text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Year Level
            </label>
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className={`w-full h-9 px-3 rounded-lg bg-white border border-slate-300 font-ui text-xs text-slate-800 focus:outline-hidden ${focusRing}`}
            >
              <option value="all">All Year Levels</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {formatYearLevel(y)}
                </option>
              ))}
            </select>
          </div>

          {/* Professor Filter */}
          <div>
            <label className="block font-ui text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Professor
            </label>
            <select
              value={professorFilter}
              onChange={(e) => setProfessorFilter(e.target.value)}
              className={`w-full h-9 px-3 rounded-lg bg-white border border-slate-300 font-ui text-xs text-slate-800 focus:outline-hidden ${focusRing}`}
            >
              <option value="all">All Professors</option>
              {assignedProfessorOptions.map((prof) => (
                <option key={prof} value={prof}>
                  {prof}
                </option>
              ))}
            </select>
          </div>

          {/* Search Query */}
          <div>
            <label className="block font-ui text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Search Code or Title
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="e.g. CS101, Programming..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full h-9 pl-9 pr-3 rounded-lg bg-white border border-slate-300 font-ui text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden ${focusRing}`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Subjects Table */}
      <div className="bg-white rounded-panel overflow-hidden border border-slate-200 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                <th className="px-5 py-3.5">Subject Code</th>
                <th className="px-5 py-3.5">Subject Title</th>
                <th className="px-5 py-3.5">Units</th>
                <th className="px-5 py-3.5">Course & Year</th>
                <th className="px-5 py-3.5">Assigned Professor</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 font-ui text-sm text-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-700 mb-2" />
                    Loading assigned subjects...
                  </td>
                </tr>
              ) : filteredSubjects.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center">
                    <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="font-bold text-slate-800">No subjects found</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {searchQuery || statusFilter !== 'all' || courseFilter !== 'all' || professorFilter !== 'all'
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
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900">
                            {subject.code}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                              subject.type === 'lab'
                                ? 'bg-purple-100 text-purple-900 border border-purple-200'
                                : 'bg-blue-100 text-blue-900 border border-blue-200'
                            }`}
                          >
                            {subject.type}
                          </span>
                        </div>
                      </td>

                      {/* Subject Name & Category */}
                      <td className="px-5 py-3.5 min-w-[200px]">
                        <p className="font-medium text-slate-900 leading-snug">
                          {subject.name}
                        </p>
                        {subject.is_major ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200 mt-0.5">
                            Major Subject
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-violet-50 text-violet-800 border border-violet-200 mt-0.5">
                            General Education
                          </span>
                        )}
                      </td>

                      {/* Units */}
                      <td className="px-5 py-3.5 whitespace-nowrap tabular-nums">
                        <span className="font-semibold text-slate-900">
                          {subject.units}
                        </span>
                        <span className="text-xs text-slate-500 ml-1">
                          ({subject.lec_units || 0}L / {subject.lab_units || 0}Lab)
                        </span>
                      </td>

                      {/* Course & Year */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-800 text-xs">
                            {subject.program_name || '—'}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {formatYearLevel(subject.year_level)}
                          </span>
                        </div>
                      </td>

                      {/* Assigned Professor */}
                      <td className="px-5 py-3.5 min-w-[180px]">
                        {isAssigned ? (
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center shrink-0 border border-emerald-300">
                              {profName.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 text-xs truncate">
                                {profName}
                              </p>
                              {subject.assigned_professors?.[0]?.faculty_type && (
                                <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                                  {subject.assigned_professors[0].faculty_type.replace('_', ' ')}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                            Unassigned
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {isAssigned ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Assigned
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100/80 text-amber-900 border border-amber-300">
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            Unassigned
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <Button
                            size="row"
                            variant={isAssigned ? 'secondary' : 'primary'}
                            onClick={() => handleOpenAssignModal(subject)}
                          >
                            {isAssigned ? 'Change' : 'Assign'}
                          </Button>
                          {isAssigned && (
                            <button
                              type="button"
                              onClick={() => handleUnassign(subject)}
                              title="Unassign professor"
                              className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span className="sr-only">Unassign</span>
                            </button>
                          )}
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
          <form onSubmit={handleSaveAssignment} className="space-y-5">
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
            <div>
              <label className="block font-ui text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Select Professor
              </label>
              <select
                value={selectedProfId}
                onChange={(e) => setSelectedProfId(e.target.value)}
                required
                className={`w-full h-10 px-3 rounded-lg bg-white border border-slate-300 font-ui text-sm text-slate-900 focus:outline-hidden ${focusRing}`}
              >
                <option value="">-- Choose a Professor --</option>
                {allProfessors.map((prof) => (
                  <option key={prof.id} value={prof.id}>
                    {prof.name} ({prof.type === 'full_time' ? 'Full-Time' : 'Part-Time'}, max {prof.max_units}u)
                  </option>
                ))}
              </select>
              {allProfessors.length === 0 && (
                <p className="text-xs text-amber-700 mt-1.5">
                  No professors found in this department. Please add professors under Faculty first.
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-200">
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
                disabled={!selectedProfId}
              >
                Save Assignment
              </Button>
            </div>
          </form>
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
