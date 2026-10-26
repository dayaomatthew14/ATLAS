import { useState, useEffect, useMemo } from 'react';
import { Plus, Users as UsersIcon, Clock, X, Search, Trash2, ChevronRight, Eye, UserPlus, BookOpen } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';
import AtlasDialog, { ConfirmDialog as AtlasConfirmDialog } from '../../components/ui/Dialog';
import AtlasButton from '../../components/ui/Button';
import DataTable from '../../components/ui/DataTable';
import { LoadMeter, LoadStatusBadge } from '../../components/ui/Badge';
import { formatHours, PART_TIME_CEILING_HOURS } from '../../utils/load';
import { TextInput, NumberInput, RadioGroup, SelectInput } from '../../components/ui/Field';
import { Page, PageHeader, EmptyState } from '../../components/ui/Page';
import UnavailabilityGrid from '../../components/ui/UnavailabilityGrid';
import FacultyPreviewDialog from '../../components/FacultyPreviewDialog';
import { blocksToCells, cellsToBlocks } from '../../utils/availability';
import { restrictionReason, pluralize, focusRing } from '../../components/ui/tokens';
import { canManageFaculty as canManageFacultyRole, getRole, ROLES } from '../../utils/session';

/**
 * Row controls need a border you can actually see.
 *
 * `secondary` is a glass button: a white fill behind a white border. That
 * works on the coloured and glass panels it was designed for, but a DataTable
 * row is white, so on this screen "Manage" and "Edit" rendered as bare words
 * with no edge at all — they did not read as controls.
 *
 * --atlas-line is not the fix: index.css is explicit that it is a 1.27:1
 * hairline and NOT legal on an interactive boundary, because WCAG 1.4.11 wants
 * 3:1 for an edge that identifies a component. --atlas-line-input (3.68:1) is
 * the token that exists for exactly this, which is why form fields use it.
 */
/**
 * Teaching load hours for a subject.
 * Derived from institutional lecture/lab patterns:
 * - Laboratory: 4.00 hrs/wk (2 hrs x 2 sessions)
 * - Engineering Lecture (BSCPE): 4.00 hrs/wk (2 hrs x 2 sessions)
 * - Standard Lecture: 2.67 hrs/wk (1h 20m x 2 sessions)
 */
export const computeSubjectHours = (sub) => {
  if (!sub) return 0;
  const isEng = String(sub.program_code || '').toUpperCase() === 'BSCPE';
  const isLab = sub.type === 'lab' || (sub.lab_units > 0 && sub.lec_units === 0) || String(sub.code || '').toUpperCase().endsWith('B');
  const isLec = sub.type === 'lecture' || (sub.lec_units > 0 && sub.lab_units === 0) || String(sub.code || '').toUpperCase().endsWith('A');

  if (isLab) return 4.00;
  if (isLec) return isEng ? 4.00 : 2.67;

  let hours = 0;
  if (sub.lec_units > 0) hours += isEng ? 4.00 : 2.67;
  if (sub.lab_units > 0) hours += 4.00;
  if (hours > 0) return hours;

  return Number(sub.units) || 0;
};

