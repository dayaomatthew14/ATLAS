import { useState, useEffect } from 'react';
import { Plus, Users as UsersIcon, Clock, UserCheck, X, Check, Trash2, Search } from 'lucide-react';
import Table from '../../components/Table';
import Modal from '../../components/Modal';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';
import AtlasDialog, { ConfirmDialog as AtlasConfirmDialog } from '../../components/ui/Dialog';
import AtlasButton from '../../components/ui/Button';
import UnavailabilityGrid from '../../components/ui/UnavailabilityGrid';
import { blocksToCells, cellsToBlocks } from '../../utils/availability';
import { restrictionReason } from '../../components/ui/tokens';
import { canManageFaculty as canManageFacultyRole, getRole, ROLES } from '../../utils/session';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const formatTime = (timeStr) => {
  if (!timeStr) return '';
  const [hours, minutes] = timeStr.split(':');
  const h = parseInt(hours);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
};

export default function Teachers() {
  const { addToast } = useToast();
  const [teachers, setTeachers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'full_time',
    max_units: 18,
    unavailability: []
  });
  const [selectedDays, setSelectedDays] = useState([]);
  const [customRanges, setCustomRanges] = useState({}); // { 'Mon': { start: '07:30', end: '17:30', active: false } }

  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [selectedTeacherForSubjects, setSelectedTeacherForSubjects] = useState(null);
  const [curriculumSubjects, setCurriculumSubjects] = useState([]);
  const [teacherSubjects, setTeacherSubjects] = useState([]);
  const [courseCodeFilter, setCourseCodeFilter] = useState('All');
  const [subjectCategoryFilter, setSubjectCategoryFilter] = useState('all'); // 'all', 'major', 'gened'
  const [semesterFilter, setSemesterFilter] = useState('1st');
  const [subjectSearchQuery, setSubjectSearchQuery] = useState('');
  const [activeSemester, setActiveSemester] = useState(null);

  const columns = [
    {
      key: 'name',
      label: 'Teacher Name',
      render: (item) => (
        <div className="flex items-center">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600 mr-4 shadow-sm">
            <UsersIcon className="w-5 h-5" />
          </div>
          <div>
            <span className="font-black text-slate-900 block">{item.name}</span>
          </div>
        </div>
      )
    },
    {
      key: 'load',
      label: 'DLSAU Workload Breakdown',
      render: (item) => {
        const isFullTime = item.type === 'full_time' || item.type === 'Full-Time';
        const current = item.current_units || 0;
        const max = item.max_units || (isFullTime ? 18 : 12);
        const remaining = item.remaining_units !== undefined ? item.remaining_units : Math.max(0, max - current);
        const percentage = Math.min((current / max) * 100, 100);
        const isOverloaded = current > max;
        const isAtCapacity = current === max;

        return (
          <div className="w-56 space-y-1.5">
            <div className="flex justify-between items-center text-xs font-black">
              <span className="text-slate-800">
                {current} / {max} Units
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider ${
                isOverloaded ? 'bg-rose-100 text-rose-700' : isAtCapacity ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
              }`}>
                {isOverloaded ? 'Overloaded' : isAtCapacity ? 'At Capacity' : 'Normal'}
              </span>
            </div>

            <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  isOverloaded ? 'bg-rose-500' : percentage >= 85 ? 'bg-amber-500' : 'bg-emerald-600'
                }`}
                style={{ width: `${percentage}%` }}
              />
            </div>

            <div className="flex justify-between items-center text-[10px] font-bold text-slate-500">
              <span>{isFullTime ? 'Full-Time (18 Max)' : 'Part-Time (Custom)'}</span>
              <span className="text-emerald-700 font-black">{remaining} Units Remaining</span>
            </div>
          </div>
        );
      }
    },
    {
      key: 'type',
      label: 'Type',
      render: (item) => (
        <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${item.type === 'full_time'
            ? 'bg-green-50 text-green-700 border border-green-100'
            : 'bg-blue-50 text-blue-700 border border-blue-100'
          }`}>
          {item.type?.replace('_', ' ') || 'Full Time'}
        </span>
      )
    },
    {
      key: 'subject_offerings',
      label: 'Subject Offerings',
      render: (item) => (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-black text-slate-800">
            {item.subject_offerings?.length || 0} Subjects
          </span>
          <button
            onClick={() => handleOpenSubjectModal(item)}
            className="text-[9px] bg-green-50 text-green-700 px-2 py-1 rounded font-black uppercase tracking-widest hover:bg-green-100 transition-colors w-fit"
          >
            Manage Subjects
          </button>
        </div>
      )
    },
    {
      key: 'availability',
      label: 'Availability Status',
      render: (item) => {
        const blockedDays = (item.unavailability || []).map(u => u.day_of_week.substring(0, 3));

        return (
          <div className="flex flex-col gap-3">
            <div className="flex gap-1.5">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => {
                const isBlocked = blockedDays.includes(day);
                return (
                  <div
                    key={day}
                    title={`${day}: ${isBlocked ? 'Blocked' : 'Available'}`}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black transition-all border ${isBlocked
                        ? 'bg-rose-50 border-rose-200 text-rose-600 shadow-inner'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      }`}
                  >
                    {day === 'Thu' ? 'TH' : day[0]}
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => handleOpenAvailability(item)}
              className="flex items-center justify-center space-x-2 px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 transition-all font-black text-[10px] uppercase tracking-widest active:scale-95"
            >
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>View Schedule</span>
            </button>
          </div>
        );
      }
    },
  ];

  const [isAvailabilityModalOpen, setIsAvailabilityModalOpen] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState(null);

  // The grid edits a local draft; nothing is written until Save, so a partial
  // save is not possible (FLOW-03).
  const [availabilityCells, setAvailabilityCells] = useState(() => new Set());
  const [isSavingAvailability, setIsSavingAvailability] = useState(false);
  const [deleteTeacherTarget, setDeleteTeacherTarget] = useState(null);
  const [isDeletingTeacher, setIsDeletingTeacher] = useState(false);

  const canManageFaculty = canManageFacultyRole();

  const handleOpenAvailability = async (teacher) => {
    setSelectedTeacher(teacher);
    setIsAvailabilityModalOpen(true);
    try {
      const data = await api.get(`/professors/${teacher.id}/unavailability`).catch(() => []);
      setAvailabilityCells(blocksToCells(Array.isArray(data) ? data : []));
    } catch {
      setAvailabilityCells(new Set());
    }
  };

  const handleSaveAvailability = async () => {
    if (!selectedTeacher) return;
    setIsSavingAvailability(true);
    try {
      const blocks = cellsToBlocks(availabilityCells);
      await api.put(`/professors/${selectedTeacher.id}/unavailability`, blocks);
      addToast(
        blocks.length
          ? `Availability saved for ${selectedTeacher.name}.`
          : `${selectedTeacher.name} is now available all week.`,
        'success'
      );
      setIsAvailabilityModalOpen(false);
      fetchTeachers();
    } catch (err) {
      addToast(err.message || 'Could not save availability.', 'error');
    } finally {
      setIsSavingAvailability(false);
    }
  };

  const handleOpenSubjectModal = async (teacher) => {
    setSelectedTeacherForSubjects(teacher);
    setIsSubjectModalOpen(true);
    setCourseCodeFilter('All');
    setSemesterFilter('1st');
    // Coordinators handle General Education; chairs handle major subjects.
    setSubjectCategoryFilter(getRole() === ROLES.COORDINATOR ? 'gened' : 'major');
    try {
      const semData = await api.get('/semesters');
      const active = semData.find(s => s.is_active);
      setActiveSemester(active || null);

      if (active) {
        const offerings = await api.get(`/subject-offerings?semester_id=${active.id}`).catch(() => []);
        const teacherOfferings = offerings.filter(o => o.faculty_id === (teacher.faculty_id || teacher.id));
        setTeacherSubjects(teacherOfferings);
      }

      const curData = await api.get('/curriculum');
      setCurriculumSubjects(Array.isArray(curData) ? curData : []);
    } catch (e) {
      console.error(e);
      addToast('Error fetching data for subjects', 'error');
    }
  };

  const handleToggleSubject = async (subject) => {
    if (!activeSemester) {
      addToast('No active semester found. Please set an active semester first.', 'error');
      return;
    }

    const isAssigned = teacherSubjects.some(ts => ts.curriculum_id === subject.id);

    try {
      if (isAssigned) {
        const offering = teacherSubjects.find(ts => ts.curriculum_id === subject.id);
        if (offering) {
          await api.delete(`/subject-offerings/${offering.id}`);
          setTeacherSubjects(teacherSubjects.filter(ts => ts.id !== offering.id));

          setTeachers(teachers.map(t => {
            if (t.id === selectedTeacherForSubjects.id) {
              const newOfferings = (t.subject_offerings || []).filter(o => o.id !== offering.id);
              const updatedUnits = Math.max(0, (t.current_units || 0) - subject.units);
              return { ...t, subject_offerings: newOfferings, current_units: updatedUnits };
            }
            return t;
          }));
          setSelectedTeacherForSubjects(prev => ({
            ...prev,
            subject_offerings: (prev.subject_offerings || []).filter(o => o.id !== offering.id),
            current_units: Math.max(0, (prev.current_units || 0) - subject.units)
          }));
          addToast('Subject removed', 'success');
        }
      } else {
        const updatedUnits = (selectedTeacherForSubjects.current_units || 0) + subject.units;
        if (updatedUnits > selectedTeacherForSubjects.max_units) {
          addToast(`Cannot add subject: Exceeds maximum units (${selectedTeacherForSubjects.max_units})`, 'error');
          return;
        }

        const res = await api.post('/subject-offerings', {
          faculty_id: selectedTeacherForSubjects.faculty_id || selectedTeacherForSubjects.id,
          curriculum_id: subject.id,
          semester_id: activeSemester.id
        });
        setTeacherSubjects([...teacherSubjects, res]);

        setTeachers(teachers.map(t => {
          if (t.id === selectedTeacherForSubjects.id) {
            const newOfferings = [...(t.subject_offerings || []), res];
            return { ...t, subject_offerings: newOfferings, current_units: updatedUnits };
          }
          return t;
        }));
        setSelectedTeacherForSubjects(prev => ({
          ...prev,
          subject_offerings: [...(prev.subject_offerings || []), res],
          current_units: updatedUnits
        }));
        addToast('Subject added', 'success');
      }
    } catch (error) {
      addToast(error.message || 'Failed to toggle subject', 'error');
    }
  };

  const computeFullName = (fn, ln) => {
    if (!fn && !ln) return '';
    if (!ln || fn === ln) return fn || '';
    if (!fn) return ln || '';
    return `${fn} ${ln}`.trim();
  };

  const fetchTeachers = async () => {
    setIsLoading(true);
    try {
      const data = await api.get('/professors');

      let offerings = [];
      try {
        const sems = await api.get('/semesters');
        const activeSem = sems.find(s => s.is_active);
        if (activeSem) {
          offerings = await api.get(`/subject-offerings?semester_id=${activeSem.id}`).catch(() => []);
        }
      } catch (e) {
        console.error('Could not fetch offerings', e);
      }

      const enrichedData = (Array.isArray(data) ? data : []).map(t => ({
        ...t,
        name: computeFullName(t.first_name, t.last_name),
        subject_offerings: offerings.filter(o => o.faculty_id === (t.faculty_id || t.id))
      }));
      setTeachers(enrichedData);
    } catch (error) {
      console.error('Failed to fetch teachers', error);
      setTeachers([]);
      addToast('Failed to load teachers', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTeachers();
    // Load once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenModal = (teacher = null) => {
    if (teacher) {
      setEditingTeacher(teacher);
      setFormData({
        name: computeFullName(teacher.first_name, teacher.last_name),
        type: teacher.faculty_type || teacher.type || 'full_time',
        max_units: teacher.max_units || 18,
        unavailability: teacher.unavailability || []
      });

      // Initialize selected days and custom ranges from existing unavailability
      const days = [];
      const ranges = {};
      (teacher.unavailability || []).forEach(u => {
        const day = u.day_of_week.substring(0, 3);
        days.push(day);
        const uStart = u.start_time ? u.start_time.substring(0, 5) : '07:30';
        const uEnd = u.end_time ? u.end_time.substring(0, 5) : '17:30';
        const isCustom = uStart !== '07:30' || uEnd !== '17:30';
        ranges[day] = {
          start: uStart,
          end: uEnd,
          active: u.is_custom !== undefined ? u.is_custom : isCustom
        };
      });
      setSelectedDays(days);
      setCustomRanges(ranges);
    } else {
      setEditingTeacher(null);
      setFormData({ name: '', type: 'full_time', max_units: 18, unavailability: [] });
      setSelectedDays([]);
      setCustomRanges({});
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTeacher(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Split name into first and last cleanly
    const nameParts = formData.name.trim().split(/\s+/);
    const first_name = nameParts[0] || '';
    const last_name = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

    // Construct unavailability array for submission
    const finalUnavailability = selectedDays.map(day => {
      const range = customRanges[day] || { start: '07:30', end: '17:30', active: false };
      return {
        day_of_week: day,
        start_time: range.active ? range.start : '07:30',
        end_time: range.active ? range.end : '17:30',
        is_custom: range.active
      };
    });

    // Field names must match schemas.FacultyCreate / FacultyUpdate. `faculty_type`
    // was silently dropped by the API, so the employment type never saved.
    const submissionData = {
      first_name,
      last_name,
      email: editingTeacher?.email || `${formData.name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '.')}@dlsau.edu.ph`,
      max_units: parseInt(formData.max_units) || 18,
      type: formData.type,
    };

    try {
      let newUser;
      if (editingTeacher) {
        // No trailing slash: the API sets redirect_slashes=False, so
        // `/professors/{id}/` 404s instead of matching `/professors/{id}`.
        newUser = await api.put(`/professors/${editingTeacher.id}`, submissionData);
      } else {
        newUser = await api.post('/professors', submissionData);
      }

      // One atomic request replaces the whole availability set (DEP-3). This
      // used to be a DELETE per existing block followed by a POST per new one:
      // N+1 sequential calls where a mid-flight failure left the faculty
      // member with partial availability and only a console error to show it
      // (FLOW-03).
      await api.put(
        `/professors/${newUser.id}/unavailability`,
        finalUnavailability.map((u) => ({
          day_of_week: u.day_of_week,
          start_time: u.start_time,
          end_time: u.end_time,
        }))
      );

      fetchTeachers();
      handleCloseModal();
      addToast(`Teacher ${editingTeacher ? 'updated' : 'added'} successfully`, 'success');
    } catch (error) {
      addToast(error.message || 'Error saving teacher', 'error');
    }
  };

  // HEU-04: a native confirm cannot name who is being removed or say what goes
  // with them. Deleting a faculty member also drops their availability and
  // subject assignments (professors.delete_professor), which the old prompt
  // never mentioned.
  const handleDelete = (id) => {
    const t = teachers.find((x) => x.id === id);
    setDeleteTeacherTarget(t || { id, name: 'this faculty member' });
  };

  const confirmDeleteTeacher = async () => {
    if (!deleteTeacherTarget) return;
    setIsDeletingTeacher(true);
    try {
      await api.delete(`/professors/${deleteTeacherTarget.id}`);
      addToast(`${deleteTeacherTarget.name} removed.`, 'success');
      setDeleteTeacherTarget(null);
      fetchTeachers();
    } catch (error) {
      addToast(error.message || 'Could not remove the faculty member.', 'error');
    } finally {
      setIsDeletingTeacher(false);
    }
  };

  // `handleAddUnavailability` and `handleRemoveUnavailability` lived here. They
  // were the per-block add/delete calls from the old read-only availability
  // list; the week grid replaced them with a single atomic PUT (DEP-3) and
  // neither had a caller afterwards.

  return (
    <div className="p-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-orange-100 p-2.5 rounded-xl shadow-sm">
              <UserCheck className="w-6 h-6 text-orange-700" />
            </div>
            <h2 className="text-4xl font-black text-slate-900 tracking-tighter">Manage Professors</h2>
          </div>
          <p className="text-slate-500 text-base font-medium">Configure faculty profiles, track teaching loads, and manage schedule constraints.</p>
        </div>

        <button
          onClick={() => handleOpenModal()}
          className="bg-green-700 hover:bg-green-800 text-white px-6 py-3.5 rounded-2xl flex items-center shadow-lg shadow-green-900/20 transition-all font-black text-[11px] uppercase tracking-[0.2em] transform hover:scale-105 active:scale-95 whitespace-nowrap"
        >
          <Plus className="w-4 h-4 mr-2" /> Add Professor
        </button>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden p-2">
        <Table
          columns={columns}
          data={teachers}
          isLoading={isLoading}
          onEdit={handleOpenModal}
          onDelete={handleDelete}
        />
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingTeacher ? 'Edit Teacher Profile' : 'Add New Faculty Member'}
        maxWidth="sm:max-w-3xl"
      >
        <form onSubmit={handleSubmit} className="space-y-8 max-h-[80vh] overflow-y-auto px-1 pr-2 custom-scrollbar">
          {/* Profile Section */}
          <div className="grid grid-cols-2 gap-6">
            <div className="col-span-2">
              <label htmlFor="teacher_full_name" className="block text-xs font-black text-slate-400 mb-2 uppercase tracking-[0.2em]">Full Name</label>
              <input
                id="teacher_full_name"
                name="teacher_full_name"
                type="text"
                required
                placeholder="e.g. Juan Dela Cruz"
                className="w-full px-5 py-4 bg-slate-50 border-none focus:ring-2 focus:ring-green-600 rounded-2xl transition-all font-bold text-slate-700 placeholder:text-slate-300 placeholder:font-medium"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-400 mb-2 uppercase tracking-[0.2em]">Faculty Type</label>
              <div className="flex bg-slate-50 p-1.5 rounded-2xl gap-1.5">
                {['full_time', 'part_time'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFormData({ ...formData, type })}
                    className={`flex-1 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${formData.type === type
                        ? 'bg-white text-green-700 shadow-sm'
                        : 'text-slate-400 hover:text-slate-600'
                      }`}
                  >
                    {type.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="teacher_max_units" className="block text-xs font-black text-slate-400 mb-2 uppercase tracking-[0.2em]">Max Units</label>
              <input
                id="teacher_max_units"
                name="teacher_max_units"
                type="number"
                required
                className="w-full px-5 py-4 bg-slate-50 border-none focus:ring-2 focus:ring-green-600 rounded-2xl transition-all font-bold text-slate-700"
                value={formData.max_units}
                onChange={(e) => setFormData({ ...formData, max_units: e.target.value })}
              />
            </div>
          </div>

          {/* Availability Section */}
          <div className="space-y-6 pt-2">
            <label className="block text-xs font-black text-slate-400 mb-4 uppercase tracking-[0.2em]">Time Unavailable</label>

            {/* Day Toggle Buttons */}
            <div className="flex flex-wrap gap-3">
              {DAYS.map(day => {
                const isSelected = selectedDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setSelectedDays(selectedDays.filter(d => d !== day));
                      } else {
                        setSelectedDays([...selectedDays, day]);
                        if (!customRanges[day]) {
                          setCustomRanges({ ...customRanges, [day]: { start: '07:30', end: '17:30', active: false } });
                        }
                      }
                    }}
                    className={`px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest border transition-all ${isSelected
                        ? 'bg-rose-500 border-rose-500 text-white shadow-lg shadow-rose-200 scale-105'
                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            {/* Time Range Panels */}
            {selectedDays.length > 0 && (
              <div className="space-y-4 animate-in slide-in-from-top-4 duration-500">
                <p className="text-xs font-bold text-slate-500 italic">Set time ranges per selected day (optional):</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedDays.map(day => {
                    const range = customRanges[day] || { start: '07:30', end: '17:30', active: false };
                    return (
                      <div
                        key={day}
                        className={`p-5 rounded-[2rem] border transition-all ${range.active ? 'bg-white border-blue-200 shadow-md ring-1 ring-blue-50' : 'bg-slate-50/50 border-slate-100 opacity-80'
                          }`}
                      >
                        <div className="flex items-center justify-between mb-4">
                          <span className={`font-black text-sm uppercase tracking-tighter ${range.active ? 'text-blue-600' : 'text-slate-400'}`}>
                            {day}
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedDays(selectedDays.filter(d => d !== day))}
                            className="text-slate-300 hover:text-rose-500 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <label className="flex items-center gap-3 cursor-pointer group mb-3">
                          <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${range.active ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300 group-hover:border-slate-400'
                            }`}>
                            {range.active && <Check className="w-3.5 h-3.5 text-white stroke-[4]" />}
                          </div>
                          <input
                            type="checkbox"
                            className="hidden"
                            checked={range.active}
                            onChange={(e) => setCustomRanges({
                              ...customRanges,
                              [day]: { ...range, active: e.target.checked }
                            })}
                          />
                          <span className={`text-xs font-bold ${range.active ? 'text-slate-700' : 'text-slate-400'}`}>Use specific time range</span>
                        </label>

                        {!range.active ? (
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-8">
                            Default: {formatTime('07:30')} – {formatTime('17:30')}
                          </p>
                        ) : (
                          <div className="grid grid-cols-2 gap-3 pl-8 animate-in fade-in duration-300">
                            <div>
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.1em] block mb-1">From</span>
                              <div className="relative">
                                <Clock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-blue-500" />
                                <input
                                  type="time"
                                  className="w-full pl-9 pr-3 py-2 bg-blue-50/50 border-none rounded-xl text-xs font-bold text-slate-700 focus:ring-1 focus:ring-blue-500"
                                  value={range.start}
                                  onChange={(e) => setCustomRanges({
                                    ...customRanges,
                                    [day]: { ...range, start: e.target.value }
                                  })}
                                />
                              </div>
                            </div>
                            <div>
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.1em] block mb-1">To</span>
                              <div className="relative">
                                <Clock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-blue-500" />
                                <input
                                  type="time"
                                  className="w-full pl-9 pr-3 py-2 bg-blue-50/50 border-none rounded-xl text-xs font-bold text-slate-700 focus:ring-1 focus:ring-blue-500"
                                  value={range.end}
                                  onChange={(e) => setCustomRanges({
                                    ...customRanges,
                                    [day]: { ...range, end: e.target.value }
                                  })}
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Selected Summary Section */}
            {selectedDays.length > 0 && (
              <div className="pt-6 border-t border-slate-100">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Selected Unavailable Times</h4>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDays([]);
                      setCustomRanges({});
                    }}
                    className="text-[10px] font-black text-rose-500 uppercase tracking-widest hover:underline flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Clear All
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {selectedDays.map(day => {
                    const range = customRanges[day] || { start: '07:30', end: '17:30', active: false };
                    return (
                      <div
                        key={day}
                        className={`flex items-center justify-between px-4 py-2.5 rounded-full border ${range.active
                            ? 'bg-blue-50 border-blue-200 text-blue-700'
                            : 'bg-rose-50 border-rose-100 text-rose-700'
                          }`}
                      >
                        <span className="text-[10px] font-black uppercase tracking-widest">
                          {day}: {range.active ? `${formatTime(range.start)} – ${formatTime(range.end)}` : `${formatTime('07:30')} – ${formatTime('17:30')}`}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedDays(selectedDays.filter(d => d !== day))}
                          className="hover:scale-110 transition-transform"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="pt-10 flex justify-end items-center gap-8">
            <button
              type="button"
              onClick={handleCloseModal}
              className="text-[11px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-[0.25em] transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-green-700 hover:bg-green-800 text-white px-8 py-3.5 rounded-2xl flex items-center shadow-lg shadow-green-900/20 transition-all font-black text-[11px] uppercase tracking-[0.2em] transform hover:scale-105 active:scale-95 whitespace-nowrap"
            >
              {editingTeacher ? 'Update Professor' : 'Add Professor'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Availability. Was a read-only two-column list of blocked windows, with
          editing only possible from the teacher form via a day dropdown and two
          time fields. It is now a direct-manipulation week grid on the same time
          axis as the schedule, saved in one request (DEP-3). */}
      <AtlasConfirmDialog
        isOpen={Boolean(deleteTeacherTarget)}
        onClose={() => setDeleteTeacherTarget(null)}
        onConfirm={confirmDeleteTeacher}
        title={`Remove ${deleteTeacherTarget?.name || ''}?`}
        description="Their availability and subject assignments are removed with them. Classes already scheduled are retained."
        confirmLabel="Remove Faculty Member"
        destructive
        loading={isDeletingTeacher}
      />

      <AtlasDialog
        isOpen={isAvailabilityModalOpen}
        onClose={() => setIsAvailabilityModalOpen(false)}
        title={`Availability — ${selectedTeacher?.name || ''}`}
        description="Marked time is when this faculty member cannot teach. The scheduler will not place classes there."
        dismissible={!isSavingAvailability}
        footer={
          <>
            <AtlasButton variant="ghost" onClick={() => setIsAvailabilityModalOpen(false)} disabled={isSavingAvailability}>
              Cancel
            </AtlasButton>
            {canManageFaculty ? (
              <AtlasButton onClick={handleSaveAvailability} loading={isSavingAvailability}>
                Save Availability
              </AtlasButton>
            ) : (
              <AtlasButton restricted restrictionReason={restrictionReason('program_chair', 'set faculty availability')}>
                Save Availability
              </AtlasButton>
            )}
          </>
        }
      >
        <UnavailabilityGrid
          cells={availabilityCells}
          onChange={setAvailabilityCells}
          disabled={!canManageFaculty || isSavingAvailability}
        />
      </AtlasDialog>
      {/* Subject Offerings Modal */}
      <Modal
        isOpen={isSubjectModalOpen}
        onClose={() => setIsSubjectModalOpen(false)}
        title={`Assign Subjects: ${selectedTeacherForSubjects?.name}`}
        maxWidth="max-w-4xl"
      >
        <div className="space-y-6 max-h-[80vh] overflow-y-auto px-1 pr-2 custom-scrollbar">

          {/* Filters */}
          <div className="flex gap-3 mb-4">
            <div className="flex-[2]">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Search Subjects</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="text"
                  placeholder="Search by code or name..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-green-500"
                  value={subjectSearchQuery}
                  onChange={(e) => setSubjectSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="flex-1">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Subject Scope / Role</label>
              <select
                className="w-full px-3 py-2.5 bg-slate-50 border-none rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-green-500"
                value={subjectCategoryFilter}
                onChange={(e) => setSubjectCategoryFilter(e.target.value)}
              >
                <option value="all">All Subjects</option>
                <option value="major">Major Subjects (Program Chair)</option>
                <option value="gened">General Education (Coordinator)</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Semester</label>
              <select
                className="w-full px-3 py-2.5 bg-slate-50 border-none rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-green-500"
                value={semesterFilter}
                onChange={(e) => setSemesterFilter(e.target.value)}
              >
                <option value="1st">1st Semester</option>
                <option value="2nd">2nd Semester</option>
                <option value="3rd">3rd Semester</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Course Type</label>
              <select
                className="w-full px-3 py-2.5 bg-slate-50 border-none rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-green-500"
                value={courseCodeFilter}
                onChange={(e) => setCourseCodeFilter(e.target.value)}
              >
                <option value="All">All Types</option>
                <option value="A">Lecture Only</option>
                <option value="B">Lab Only</option>
                <option value="C">Combination</option>
              </select>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-5 py-4 font-black text-slate-400 text-[10px] uppercase tracking-widest w-12 text-center">Assign</th>
                  <th className="px-5 py-4 font-black text-slate-400 text-[10px] uppercase tracking-widest">Code</th>
                  <th className="px-5 py-4 font-black text-slate-400 text-[10px] uppercase tracking-widest">Subject Name</th>
                  <th className="px-5 py-4 font-black text-slate-400 text-[10px] uppercase tracking-widest">Category</th>
                  <th className="px-5 py-4 font-black text-slate-400 text-[10px] uppercase tracking-widest">Type</th>
                  <th className="px-5 py-4 font-black text-slate-400 text-[10px] uppercase tracking-widest text-center">Units</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {curriculumSubjects.filter(sub => {
                  const matchSem = sub.semester_term === semesterFilter || sub.semester === semesterFilter;
                  let matchType = true;
                  if (courseCodeFilter === 'A') matchType = sub.type === 'lecture' && sub.lab_units === 0;
                  else if (courseCodeFilter === 'B') matchType = sub.type === 'lab' || (sub.lab_units > 0 && sub.lec_units === 0);
                  else if (courseCodeFilter === 'C') matchType = sub.lec_units > 0 && sub.lab_units > 0;

                  let matchCategory = true;
                  if (subjectCategoryFilter === 'major') matchCategory = sub.is_major;
                  else if (subjectCategoryFilter === 'gened') matchCategory = !sub.is_major;

                  const searchLower = subjectSearchQuery.toLowerCase();
                  const matchSearch = !subjectSearchQuery ||
                    sub.code.toLowerCase().includes(searchLower) ||
                    sub.name.toLowerCase().includes(searchLower);

                  return matchSem && matchType && matchCategory && matchSearch;
                }).sort((a, b) => {
                  const aAssigned = teacherSubjects.some(ts => ts.curriculum_id === a.id);
                  const bAssigned = teacherSubjects.some(ts => ts.curriculum_id === b.id);
                  if (aAssigned && !bAssigned) return -1;
                  if (!aAssigned && bAssigned) return 1;
                  return a.code.localeCompare(b.code);
                }).map(sub => {
                  const isAssigned = teacherSubjects.some(ts => ts.curriculum_id === sub.id);
                  return (
                    <tr key={sub.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={isAssigned}
                          onChange={() => handleToggleSubject(sub)}
                          className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-5 py-4 font-bold text-slate-900">{sub.code}</td>
                      <td className="px-5 py-4 font-medium text-slate-600">{sub.name}</td>
                      <td className="px-5 py-4">
                        <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${sub.is_major ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
                          {sub.is_major ? 'Major' : 'GenEd'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${sub.type === 'lecture' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                          {sub.type}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center font-black text-slate-700">{sub.units}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {curriculumSubjects.filter(sub => {
              const matchSem = sub.semester_term === semesterFilter || sub.semester === semesterFilter;
              let matchType = true;
              if (courseCodeFilter === 'A') matchType = sub.type === 'lecture' && sub.lab_units === 0;
              else if (courseCodeFilter === 'B') matchType = sub.type === 'lab' || (sub.lab_units > 0 && sub.lec_units === 0);
              else if (courseCodeFilter === 'C') matchType = sub.lec_units > 0 && sub.lab_units > 0;

              let matchCategory = true;
              if (subjectCategoryFilter === 'major') matchCategory = sub.is_major;
              else if (subjectCategoryFilter === 'gened') matchCategory = !sub.is_major;

              return matchSem && matchType && matchCategory;
            }).length === 0 && (
                <div className="p-8 text-center text-slate-500 font-bold text-sm">
                  No subjects found for the selected filters.
                </div>
              )}
          </div>

          <div className="pt-4 flex justify-end">
            <button
              onClick={() => {
                setIsSubjectModalOpen(false);
                fetchTeachers();
              }}
              className="px-8 py-3 text-sm font-black text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-lg uppercase tracking-widest transition-all"
            >
              Done
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