const ROW_CONTROL = '!bg-white !border-atlas-control hover:!bg-atlas-50';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Field-level validators, so an error can sit under the input it belongs to. */
const validateName = (value) => {
  const v = String(value || '').trim();
  if (!v) return 'Enter the faculty member’s full name.';
  if (!/^[A-Za-z\s.'-]+$/.test(v)) return 'Letters, spaces, periods, apostrophes and hyphens only.';
  if (v.split(/\s+/).length < 2) return 'Include a surname as well as a first name.';
  return undefined;
};

/**
 * Subject units are optional, because they no longer govern anything a chair
 * can be held to. Teaching load is REG. HOURS against the term's required
 * figure; this field is curriculum bookkeeping. Demanding it before a faculty
 * member could be saved asked for a number that changes no outcome.
 */
const validateUnits = (value, unitType = 'units', facultyType = 'full_time') => {
  if (value === '' || value === null || value === undefined) return undefined;
  const n = Number(value);
  const isHrs = unitType === 'hrs';
  const label = isHrs ? 'hours' : 'units';
  const max = isHrs ? (facultyType === 'part_time' ? 20 : 30) : (facultyType === 'part_time' ? 12 : 18);
  if (Number.isNaN(n)) return `Enter a number of ${label}, or leave it blank.`;
  if (!Number.isInteger(n)) return `${isHrs ? 'Hours' : 'Units'} must be a whole number.`;
  if (n < 1 || n > max) return `Enter a value between 1 and ${max}, or leave it blank.`;
  return undefined;
};

/**
 * Which subjects a role carries.
 *
 * A program chair holds their programme's major subjects; a coordinator holds
 * General Education. This used to be a dropdown offering All / Major / GenEd,
 * pre-selected by role but freely changeable — so a coordinator could list and
 * assign major subjects, which the split exists to prevent. It is a fact about
 * the signed-in role, not a preference, so it is stated rather than offered.
 */
const SUBJECT_SCOPE = {
  [ROLES.PROGRAM_CHAIR]: { isMajor: undefined, label: 'Department subjects', assigns: 'subjects' },
  [ROLES.DEAN]: { isMajor: undefined, label: 'Department subjects', assigns: 'subjects' },
};

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
    load_unit: 'units',
    unavailability: []
  });
  const [selectedDays, setSelectedDays] = useState([]);
  const [customRanges, setCustomRanges] = useState({}); // { 'Mon': [{ id: '...', start: '07:30', end: '17:30', active: false }] }

  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [selectedTeacherForSubjects, setSelectedTeacherForSubjects] = useState(null);
  const [curriculumSubjects, setCurriculumSubjects] = useState([]);
  const [teacherSubjects, setTeacherSubjects] = useState([]);
  const [courseCodeFilter, setCourseCodeFilter] = useState('All');
  const [semesterFilter, setSemesterFilter] = useState('1st');
  const [subjectSearchQuery, setSubjectSearchQuery] = useState('');
  const [activeSemester, setActiveSemester] = useState(null);
  const [hasPublishedCurriculum, setHasPublishedCurriculum] = useState(true);
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(false);

  /**
   * The week, as six day marks.
   *
   * Blocked days carried colour alone before — a rose tile against an emerald
   * one — which is unreadable in greyscale and under deuteranopia. Each mark now
   * also differs in fill and glyph, and the whole strip has one accessible name
   * rather than six tooltips a keyboard user cannot reach.
   */
  const AvailabilityMarks = ({ unavailability }) => {
    const blocked = new Set((unavailability || []).map((u) => u.day_of_week.substring(0, 3)));
    const blockedList = DAYS.filter((d) => blocked.has(d));
    return (
      <span
        className="inline-flex items-center gap-1"
        role="img"
        aria-label={
          blockedList.length === 0
            ? 'Available every day'
            : `Unavailable ${blockedList.join(', ')}`
        }
      >
        {DAYS.map((day) => {
          const isBlocked = blocked.has(day);
          return (
            <span
              key={day}
              aria-hidden="true"
              className={`w-7 h-7 rounded-lg inline-flex items-center justify-center font-data text-xs font-bold shadow-2xs transition-all
                          ${isBlocked
                            ? 'bg-rose-50 text-rose-600 border border-rose-200/80 line-through decoration-rose-400 opacity-75'
                            : 'bg-emerald-50 text-emerald-900 border border-emerald-200/80'}`}
            >
              {day[0]}
            </span>
          );
        })}
      </span>
    );
  };

  /** "Ann Cruz" -> "AC". Two letters is the most that stays legible at 36px. */
  const initialsOf = (name) =>
    String(name || '')
      .replace(/^(Mr|Mrs|Ms|Dr|Prof)\.?\s+/i, '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('') || '?';

  const columns = [
    {
      key: 'name',
      label: 'Faculty',
      width: '280px',
      render: (item) => {
        const isPartTime = item.type === 'part_time' || item.type === 'Part-Time';
        return (
          <button
            type="button"
            onClick={() => setPreviewTeacher(item)}
            className="group flex items-center gap-3 text-left w-full px-2.5 py-1.5 -mx-1 rounded-xl transition-all duration-150 hover:bg-emerald-50/70 border border-transparent hover:border-emerald-200/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/50"
          >
            <span
              aria-hidden="true"
              className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-800 text-white shrink-0 flex items-center justify-center
                         font-ui text-caption font-bold shadow-xs ring-2 ring-emerald-100/90
                         group-hover:scale-105 group-hover:shadow-sm transition-transform duration-150"
            >
              {initialsOf(item.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="font-ui text-sm font-bold text-slate-900 truncate group-hover:text-emerald-800 transition-colors">
                  {item.name}
                </span>
                <ChevronRight
                  className="w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-emerald-700"
                  aria-hidden="true"
                />
              </span>
              <span className="inline-flex items-center mt-0.5">
                {isPartTime ? (
                  <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10.5px] font-semibold bg-amber-50 text-amber-800 border border-amber-200/70 shadow-2xs">
                    Part-time
                  </span>
                ) : (
                  <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10.5px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/70 shadow-2xs">
                    Full-time
                  </span>
                )}
              </span>
            </span>
            <span className="sr-only">— open preview</span>
          </button>
        );
      },
    },
    {
      key: 'load',
      label: 'Teaching load',
      width: '230px',
      render: (item) => (
        <span className="flex flex-col gap-1.5 py-1 whitespace-nowrap">
          <LoadMeter
            used={item.reg_hours || 0}
            required={item.required_hours}
            status={item.load_status}
            ceiling={item.part_time_ceiling_hours}
            overCeiling={item.exceeds_part_time_ceiling}
          />
          <LoadStatusBadge
            status={item.load_status}
            overCeiling={item.exceeds_part_time_ceiling}
          />
        </span>
      ),
    },
    {
      key: 'subject_offerings',
      label: 'Subjects',
      width: '170px',
      render: (item) => {
        const n = item.subject_offerings?.length || 0;
        return (
          <span className="flex items-center gap-2.5">
            <span
              className={`inline-flex items-center justify-center min-w-[30px] h-6.5 px-2.5 rounded-full font-ui text-sm font-bold
                          tabular-nums shadow-2xs border ${
                            n === 0
                              ? 'bg-amber-50 text-amber-900 border-amber-200'
                              : 'bg-emerald-50 text-emerald-950 border-emerald-300'
                          }`}
              title={n === 0 ? 'Nothing assigned — this professor cannot be scheduled' : `${n} subjects assigned`}
            >
              {n}
            </span>
            <AtlasButton size="row" variant="secondary" className={ROW_CONTROL} onClick={() => handleOpenSubjectModal(item)}>
              Manage
            </AtlasButton>
          </span>
        );
      },
    },
    {
      key: 'availability',
      label: 'Availability',
      width: '180px',
      render: (item) => (
        <span className="flex items-center">
          <AvailabilityMarks unavailability={item.unavailability} />
        </span>
      ),
    },
  ];

  /* The preview needs two things the table never had to load: what each
     offering actually *is* (offerings carry only ids), and when the professor
     was plotted. Both are fetched once with the roster rather than on open, so
     the panel appears filled in instead of spinning. */
  const [curriculumById, setCurriculumById] = useState(() => new Map());
  const [schedulesByFaculty, setSchedulesByFaculty] = useState(() => new Map());
  // Distinct from "no classes". A failed read must not be reported as an empty week.
  const [scheduleUnavailable, setScheduleUnavailable] = useState(false);
  const [previewTeacher, setPreviewTeacher] = useState(null);

  const [isAvailabilityModalOpen, setIsAvailabilityModalOpen] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState(null);

  // The grid edits a local draft; nothing is written until Save, so a partial
  // save is not possible (FLOW-03).
  const [availabilityCells, setAvailabilityCells] = useState(() => new Set());
  const [isSavingAvailability, setIsSavingAvailability] = useState(false);
  const [deleteTeacherTarget, setDeleteTeacherTarget] = useState(null);
  const [isDeletingTeacher, setIsDeletingTeacher] = useState(false);
  // What removing this faculty member would take with them. Null while the
  // count is in flight, so the confirmation cannot be answered blind.
  const [deleteImpact, setDeleteImpact] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [isSavingTeacher, setIsSavingTeacher] = useState(false);
  const [allSemesterOfferings, setAllSemesterOfferings] = useState([]);
  const [confirmGenEdModalOpen, setConfirmGenEdModalOpen] = useState(false);
  const [pendingGenEdSubject, setPendingGenEdSubject] = useState(null);

  const canManageFaculty = canManageFacultyRole();
  // Null only if a role outside the scheduling pair ever reaches this screen;
  // the table then shows every subject rather than silently showing none.
  const subjectScope = SUBJECT_SCOPE[getRole()] || null;

  /**
   * The subjects the assignment table shows.
   *
   * Computed once instead of the two near-identical inline predicates this
   * modal used to carry — the second one omitted the search term, so typing a
   * query that matched nothing rendered an empty table with no "no results"
   * message at all.
   */
  const visibleSubjects = useMemo(() => {
    const q = subjectSearchQuery.trim().toLowerCase();
    const isAssigned = (s) => teacherSubjects.some((ts) => ts.curriculum_id === s.id);

    return curriculumSubjects
      .filter((sub) => {
        const matchSem = sub.semester_term === semesterFilter || sub.semester === semesterFilter;

        let matchType = true;
        if (courseCodeFilter === 'A') matchType = sub.type === 'lecture' && sub.lab_units === 0;
        else if (courseCodeFilter === 'B') matchType = sub.type === 'lab' || (sub.lab_units > 0 && sub.lec_units === 0);
        else if (courseCodeFilter === 'C') matchType = sub.lec_units > 0 && sub.lab_units > 0;

        // Not a filter — the role's scope. A chair never sees General
        // Education here and a coordinator never sees majors.
        const matchScope = !subjectScope || subjectScope.isMajor === undefined || Boolean(sub.is_major) === subjectScope.isMajor;

        const matchSearch = !q
          || String(sub.code || '').toLowerCase().includes(q)
          || String(sub.name || '').toLowerCase().includes(q);

        return matchSem && matchType && matchScope && matchSearch;
      })
      .sort((a, b) => {
        const aAssigned = isAssigned(a);
        const bAssigned = isAssigned(b);
        if (aAssigned && !bAssigned) return -1;
        if (!aAssigned && bAssigned) return 1;
        return String(a.code || '').localeCompare(String(b.code || ''));
      });
  }, [curriculumSubjects, teacherSubjects, semesterFilter, courseCodeFilter, subjectSearchQuery, subjectScope]);

  const assignedSubjectsList = useMemo(() => {
    if (!teacherSubjects || !curriculumSubjects) return [];
    const assignedIds = new Set(teacherSubjects.map(ts => ts.curriculum_id));
    return curriculumSubjects.filter(sub => assignedIds.has(sub.id));
  }, [teacherSubjects, curriculumSubjects]);

  const totalAssignedUnits = useMemo(() => {
    return assignedSubjectsList.reduce((sum, s) => sum + (Number(s.units) || 0), 0);
  }, [assignedSubjectsList]);

  const totalAssignedHours = useMemo(() => {
    return assignedSubjectsList.reduce((sum, s) => sum + computeSubjectHours(s), 0);
  }, [assignedSubjectsList]);

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
    setSubjectSearchQuery('');
    setHasPublishedCurriculum(true);
    setIsLoadingSubjects(true);
    try {
      const semData = await api.get('/semesters');
      const active = semData.find(s => s.is_active);
      setActiveSemester(active || null);

      if (active) {
        const offerings = await api.get(`/subject-offerings?semester_id=${active.id}`).catch(() => []);
        setAllSemesterOfferings(Array.isArray(offerings) ? offerings : []);
        const teacherOfferings = offerings.filter(o => o.faculty_id === (teacher.faculty_id || teacher.id));
        setTeacherSubjects(teacherOfferings);
      }

      // Only subjects from a PUBLISHED curriculum can be assigned. The blocks
      // endpoint already returns published blocks of this college and nothing
      // else, so intersecting on block_id is what keeps a draft curriculum --
      // one the administrator is still revising -- out of a teaching load.
      // GET /curriculum is unfiltered by status and is shared with other
      // screens, so the narrowing is done here rather than there.
      const [curData, blockData] = await Promise.all([
        api.get('/curriculum'),
        api.get('/curriculum/blocks').catch(() => []),
      ]);
      const publishedBlockIds = new Set(
        (Array.isArray(blockData) ? blockData : [])
          .filter((b) => String(b.status || 'PUBLISHED').toUpperCase() === 'PUBLISHED')
          .map((b) => b.id)
      );
      setHasPublishedCurriculum(publishedBlockIds.size > 0);
      setCurriculumSubjects(
        (Array.isArray(curData) ? curData : []).filter((s) => publishedBlockIds.has(s.block_id))
      );
    } catch (e) {
      console.error(e);
      setCurriculumSubjects([]);
      addToast('Error fetching data for subjects', 'error');
    } finally {
      setIsLoadingSubjects(false);
    }
  };

  const confirmAssignSubject = async (subject) => {
    try {
      const updatedUnits = (selectedTeacherForSubjects.current_units || 0) + (subject.units || 0);

      const res = await api.post('/subject-offerings', {
        faculty_id: selectedTeacherForSubjects.faculty_id || selectedTeacherForSubjects.id,
        curriculum_id: subject.id,
        semester_id: activeSemester.id
      });
      setTeacherSubjects(prev => [...prev.filter(ts => ts.curriculum_id !== subject.id), res]);
      setAllSemesterOfferings(prev => [...prev.filter(ts => ts.curriculum_id !== subject.id), res]);

      setTeachers(prev => prev.map(t => {
        if (t.id === selectedTeacherForSubjects.id) {
          const newOfferings = [...(t.subject_offerings || []).filter(o => o.curriculum_id !== subject.id), res];
          return { ...t, subject_offerings: newOfferings, current_units: updatedUnits };
        }
        return t;
      }));
      setSelectedTeacherForSubjects(prev => ({
        ...prev,
        subject_offerings: [...(prev.subject_offerings || []).filter(o => o.curriculum_id !== subject.id), res],
        current_units: updatedUnits
      }));
      addToast('Subject added', 'success');
    } catch (error) {
      addToast(error.message || 'Failed to toggle subject', 'error');
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
          setTeacherSubjects(prev => prev.filter(ts => ts.id !== offering.id && ts.curriculum_id !== subject.id));
          setAllSemesterOfferings(prev => prev.filter(ts => ts.id !== offering.id));

          setTeachers(prev => prev.map(t => {
            if (t.id === selectedTeacherForSubjects.id) {
              const newOfferings = (t.subject_offerings || []).filter(o => o.id !== offering.id && o.curriculum_id !== subject.id);
              const updatedUnits = Math.max(0, (t.current_units || 0) - (subject.units || 0));
              return { ...t, subject_offerings: newOfferings, current_units: updatedUnits };
            }
            return t;
          }));
          setSelectedTeacherForSubjects(prev => ({
            ...prev,
            subject_offerings: (prev.subject_offerings || []).filter(o => o.id !== offering.id && o.curriculum_id !== subject.id),
            current_units: Math.max(0, (prev.current_units || 0) - (subject.units || 0))
          }));
          addToast('Subject removed', 'success');
        }
      } else {
        // If subject is NOT a major subject (Gen Ed):
        const GEN_ED_PREFIXES = ['GE', 'CORE', 'PEED', 'NSTP', 'LSVI', 'RZAL', 'RIZAL', 'GEC'];
        const isGenEd = !subject.is_major || GEN_ED_PREFIXES.some(prefix => (subject.code || '').toUpperCase().startsWith(prefix));

        if (isGenEd) {
          const currentFacultyId = selectedTeacherForSubjects.faculty_id || selectedTeacherForSubjects.id;
          const otherOffering = allSemesterOfferings.find(o => o.curriculum_id === subject.id && o.faculty_id !== currentFacultyId);

          setPendingGenEdSubject({
            subject,
            existingOtherOffering: otherOffering || null
          });
          setConfirmGenEdModalOpen(true);
          return;
        }

        await confirmAssignSubject(subject);
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

  /**
   * The subject catalogue and the plotted timetable, for the preview panel.
   *
   * Kept off `fetchTeachers`'s critical path in one respect: whatever fails
   * here, the roster still renders. A curriculum that will not load costs the
   * preview its subject names; a timetable that will not load is reported as
   * unknown rather than as an empty week.
   */
  const loadPreviewData = async (semesterId) => {
    try {
      const curriculum = await api.get('/curriculum').catch(() => []);
      setCurriculumById(
        new Map((Array.isArray(curriculum) ? curriculum : []).map((c) => [c.id, c]))
      );
    } catch (e) {
      console.error('Could not fetch curriculum for preview', e);
      setCurriculumById(new Map());
    }

    if (!semesterId) {
      // No active term is not a failed read — there is genuinely nothing plotted.
      setSchedulesByFaculty(new Map());
      setScheduleUnavailable(false);
      return;
    }

    try {
      const plotted = await api.get(`/ai-scheduler/global-schedule?semester_id=${semesterId}`);
      const grouped = new Map();
      (Array.isArray(plotted) ? plotted : []).forEach((s) => {
        if (s.faculty_id == null) return;
        if (!grouped.has(s.faculty_id)) grouped.set(s.faculty_id, []);
        grouped.get(s.faculty_id).push(s);
      });
      setSchedulesByFaculty(grouped);
      setScheduleUnavailable(false);
    } catch (e) {
      console.error('Could not fetch plotted schedule for preview', e);
      setSchedulesByFaculty(new Map());
      setScheduleUnavailable(true);
    }
  };

  const fetchTeachers = async () => {
    setIsLoading(true);
    try {
      const data = await api.get('/professors');

      let offerings = [];
      let activeSemesterId = null;
      try {
        const sems = await api.get('/semesters');
        const activeSem = sems.find(s => s.is_active);
        if (activeSem) {
          activeSemesterId = activeSem.id;
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

      await loadPreviewData(activeSemesterId);
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

  const getRangesForDay = (day) => {
    const val = customRanges[day];
    if (Array.isArray(val) && val.length > 0) return val;
    if (val && typeof val === 'object' && val.start) return [{ id: 'default', ...val }];
    return [{ id: 'default', start: '07:30', end: '17:30', active: false }];
  };

  const handleAddRange = (day) => {
    const existing = getRangesForDay(day);
    let newStart = '13:00';
    let newEnd = '17:30';

    if (existing.length > 0) {
      const lastRange = existing[existing.length - 1];
      if (lastRange.end && lastRange.end <= '12:00') {
        newStart = '13:00';
        newEnd = '17:30';
      } else if (lastRange.end && lastRange.end < '16:00') {
        const [h, m] = lastRange.end.split(':').map(Number);
        const nextHour = Math.min((h || 0) + 1, 16);
        newStart = `${String(nextHour).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
        newEnd = '17:30';
      }
    }

    // When adding a second/additional slot, existing full-day slots switch to active
    const updatedExisting = existing.map((r) => {
      if (!r.active) {
        return { ...r, start: '07:30', end: '12:00', active: true };
      }
      return r;
    });

    const newSlot = {
      id: Math.random().toString(36).substring(2, 9),
      start: newStart,
      end: newEnd,
      active: true,
    };

    setCustomRanges((prev) => ({
      ...prev,
      [day]: [...updatedExisting, newSlot],
    }));
  };

  const handleRemoveRange = (day, rangeId) => {
    const existing = getRangesForDay(day);
    if (existing.length <= 1) {
      setSelectedDays((prev) => prev.filter((d) => d !== day));
      setCustomRanges((prev) => {
        const next = { ...prev };
        delete next[day];
        return next;
      });
    } else {
      setCustomRanges((prev) => ({
        ...prev,
        [day]: existing.filter((r) => r.id !== rangeId),
      }));
    }
  };

  const handleUpdateRange = (day, rangeId, updates) => {
    const existing = getRangesForDay(day);
    setCustomRanges((prev) => ({
      ...prev,
      [day]: existing.map((r) => (r.id === rangeId ? { ...r, ...updates } : r)),
    }));
  };

  const handleOpenModal = (teacher = null) => {
    if (teacher) {
      setEditingTeacher(teacher);
      const loadUnit = teacher.load_unit || 'units';
      setFormData({
        name: computeFullName(teacher.first_name, teacher.last_name),
        type: teacher.faculty_type || teacher.type || 'full_time',
        max_units: teacher.max_units || (loadUnit === 'hrs' ? 24 : 18),
        load_unit: loadUnit,
        unavailability: teacher.unavailability || []
      });

      // Initialize selected days and custom ranges from existing unavailability
      const days = [];
      const ranges = {};
      (teacher.unavailability || []).forEach(u => {
        const day = u.day_of_week.substring(0, 3);
        if (!days.includes(day)) {
          days.push(day);
        }
        if (!ranges[day]) {
          ranges[day] = [];
        }
        const uStart = u.start_time ? u.start_time.substring(0, 5) : '07:30';
        const uEnd = u.end_time ? u.end_time.substring(0, 5) : '17:30';
        const isCustom = uStart !== '07:30' || uEnd !== '17:30';
        ranges[day].push({
          id: u.id ? String(u.id) : Math.random().toString(36).substring(2, 9),
          start: uStart,
          end: uEnd,
          active: u.is_custom !== undefined ? u.is_custom : isCustom
        });
      });

      days.forEach(day => {
        if (!ranges[day] || ranges[day].length === 0) {
          ranges[day] = [{
            id: Math.random().toString(36).substring(2, 9),
            start: '07:30',
            end: '17:30',
            active: false
          }];
        } else if (ranges[day].length > 1) {
          ranges[day] = ranges[day].map(r => ({ ...r, active: true }));
        }
      });

      setSelectedDays(days);
      setCustomRanges(ranges);
    } else {
      setEditingTeacher(null);
      setFormData({ name: '', type: 'full_time', max_units: 18, load_unit: 'units', unavailability: [] });
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

    // Validate against the fields themselves. These used to be absent
    // entirely — a blank name posted and came back a 422 the user had to
    // interpret from a toast (ux-guidelines: Error Placement, Inline Validation).
    const errors = {
      name: validateName(formData.name),
      max_units: validateUnits(formData.max_units, formData.load_unit, formData.type),
    };
    setFormErrors(errors);
    if (errors.name || errors.max_units) return;

    // Construct unavailability array for submission
    const finalUnavailability = [];
    selectedDays.forEach((day) => {
      const dayRanges = getRangesForDay(day);
      dayRanges.forEach((range) => {
        finalUnavailability.push({
          day_of_week: day,
          start_time: (range.active && range.start) ? range.start : '07:30',
          end_time: (range.active && range.end) ? range.end : '17:30',
          is_custom: !!range.active,
        });
      });
    });

    // Validate times (end must be after start)
    for (const u of finalUnavailability) {
      if (u.end_time <= u.start_time) {
        addToast(
          `Unavailable time on ${u.day_of_week} must end after it starts (${formatTime(u.start_time)} to ${formatTime(u.end_time)}).`,
          'error'
        );
        return;
      }
    }

    // Validate against overlapping slots on the same day
    for (const day of selectedDays) {
      const daySlots = finalUnavailability.filter((u) => u.day_of_week === day);
      for (let i = 0; i < daySlots.length; i++) {
        for (let j = i + 1; j < daySlots.length; j++) {
          const a = daySlots[i];
          const b = daySlots[j];
          if (a.start_time < b.end_time && a.end_time > b.start_time) {
            addToast(
              `Unavailable times on ${day} overlap (${formatTime(a.start_time)}–${formatTime(a.end_time)} and ${formatTime(b.start_time)}–${formatTime(b.end_time)}).`,
              'error'
            );
            return;
          }
        }
      }
    }

    setIsSavingTeacher(true);

    // Split name into first and last cleanly
    const nameParts = formData.name.trim().split(/\s+/);
    const first_name = nameParts[0] || '';
    const last_name = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

    // Field names must match schemas.FacultyCreate / FacultyUpdate. `faculty_type`
    // was silently dropped by the API, so the employment type never saved.
    const defaultVal = formData.load_unit === 'hrs' ? 24 : 18;
    const submissionData = {
      first_name,
      last_name,
      email: editingTeacher?.email || `${formData.name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '.')}@dlsau.edu.ph`,
      max_units: parseInt(formData.max_units) || defaultVal,
      load_unit: formData.load_unit || 'units',
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
      addToast(`${formData.name.trim()} ${editingTeacher ? 'updated' : 'added'}.`, 'success');
    } catch (error) {
      addToast(error.message || 'Error saving teacher', 'error');
    } finally {
      setIsSavingTeacher(false);
    }
  };

  // HEU-04: a native confirm cannot name who is being removed or say what goes
  // with them. Deleting a faculty member also drops their availability and
  // subject assignments (professors.delete_professor), which the old prompt
  // never mentioned.
  const handleDelete = async (id) => {
    const t = teachers.find((x) => x.id === id);
    setDeleteTeacherTarget(t || { id, name: 'this faculty member' });
    // Read at the moment the confirmation opens rather than from the row: a
    // timetable can be generated between a page load and a removal, and the
    // figure that matters is the one true when the chair decides.
    setDeleteImpact(null);
    try {
      setDeleteImpact(await api.get(`/professors/${id}/impact`));
    } catch {
      // Left null. The dialog then declines to promise what will survive
      // rather than stating a figure it does not have.
      setDeleteImpact({ unknown: true });
    }
  };

  const confirmDeleteTeacher = async () => {
    if (!deleteTeacherTarget) return;
    setIsDeletingTeacher(true);
    try {
      await api.delete(`/professors/${deleteTeacherTarget.id}`);
      const n = deleteImpact?.schedule_count || 0;
      addToast(
        n
          ? `${deleteTeacherTarget.name} removed, along with ${pluralize(n, 'plotted class', 'plotted classes')}.`
          : `${deleteTeacherTarget.name} removed.`,
        'success'
      );
      setDeleteTeacherTarget(null);
      setDeleteImpact(null);
      fetchTeachers();
    } catch (error) {
      addToast(error.message || 'Could not remove the faculty member.', 'error');
    } finally {
      setIsDeletingTeacher(false);
    }
  };

  /**
   * What the confirmation says. Removing a faculty member takes their plotted
   * classes with them -- the dialog used to claim "Classes already scheduled
   * are retained", which was true only in the sense that the rows stayed behind
   * with no teacher on them, holding their slots and reachable from no screen.
   */
  const deleteDescription = () => {
    if (!deleteImpact) return 'Checking what this would remove…';
    if (deleteImpact.unknown) {
      return 'Could not check what this would remove. Their availability, subject '
        + 'assignments and any plotted classes go with them.';
    }
    const parts = [];
    if (deleteImpact.schedule_count) {
      parts.push(pluralize(deleteImpact.schedule_count, 'plotted class', 'plotted classes'));
    }
    if (deleteImpact.offering_count) {
      parts.push(pluralize(deleteImpact.offering_count, 'subject assignment'));
    }
    if (deleteImpact.unavailability_count) {
      parts.push(pluralize(deleteImpact.unavailability_count, 'availability block'));
    }
    if (!parts.length) {
      return 'Nothing is assigned or plotted for them, so only the faculty record goes.';
    }
    const listed = parts.length > 1
      ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
      : parts[0];
    const hours = deleteImpact.reg_hours
      ? ` That is ${formatHours(deleteImpact.reg_hours)} hrs/week off the timetable.`
      : '';
    return `This removes ${listed} with them. It cannot be undone.${hours}`;
  };

  // `handleAddUnavailability` and `handleRemoveUnavailability` lived here. They
  // were the per-block add/delete calls from the old read-only availability
  // list; the week grid replaced them with a single atomic PUT (DEP-3) and
  // neither had a caller afterwards.

  // Load standing is judged in hours against the term's required teaching load,
  // not against a per-faculty unit cap. Underload is worth surfacing alongside
  // overload -- a chair has to fill it before the term starts, and the old
  // single "over cap" count could not say so.
  const overloaded = teachers.filter(
    (t) => t.load_status === 'OVERLOAD' || t.exceeds_part_time_ceiling
  ).length;

  // NOT_PLOTTED is deliberately excluded. Those members also read 0.00 hrs, but
  // counting them as underloaded turns "the timetable has not been generated"
  // into an alarm about faculty and hides the real underloads among them.
  const underloaded = teachers.filter((t) => t.load_status === 'UNDERLOAD').length;
  const notPlotted = teachers.filter((t) => t.load_status === 'NOT_PLOTTED').length;
  const noActiveTerm = teachers.length > 0 && teachers.every((t) => t.load_status === 'NO_ACTIVE_TERM');

  const loadNote = noActiveTerm
    ? 'No active term — set one in Academic Semesters to see teaching load.'
    : [
        overloaded > 0 ? `${pluralize(overloaded, 'member')} on overload` : null,
        underloaded > 0 ? `${pluralize(underloaded, 'member')} underloaded` : null,
        notPlotted > 0 ? `${pluralize(notPlotted, 'member')} awaiting generation` : null,
      ].filter(Boolean).join(' · ') || undefined;

  // The 40-hour week depends only on the term and employment type, so it is the
  // same table for every Full-Time member and is shown once rather than
  // repeated down the page. Taken off the first Full-Time record because that
  // is where the backend already resolves the active term.
  const workWeek = teachers.find((t) => t.work_week)?.work_week || null;

  const rowActions = (t) =>
    canManageFaculty ? (
      <div className="flex gap-2 justify-end">
        <AtlasButton size="row" variant="secondary" className={ROW_CONTROL} onClick={() => handleOpenModal(t)} aria-label={`Edit ${t.name}`}>
          Edit
        </AtlasButton>
        {/* `destructive` is the system's outlined red — a bordered control
            rather than red text, which is what made Remove read as a word
            sitting in the row instead of the button it is. */}
        <AtlasButton
          size="row"
          variant="destructive"
          onClick={() => handleDelete(t.id)}
          aria-label={`Remove ${t.name}`}
        >
          Remove
        </AtlasButton>
      </div>
    ) : null;

  return (
    <Page>
      <PageHeader
        title="Faculty"
        meta={
          isLoading
            ? 'Loading your college’s faculty…'
            : `${pluralize(teachers.length, 'member')} · ${pluralize(
                teachers.reduce((n, t) => n + (t.subject_offerings?.length || 0), 0), 'subject'
              )} assigned`
        }
        note={loadNote}
        actions={
          canManageFaculty ? (
            <AtlasButton icon={Plus} onClick={() => handleOpenModal()}>Add Faculty</AtlasButton>
          ) : (
            <AtlasButton restricted restrictionReason={restrictionReason('program_chair', 'add faculty')}>
              Add Faculty
            </AtlasButton>
          )
        }
      />

      {/* Without an active term there is no required load and no schedule to
          measure, so every figure on this page would be blank with nothing to
          say why. Name the cause and the fix instead of letting the work-week
          panel silently vanish. */}
      {noActiveTerm && (
        <div className="glass rounded-panel p-4 mb-4 rise-flat">
          <p className="font-ui text-body text-atlas-ink">No active term.</p>
          <p className="font-ui text-caption text-atlas-slate mt-1">
            Teaching load is measured against the active term’s required hours —
            24 hrs/week in the 1st term, 20 in the 2nd and 3rd. Set an active
            semester in Academic Semesters and the load figures will appear here.
          </p>
        </div>
      )}

      {/* The Full-Time 40-hour week. Worth stating because 40 hours is the
          total duty week, not 40 teaching hours -- the distinction the old
          units-based meter gave a chair no way to see. */}
      {workWeek && (
        /* A reminder, not a feature.
           This is standing institutional policy — it is the same five figures
           every time the page loads and nothing a chair does here changes
           them. It earned a full panel of number tiles in an earlier pass,
           which gave the page's largest, greenest element to its least
           actionable content. One quiet line, above the roster it qualifies. */
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-4 px-4 py-2.5 rounded-field
                      bg-atlas-50/70 border border-atlas-line font-ui text-caption text-atlas-slate rise-flat">
          <span className="inline-flex items-center gap-1.5 font-medium text-atlas-800">
            <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            Full-time week · {workWeek.term} term
          </span>
          <span className="tabular-nums">
            Teaching <span className="font-data text-atlas-ink">{formatHours(workWeek.teaching_hours)}</span>
            {' · '}Off-campus <span className="font-data text-atlas-ink">{formatHours(workWeek.off_campus_hours)}</span>
            {' · '}Consultation <span className="font-data text-atlas-ink">{formatHours(workWeek.consultation_hours)}</span>
            {' · '}Office <span className="font-data text-atlas-ink">{formatHours(workWeek.office_hours)}</span>
            {' · '}Total <span className="font-data text-atlas-ink">{formatHours(workWeek.total_hours)}</span> hrs
          </span>
          <span>
            REG. hours measure Teaching alone. Part-time teach under{' '}
            {formatHours(PART_TIME_CEILING_HOURS)} hrs/week.
          </span>
        </p>
      )}

      <FacultyPreviewDialog
        isOpen={Boolean(previewTeacher)}
        teacher={previewTeacher}
        curriculumById={curriculumById}
        schedules={previewTeacher
          ? (schedulesByFaculty.get(previewTeacher.faculty_id || previewTeacher.id) || [])
          : []}
        scheduleUnavailable={scheduleUnavailable}
        canManage={canManageFaculty}
        onClose={() => setPreviewTeacher(null)}
        onManageSubjects={(t) => { setPreviewTeacher(null); handleOpenSubjectModal(t); }}
      />

      {/* Table from 1024 up. */}
      <div className="hidden lg:block rise-flat">
        <DataTable
          caption={`Faculty, ${pluralize(teachers.length, 'member')}`}
          columns={columns}
          rows={teachers}
          isLoading={isLoading}
          emptyTitle="No faculty yet."
          emptyBody="Add the professors in your college before generating a timetable."
          emptyAction={
            canManageFaculty ? (
              <AtlasButton icon={Plus} onClick={() => handleOpenModal()}>Add Faculty</AtlasButton>
            ) : null
          }
          rowActions={canManageFaculty ? rowActions : undefined}
        />
      </div>

      {/* Card list below 1024. A six-column table cannot be read on a phone,
          and the alternative to a card layout is a horizontal scrollbar
          (ux-guidelines: Table Handling / Horizontal Scroll). */}
      <div className="lg:hidden flex flex-col gap-3">
        {isLoading && (
          <p className="font-ui text-body text-atlas-slate" aria-busy="true">Loading…</p>
        )}
        {!isLoading && teachers.length === 0 && (
          <EmptyState
            icon={UsersIcon}
            title="No faculty yet."
            body="Add the professors in your college before generating a timetable."
          />
        )}
        {!isLoading && teachers.map((t) => {
          const isFullTime = t.type === 'full_time' || t.type === 'Full-Time';
          return (
            <div key={t.id} className="glass rounded-panel p-4 border border-emerald-900/10 shadow-xs">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    aria-hidden="true"
                    className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-800 text-white shrink-0 flex items-center justify-center font-ui text-caption font-bold shadow-xs ring-2 ring-emerald-100"
                  >
                    {initialsOf(t.name)}
                  </span>
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => setPreviewTeacher(t)}
                      className="font-ui text-sm font-bold text-slate-900 hover:text-emerald-800 text-left transition-colors flex items-center gap-1.5"
                    >
                      <span className="truncate">{t.name}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    </button>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10.5px] font-semibold border shadow-2xs ${
                        isFullTime
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}>
                        {isFullTime ? 'Full-time' : 'Part-time'}
                      </span>
                      <span className="text-xs text-slate-500 font-medium">
                        {pluralize(t.subject_offerings?.length || 0, 'subject')}
                      </span>
                    </div>
                  </div>
                </div>
                <span className="flex flex-col items-end gap-1.5 shrink-0">
                  <LoadMeter
                    used={t.reg_hours || 0}
                    required={t.required_hours}
                    status={t.load_status}
                    ceiling={t.part_time_ceiling_hours}
                    overCeiling={t.exceeds_part_time_ceiling}
                  />
                  <LoadStatusBadge status={t.load_status} overCeiling={t.exceeds_part_time_ceiling} />
                </span>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-200/60 flex flex-wrap items-center justify-between gap-y-2 gap-x-3">
                <AvailabilityMarks unavailability={t.unavailability} />
                <span className="flex flex-wrap gap-1.5">
                  <AtlasButton size="row" variant="secondary" className={ROW_CONTROL} icon={Eye} onClick={() => setPreviewTeacher(t)}>Preview</AtlasButton>
                  <AtlasButton size="row" variant="secondary" className={ROW_CONTROL} onClick={() => handleOpenSubjectModal(t)}>Subjects</AtlasButton>
                </span>
              </div>
              {canManageFaculty && (
                <div className="mt-2.5 flex flex-wrap justify-end gap-2">
                  <AtlasButton size="row" variant="secondary" className={ROW_CONTROL} onClick={() => handleOpenModal(t)}>Edit</AtlasButton>
                  <AtlasButton
                    size="row"
                    variant="destructive"
                    onClick={() => handleDelete(t.id)}
                  >
                    Remove
                  </AtlasButton>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AtlasDialog
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        icon={editingTeacher ? UsersIcon : UserPlus}
        title={editingTeacher ? `Edit ${editingTeacher.name}` : 'Add Faculty'}
        description="Their teaching cap and unavailable hours both constrain generation."
        dismissible={!isSavingTeacher}
        footer={
          <>
            <AtlasButton variant="ghost" onClick={handleCloseModal} disabled={isSavingTeacher}>
              Cancel
            </AtlasButton>
            <AtlasButton type="submit" form="faculty-form" loading={isSavingTeacher}>
              {editingTeacher ? 'Save Changes' : 'Add Faculty'}
            </AtlasButton>
          </>
        }
      >
        {/* noValidate on purpose. The browser's own bubble fires before our
            handler, is a transient tooltip rather than a message under the
            field, and cannot be styled — so it both pre-empts and contradicts
            the inline errors below (ux-guidelines: Error Placement). */}
        <form id="faculty-form" noValidate onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Profile. Fields come from the shared Field components, so labels
              are bound to their inputs, "Required" is stated rather than
              implied by an asterisk, and an error appears under the field it
              belongs to instead of only in a toast. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <TextInput
                label="Full name"
                required
                placeholder="e.g. Juan Dela Cruz"
                hint="First name, then surname"
                value={formData.name}
                error={formErrors.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value });
                  if (formErrors.name) setFormErrors({ ...formErrors, name: undefined });
                }}
                onBlur={() => setFormErrors((prev) => ({ ...prev, name: validateName(formData.name) }))}
              />
            </div>

            <RadioGroup
              label="Employment"
              required
              name="faculty-type"
              value={formData.type}
              onChange={(v) => setFormData({ ...formData, type: v })}
              options={[
                {
                  value: 'full_time',
                  label: 'Full-time',
                  hint: '20–24 hrs/week required',
                },
                {
                  value: 'part_time',
                  label: 'Part-time',
                  hint: 'Under 20 hrs/week',
                },
              ]}
            />

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="faculty-load-limit"
                  className="font-ui text-micro uppercase text-atlas-slate flex items-center gap-2"
                >
                  {formData.load_unit === 'hrs' ? 'Maximum teaching hours' : 'Maximum subject units'}
                </label>
                <div
                  className="inline-flex p-0.5 rounded-field bg-atlas-100 border border-atlas-line text-caption font-ui"
                  role="group"
                  aria-label="Load limit unit of measurement"
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (formData.load_unit === 'units') return;
                      const maxLimit = formData.type === 'part_time' ? 12 : 18;
                      setFormData((prev) => ({
                        ...prev,
                        load_unit: 'units',
                        max_units: prev.max_units ? Math.min(maxLimit, Math.max(1, Math.round(Number(prev.max_units)))) : maxLimit,
                      }));
                      if (formErrors.max_units) setFormErrors((prev) => ({ ...prev, max_units: undefined }));
                    }}
                    className={`px-2.5 py-1 rounded-[4px] font-medium transition-all duration-state ease-standard ${
                      formData.load_unit !== 'hrs'
                        ? 'bg-white text-atlas-ink shadow-sm'
                        : 'text-atlas-slate hover:text-atlas-ink'
                    }`}
                  >
                    Units
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (formData.load_unit === 'hrs') return;
                      const maxLimit = formData.type === 'part_time' ? 20 : 30;
                      setFormData((prev) => ({
                        ...prev,
                        load_unit: 'hrs',
                        max_units: prev.max_units ? Math.min(maxLimit, Math.max(1, Math.round(Number(prev.max_units)))) : (formData.type === 'part_time' ? 16 : 24),
                      }));
                      if (formErrors.max_units) setFormErrors((prev) => ({ ...prev, max_units: undefined }));
                    }}
                    className={`px-2.5 py-1 rounded-[4px] font-medium transition-all duration-state ease-standard ${
                      formData.load_unit === 'hrs'
                        ? 'bg-white text-atlas-ink shadow-sm'
                        : 'text-atlas-slate hover:text-atlas-ink'
                    }`}
                  >
                    Hours (hrs)
                  </button>
                </div>
              </div>

              <NumberInput
                id="faculty-load-limit"
                suffix={formData.load_unit === 'hrs' ? 'hrs' : 'units'}
                min={1}
                max={
                  formData.load_unit === 'hrs'
                    ? (formData.type === 'part_time' ? 20 : 30)
                    : (formData.type === 'part_time' ? 12 : 18)
                }
                value={formData.max_units}
                error={formErrors.max_units}
                onChange={(e) => {
                  setFormData({ ...formData, max_units: e.target.value });
                  if (formErrors.max_units) setFormErrors({ ...formErrors, max_units: undefined });
                }}
                onBlur={() => setFormErrors((prev) => ({ ...prev, max_units: validateUnits(formData.max_units, formData.load_unit, formData.type) }))}
              />
            </div>
          </div>

          {/* Unavailable hours.
              This had three representations of one fact: day toggles, a panel
              per selected day, and a "Selected Unavailable Times" chip list
              repeating what the panels already said. Two now — the toggle row
              and one row per chosen day — because the third was a summary of
              something already on screen.
              The tint is the conflict token, matching the day marks in the
              table, so "unavailable" looks the same wherever it appears. */}
          <fieldset className="pt-2">
            <legend className="font-ui text-micro uppercase text-atlas-slate mb-3">
              Unavailable hours
            </legend>

            <div className="flex flex-wrap gap-2">
              {DAYS.map((day) => {
                const isSelected = selectedDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedDays((prev) => prev.filter((d) => d !== day));
                        setCustomRanges((prev) => {
                          const next = { ...prev };
                          delete next[day];
                          return next;
                        });
                      } else {
                        setSelectedDays((prev) => [...prev, day]);
                        setCustomRanges((prev) => ({
                          ...prev,
                          [day]: [{ id: Math.random().toString(36).substring(2, 9), start: '07:30', end: '17:30', active: false }],
                        }));
                      }
                    }}
                    className={`h-10 px-4 rounded-control font-ui text-body border
                                transition-colors duration-state ease-standard ${focusRing} ${
                      isSelected
                        ? 'bg-sem-conflict-bg border-sem-conflict/40 text-sem-conflict font-medium'
                        : 'glass text-atlas-slate hover:text-atlas-ink'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            <p className="font-ui text-caption text-atlas-slate mt-2">
              {selectedDays.length === 0
                ? 'Available all week. Pick a day to mark it unavailable.'
                : 'Whole day unless you set specific hours below.'}
            </p>

            {selectedDays.length > 0 && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-3 px-1 py-1">
                  <span className="font-ui text-micro uppercase text-atlas-slate font-medium">
                    {pluralize(selectedDays.length, 'day')} unavailable
                  </span>
                  <AtlasButton
                    size="row"
                    variant="destructive"
                    icon={Trash2}
                    onClick={() => { setSelectedDays([]); setCustomRanges({}); }}
                  >
                    Clear all
                  </AtlasButton>
                </div>

                {DAYS.filter((d) => selectedDays.includes(d)).map((day) => {
                  const ranges = getRangesForDay(day);
                  return (
                    <div
                      key={day}
                      className="rounded-panel border border-atlas-line bg-atlas-canvas/40 overflow-hidden divide-y divide-atlas-line shadow-xs"
                    >
                      {ranges.map((range, rangeIdx) => {
                        const isFirst = rangeIdx === 0;
                        return (
                          <div
                            key={`${day}-${range.id || rangeIdx}`}
                            className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2.5"
                          >
                            {isFirst ? (
                              <>
                                <span className="font-ui text-body text-atlas-ink w-11 shrink-0 font-semibold">
                                  {day}
                                </span>

                                <label className="flex items-center gap-2 cursor-pointer shrink-0 w-[116px]">
                                  <input
                                    type="checkbox"
                                    checked={range.active}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      if (!checked && ranges.length > 1) {
                                        setCustomRanges((prev) => ({
                                          ...prev,
                                          [day]: [{
                                            id: Math.random().toString(36).substring(2, 9),
                                            start: '07:30',
                                            end: '17:30',
                                            active: false,
                                          }],
                                        }));
                                      } else {
                                        handleUpdateRange(day, range.id, { active: checked });
                                      }
                                    }}
                                    className={`w-4 h-4 shrink-0 accent-[var(--atlas-green-700)] ${focusRing}`}
                                  />
                                  <span className="font-ui text-caption text-atlas-slate">Specific hours</span>
                                </label>
                              </>
                            ) : (
                              <>
                                {/* On added time slots, do not duplicate text before time (only the time) */}
                                <span className="w-11 shrink-0 hidden sm:block" aria-hidden="true" />
                                <span className="w-[116px] shrink-0 hidden sm:block" aria-hidden="true" />
                              </>
                            )}

                            {range.active ? (
                              <span className="flex items-center gap-1.5 shrink-0">
                                <label className="sr-only" htmlFor={`unavail-${day}-${range.id}-from`}>
                                  {day} unavailable from
                                </label>
                                <input
                                  id={`unavail-${day}-${range.id}-from`}
                                  type="time"
                                  value={range.start}
                                  onChange={(e) => handleUpdateRange(day, range.id, { start: e.target.value })}
                                  className={`h-9 px-2 w-[116px] rounded-field font-data text-table text-atlas-ink
                                              bg-white/70 border border-atlas-control ${focusRing}`}
                                />
                                <span className="font-ui text-caption text-atlas-slate px-0.5">to</span>
                                <label className="sr-only" htmlFor={`unavail-${day}-${range.id}-to`}>
                                  {day} unavailable until
                                </label>
                                <input
                                  id={`unavail-${day}-${range.id}-to`}
                                  type="time"
                                  value={range.end}
                                  onChange={(e) => handleUpdateRange(day, range.id, { end: e.target.value })}
                                  className={`h-9 px-2 w-[116px] rounded-field font-data text-table text-atlas-ink
                                              bg-white/70 border border-atlas-control ${focusRing}`}
                                />
                              </span>
                            ) : (
                              <span className="font-ui text-caption text-atlas-slate tabular-nums py-0.5">
                                All day · {formatTime('07:30')} – {formatTime('17:30')}
                              </span>
                            )}

                            <div className="flex items-center gap-1 shrink-0 ml-auto pr-1">
                              <AtlasButton
                                size="row"
                                variant="ghost"
                                icon={Plus}
                                onClick={() => handleAddRange(day)}
                                aria-label={`Add another unavailable time for ${day}`}
                                className="!px-2 !gap-1.5"
                              >
                                Add
                              </AtlasButton>
                              <AtlasButton
                                size="row"
                                variant="ghost"
                                icon={X}
                                onClick={() => handleRemoveRange(day, range.id)}
                                aria-label={`Remove unavailable time for ${day}`}
                                className="!px-2 !gap-1.5 hover:!text-rose-600"
                              >
                                Remove
                              </AtlasButton>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </fieldset>

          {/* The submit and cancel buttons now live in the Dialog's own footer,
              so they sit outside the scrolling body and stay reachable on a
              short viewport. */}
        </form>
      </AtlasDialog>

      {/* Availability. Was a read-only two-column list of blocked windows, with
          editing only possible from the teacher form via a day dropdown and two
          time fields. It is now a direct-manipulation week grid on the same time
          axis as the schedule, saved in one request (DEP-3). */}
      <AtlasConfirmDialog
        isOpen={Boolean(deleteTeacherTarget)}
        onClose={() => { setDeleteTeacherTarget(null); setDeleteImpact(null); }}
        onConfirm={confirmDeleteTeacher}
        title={`Remove ${deleteTeacherTarget?.name || ''}?`}
        description={deleteDescription()}
        confirmLabel="Remove Faculty Member"
        destructive
        // Held while the count is in flight, so the chair cannot confirm before
        // being told what goes.
        loading={isDeletingTeacher || !deleteImpact}
      />

      <AtlasDialog
        isOpen={isAvailabilityModalOpen}
        onClose={() => setIsAvailabilityModalOpen(false)}
        icon={Clock}
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
      <AtlasDialog
        isOpen={isSubjectModalOpen}
        onClose={() => { setIsSubjectModalOpen(false); fetchTeachers(); }}
        icon={BookOpen}
        title={`Subjects — ${selectedTeacherForSubjects?.name || ''}`}
        description={
          subjectScope
            ? `Your role assigns ${subjectScope.assigns} only. Changes save as you tick.`
            : 'Changes save as you tick.'
        }
        footer={
          <div className="flex flex-col sm:flex-row sm:items-center justify-between w-full gap-3">
            <div className="flex items-center gap-2.5 text-xs text-atlas-slate font-ui">
              <span>
                Assigned: <strong className="text-atlas-ink font-data font-semibold">{assignedSubjectsList.length}</strong> {pluralize(assignedSubjectsList.length, 'subject')}
              </span>
              <span>·</span>
              <span>
                Units: <strong className="text-emerald-800 font-data font-semibold">{totalAssignedUnits}</strong>
              </span>
              <span>·</span>
              <span>
                Load: <strong className="text-teal-950 font-data font-semibold">{formatHours(totalAssignedHours)}</strong> hrs/wk
              </span>
            </div>
            <AtlasButton onClick={() => { setIsSubjectModalOpen(false); fetchTeachers(); }}>
              Done
            </AtlasButton>
          </div>
        }
      >
        <div className="flex flex-col gap-5">
          {isLoadingSubjects && (
            <p className="py-10 text-center font-ui text-body text-atlas-slate" aria-busy="true">
              Loading subjects…
            </p>
          )}

          {/* A draft curriculum is one the administrator is still revising, so
              nothing in it can be committed to a teaching load yet. The whole
              assignment surface is withheld rather than shown and refused. */}
          {!isLoadingSubjects && !hasPublishedCurriculum && (
            <EmptyState
              tone="warning"
              title="No published curriculum for your college."
              body={`Subjects cannot be assigned until an administrator publishes your curriculum. Until then there is nothing to commit ${selectedTeacherForSubjects?.name || 'this faculty member'} to.`}
            />
          )}

          {!isLoadingSubjects && hasPublishedCurriculum && (
            <>
              {/* Live Units and Hours Tracking Summary Bar */}
              <div className="bg-gradient-to-r from-emerald-50/90 via-teal-50/80 to-slate-50 border border-emerald-200/80 rounded-panel p-3.5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-4 sm:divide-x sm:divide-emerald-200/70">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-600/10 text-emerald-800 flex items-center justify-center shrink-0">
                      <BookOpen className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 font-ui">
                        Assigned
                      </div>
                      <div className="text-sm font-bold text-slate-900 font-data">
                        {assignedSubjectsList.length} <span className="text-xs font-normal text-slate-500">{pluralize(assignedSubjectsList.length, 'subject')}</span>
                      </div>
                    </div>
                  </div>

                  <div className="sm:pl-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 font-ui">
                      Total Units
                    </div>
                    <div className="text-sm font-bold text-emerald-900 font-data tabular-nums">
                      {totalAssignedUnits} <span className="text-xs font-normal text-slate-500">units</span>
                    </div>
                  </div>

                  <div className="sm:pl-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 font-ui">
                      Total Teaching Load
                    </div>
                    <div className="text-sm font-bold text-teal-950 font-data tabular-nums flex items-baseline gap-1">
                      <span>{formatHours(totalAssignedHours)}</span>
                      <span className="text-xs font-semibold text-slate-500">
                        {selectedTeacherForSubjects?.required_hours
                          ? `/ ${formatHours(selectedTeacherForSubjects.required_hours)} hrs target`
                          : selectedTeacherForSubjects?.type === 'part_time'
                          ? `/ < ${formatHours(PART_TIME_CEILING_HOURS)} hrs cap`
                          : 'hrs/wk'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Real-time Status Badge */}
                <div className="shrink-0 flex items-center">
                  {selectedTeacherForSubjects?.type === 'part_time' ? (
                    totalAssignedHours >= PART_TIME_CEILING_HOURS ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200 shadow-2xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
                        Exceeds Part-Time Cap (+{formatHours(totalAssignedHours - PART_TIME_CEILING_HOURS)} hrs)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                        Part-Time Load ({formatHours(PART_TIME_CEILING_HOURS - totalAssignedHours)} hrs room)
                      </span>
                    )
                  ) : selectedTeacherForSubjects?.required_hours ? (
                    totalAssignedHours > selectedTeacherForSubjects.required_hours + 0.005 ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200 shadow-2xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
                        Overload (+{formatHours(totalAssignedHours - selectedTeacherForSubjects.required_hours)} hrs)
                      </span>
                    ) : totalAssignedHours >= selectedTeacherForSubjects.required_hours - 0.005 ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                        Full Load Target Reached
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200 shadow-2xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        Underload ({formatHours(selectedTeacherForSubjects.required_hours - totalAssignedHours)} hrs to target)
                      </span>
                    )
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs">
                      {assignedSubjectsList.length > 0 ? 'Load active' : 'No subjects assigned'}
                    </span>
                  )}
                </div>
              </div>

              {/* md:items-end, not the default stretch.
                  Term and Type each carry a visible label, so their controls
                  start ~22px lower than the search box, which has none — the
                  row stretched all three to the tallest and left the search
                  field sitting alone at the top. Aligning on the bottom edge
                  puts the three controls on one line. Only from md: in the
                  stacked layout the cross axis is horizontal, and `items-end`
                  there would shrink every field to its content and shove them
                  against the right edge. */}
              <div className="flex flex-col md:flex-row md:items-end gap-3">
                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                  <label htmlFor="subject-search" className="font-ui text-micro uppercase text-atlas-slate flex items-center gap-2">
                    Search
                  </label>
                  <div className="relative">
                    <Search
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-atlas-slate pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="subject-search"
                      type="search"
                      value={subjectSearchQuery}
                      onChange={(e) => setSubjectSearchQuery(e.target.value)}
                      placeholder="Search by code or name"
                      className={`w-full h-10 pl-9 pr-3 rounded-field font-ui text-body text-atlas-ink
                                  bg-white/70 backdrop-blur-sm border border-atlas-control
                                  placeholder:text-atlas-disabled hover:border-atlas-slate
                                  transition-colors duration-state ease-standard ${focusRing}`}
                    />
                  </div>
                </div>
                <div className="flex md:items-end gap-3">
                  <SelectInput
                    label="Term"
                    className="w-36"
                    value={semesterFilter}
                    onChange={(e) => setSemesterFilter(e.target.value)}
                    options={[
                      { value: '1st', label: '1st Term' },
                      { value: '2nd', label: '2nd Term' },
                      { value: '3rd', label: '3rd Term' },
                    ]}
                  />
                  <SelectInput
                    label="Type"
                    className="w-40"
                    value={courseCodeFilter}
                    onChange={(e) => setCourseCodeFilter(e.target.value)}
                    options={[
                      { value: 'All', label: 'All types' },
                      { value: 'A', label: 'Lecture only' },
                      { value: 'B', label: 'Lab only' },
                      { value: 'C', label: 'Lecture + lab' },
                    ]}
                  />
                </div>
              </div>

              <div className="rounded-panel border border-atlas-line overflow-hidden">
                <div className="max-h-[45vh] overflow-y-auto">
                  <table className="w-full border-collapse">
                    <caption className="sr-only">
                      Subjects that can be assigned, {pluralize(visibleSubjects.length, 'result')}
                    </caption>
                    <thead className="sticky top-0 z-sticky bg-white/90 backdrop-blur-md shadow-sticky">
                      <tr>
                        <th scope="col" className="w-12 px-4 py-3 font-ui text-micro uppercase text-atlas-slate">
                          <span className="sr-only">Assigned</span>
                        </th>
                        {['Code', 'Subject', 'Type', 'Units', 'Hours / Wk'].map((h, i) => (
                          <th
                            key={h}
                            scope="col"
                            className={`px-4 py-3 font-ui text-micro uppercase text-atlas-slate whitespace-nowrap
                                        ${i >= 3 ? 'text-right' : 'text-left'}`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleSubjects.map((sub) => {
                        const isAssigned = teacherSubjects.some((ts) => ts.curriculum_id === sub.id);
                        return (
                          <tr
                            key={sub.id}
                            className={`border-t border-atlas-line transition-colors duration-state ease-standard
                                        ${isAssigned ? 'bg-atlas-100/70' : 'hover:bg-atlas-50'}`}
                          >
                            <td className="px-4 py-2.5 text-center">
                              <input
                                type="checkbox"
                                checked={isAssigned}
                                onChange={() => handleToggleSubject(sub)}
                                aria-label={`Assign ${sub.code} ${sub.name}`}
                                className={`w-4 h-4 cursor-pointer accent-[var(--atlas-green-700)] ${focusRing}`}
                              />
                            </td>
                            <td className="px-4 py-2.5 font-data text-table text-atlas-ink whitespace-nowrap">
                              {sub.code}
                            </td>
                            <td className="px-4 py-2.5 font-ui text-table text-atlas-ink">{sub.name}</td>
                            <td className="px-4 py-2.5 font-ui text-table text-atlas-slate whitespace-nowrap">
                              {sub.type === 'lab' ? 'Laboratory' : 'Lecture'}
                            </td>
                            <td className="px-4 py-2.5 text-right font-data text-table tabular-nums text-atlas-ink">
                              {sub.units}
                            </td>
                            <td className="px-4 py-2.5 text-right font-data text-table tabular-nums font-semibold text-slate-700 whitespace-nowrap">
                              {formatHours(computeSubjectHours(sub))} hrs
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {visibleSubjects.length === 0 && (
                  <p className="p-8 text-center font-ui text-body text-atlas-slate">
                    No {subjectScope ? subjectScope.assigns : 'subjects'} match the selected filters.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </AtlasDialog>

      {/* Confirmation Dialog before overriding/assigning a Gen Ed subject */}
      <AtlasConfirmDialog
        isOpen={confirmGenEdModalOpen}
        onClose={() => {
          setConfirmGenEdModalOpen(false);
          setPendingGenEdSubject(null);
        }}
        onConfirm={async () => {
          if (pendingGenEdSubject?.subject) {
            await confirmAssignSubject(pendingGenEdSubject.subject);
          }
          setConfirmGenEdModalOpen(false);
          setPendingGenEdSubject(null);
        }}
        title={pendingGenEdSubject?.existingOtherOffering ? 'Confirm Assignment Override' : 'Confirm General Education Assignment'}
        description={
          pendingGenEdSubject?.existingOtherOffering
            ? `${pendingGenEdSubject.subject.code} (${pendingGenEdSubject.subject.name}) is a General Education subject currently assigned to ${pendingGenEdSubject.existingOtherOffering.faculty_name}. Assigning it to ${selectedTeacherForSubjects?.name} will override the existing assignment. Do you want to proceed?`
            : `${pendingGenEdSubject?.subject.code} (${pendingGenEdSubject?.subject.name}) is a General Education subject. Are you sure you want to assign this subject to ${selectedTeacherForSubjects?.name}?`
        }
        confirmLabel={pendingGenEdSubject?.existingOtherOffering ? 'Confirm Override' : 'Confirm Assignment'}
        destructive={Boolean(pendingGenEdSubject?.existingOtherOffering)}
      />
    </Page>
  );
}
