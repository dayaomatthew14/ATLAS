import { useState, useEffect, useMemo } from 'react';
import { Plus, Users as UsersIcon, Clock, X, Search, Trash2 } from 'lucide-react';
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
import { blocksToCells, cellsToBlocks } from '../../utils/availability';
import { restrictionReason, pluralize, focusRing } from '../../components/ui/tokens';
import { canManageFaculty as canManageFacultyRole, getRole, ROLES } from '../../utils/session';

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
const validateUnits = (value) => {
  if (value === '' || value === null || value === undefined) return undefined;
  const n = Number(value);
  if (Number.isNaN(n)) return 'Enter a number of units, or leave it blank.';
  if (!Number.isInteger(n)) return 'Units must be a whole number.';
  if (n < 1 || n > 30) return 'Enter a value between 1 and 30, or leave it blank.';
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
  [ROLES.PROGRAM_CHAIR]: { isMajor: true, label: 'Major subjects', assigns: 'major subjects' },
  [ROLES.COORDINATOR]: { isMajor: false, label: 'General Education', assigns: 'General Education subjects' },
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
    unavailability: []
  });
  const [selectedDays, setSelectedDays] = useState([]);
  const [customRanges, setCustomRanges] = useState({}); // { 'Mon': { start: '07:30', end: '17:30', active: false } }

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
        className="inline-flex gap-1"
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
              className={`w-6 h-6 rounded-field inline-flex items-center justify-center font-data text-caption
                          ${isBlocked
                            ? 'bg-sem-conflict-bg text-sem-conflict border border-sem-conflict/30'
                            : 'bg-atlas-canvas text-atlas-slate border border-atlas-line'}`}
            >
              {isBlocked ? '×' : day[0]}
            </span>
          );
        })}
      </span>
    );
  };

  const columns = [
    {
      key: 'name',
      label: 'Faculty',
      render: (item) => <span className="font-ui text-body text-atlas-ink">{item.name}</span>,
    },
    {
      key: 'load',
      label: 'REG. hours / week',
      width: '215px',
      render: (item) => (
        <span className="flex flex-col gap-1">
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
      key: 'type',
      label: 'Employment',
      width: '120px',
      render: (item) => (
        <span className="font-ui text-table text-atlas-slate">
          {item.type === 'part_time' ? 'Part-time' : 'Full-time'}
        </span>
      ),
    },
    {
      key: 'subject_offerings',
      label: 'Subjects',
      width: '170px',
      render: (item) => (
        <span className="flex items-center gap-3">
          <span className="font-data text-table tabular-nums text-atlas-ink w-4">
            {item.subject_offerings?.length || 0}
          </span>
          <AtlasButton size="row" variant="ghost" onClick={() => handleOpenSubjectModal(item)}>
            Manage
          </AtlasButton>
        </span>
      ),
    },
    {
      key: 'availability',
      label: 'Availability',
      width: '230px',
      render: (item) => {
        return (
          <span className="flex items-center gap-3">
            <AvailabilityMarks unavailability={item.unavailability} />
            <AtlasButton size="row" variant="ghost" icon={Clock} onClick={() => handleOpenAvailability(item)}>
              Edit
            </AtlasButton>
          </span>
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
  const [formErrors, setFormErrors] = useState({});
  const [isSavingTeacher, setIsSavingTeacher] = useState(false);

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
        const matchScope = !subjectScope || Boolean(sub.is_major) === subjectScope.isMajor;

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
        // Assigning a subject is not itself a teaching load: load is REG. HOURS
        // off the plotted schedule, and an unplotted subject contributes none.
        // This used to refuse the assignment outright when subject *units*
        // passed `max_units`, blocking a chair on a rule the institution does
        // not have. Overload is now surfaced where it is real -- at plotting
        // time, by the generator, and on the load meter above.
        const updatedUnits = (selectedTeacherForSubjects.current_units || 0) + subject.units;

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

    // Validate against the fields themselves. These used to be absent
    // entirely — a blank name posted and came back a 422 the user had to
    // interpret from a toast (ux-guidelines: Error Placement, Inline Validation).
    const errors = {
      name: validateName(formData.name),
      max_units: validateUnits(formData.max_units),
    };
    setFormErrors(errors);
    if (errors.name || errors.max_units) return;

    setIsSavingTeacher(true);

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
      <div className="flex gap-1 justify-end">
        <AtlasButton size="row" variant="ghost" onClick={() => handleOpenModal(t)} aria-label={`Edit ${t.name}`}>
          Edit
        </AtlasButton>
        <AtlasButton
          size="row"
          variant="ghost"
          onClick={() => handleDelete(t.id)}
          aria-label={`Remove ${t.name}`}
          className="text-sem-conflict hover:bg-sem-conflict-bg"
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
        <div className="glass rounded-panel p-4 mb-4 rise-flat">
          <p className="font-ui text-micro uppercase text-atlas-slate mb-2">
            Full-time work week · {workWeek.term} term
          </p>
          <dl className="flex flex-wrap gap-x-8 gap-y-2">
            {[
              ['Teaching', workWeek.teaching_hours],
              ['Off-campus', workWeek.off_campus_hours],
              ['Consultation', workWeek.consultation_hours],
              ['Office hours', workWeek.office_hours],
              ['Total', workWeek.total_hours],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col">
                <dt className="font-ui text-caption text-atlas-slate">{label}</dt>
                <dd className="font-data text-table tabular-nums text-atlas-ink">
                  {formatHours(value)} hrs
                </dd>
              </div>
            ))}
          </dl>
          <p className="font-ui text-caption text-atlas-slate mt-2">
            REG. hours come from the plotted schedule — class duration × meetings per week.
            Part-time faculty have no required figure and teach under{' '}
            {formatHours(PART_TIME_CEILING_HOURS)} hrs/week.
          </p>
        </div>
      )}

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
            <div key={t.id} className="glass rounded-panel p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-ui text-body text-atlas-ink truncate">{t.name}</p>
                  <p className="font-ui text-caption text-atlas-slate mt-0.5">
                    {isFullTime ? 'Full-time' : 'Part-time'} · {pluralize(t.subject_offerings?.length || 0, 'subject')}
                  </p>
                </div>
                <span className="flex flex-col items-end gap-1 shrink-0">
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
              <div className="mt-3 pt-3 border-t border-white/45 flex items-center justify-between gap-3">
                <AvailabilityMarks unavailability={t.unavailability} />
                <span className="flex gap-1 shrink-0">
                  <AtlasButton size="row" variant="ghost" onClick={() => handleOpenSubjectModal(t)}>Subjects</AtlasButton>
                  <AtlasButton size="row" variant="ghost" onClick={() => handleOpenAvailability(t)}>Hours</AtlasButton>
                </span>
              </div>
              {canManageFaculty && (
                <div className="mt-2 flex justify-end gap-1">
                  <AtlasButton size="row" variant="ghost" onClick={() => handleOpenModal(t)}>Edit</AtlasButton>
                  <AtlasButton
                    size="row"
                    variant="ghost"
                    onClick={() => handleDelete(t.id)}
                    className="text-sem-conflict hover:bg-sem-conflict-bg"
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
                  hint: 'Required load set by the term: 24 hrs 1st, 20 hrs 2nd and 3rd',
                },
                {
                  value: 'part_time',
                  label: 'Part-time',
                  hint: 'No required load; teaches under 20 hrs/week',
                },
              ]}
            />

            {/* Units are academic information, not the load basis -- the
                required teaching load comes from the term and employment type
                and is not editable here. This field is kept because curriculum
                planning still counts units, and the hint no longer claims it
                governs generation, which it no longer does. */}
            <NumberInput
              label="Maximum subject units"
              suffix="units"
              hint="Optional, 1–30. Curriculum bookkeeping only — it does not cap teaching load."
              min={1}
              max={30}
              value={formData.max_units}
              error={formErrors.max_units}
              onChange={(e) => {
                setFormData({ ...formData, max_units: e.target.value });
                if (formErrors.max_units) setFormErrors({ ...formErrors, max_units: undefined });
              }}
              onBlur={() => setFormErrors((prev) => ({ ...prev, max_units: validateUnits(formData.max_units) }))}
            />
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
                        setSelectedDays(selectedDays.filter((d) => d !== day));
                      } else {
                        setSelectedDays([...selectedDays, day]);
                        if (!customRanges[day]) {
                          setCustomRanges({ ...customRanges, [day]: { start: '07:30', end: '17:30', active: false } });
                        }
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
              <div className="mt-4 rounded-panel border border-atlas-line overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-atlas-canvas border-b border-atlas-line">
                  <span className="font-ui text-micro uppercase text-atlas-slate">
                    {pluralize(selectedDays.length, 'day')} unavailable
                  </span>
                  <AtlasButton
                    size="row"
                    variant="ghost"
                    icon={Trash2}
                    onClick={() => { setSelectedDays([]); setCustomRanges({}); }}
                    className="text-sem-conflict hover:bg-sem-conflict-bg"
                  >
                    Clear all
                  </AtlasButton>
                </div>

                <ul className="divide-y divide-atlas-line">
                  {DAYS.filter((d) => selectedDays.includes(d)).map((day) => {
                    const range = customRanges[day] || { start: '07:30', end: '17:30', active: false };
                    return (
                      <li key={day} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                        <span className="font-ui text-body text-atlas-ink w-12 shrink-0">{day}</span>

                        <label className="flex items-center gap-2.5 cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={range.active}
                            onChange={(e) => setCustomRanges({
                              ...customRanges,
                              [day]: { ...range, active: e.target.checked },
                            })}
                            className={`w-4 h-4 shrink-0 accent-[var(--atlas-green-700)] ${focusRing}`}
                          />
                          <span className="font-ui text-caption text-atlas-slate">Specific hours</span>
                        </label>

                        {range.active ? (
                          <span className="flex items-center gap-2 flex-1 min-w-0">
                            <label className="sr-only" htmlFor={`unavail-${day}-from`}>
                              {day} unavailable from
                            </label>
                            <input
                              id={`unavail-${day}-from`}
                              type="time"
                              value={range.start}
                              onChange={(e) => setCustomRanges({
                                ...customRanges, [day]: { ...range, start: e.target.value },
                              })}
                              className={`h-10 px-3 rounded-field font-data text-table text-atlas-ink
                                          bg-white/70 border border-atlas-control ${focusRing}`}
                            />
                            <span className="font-ui text-caption text-atlas-slate">to</span>
                            <label className="sr-only" htmlFor={`unavail-${day}-to`}>
                              {day} unavailable until
                            </label>
                            <input
                              id={`unavail-${day}-to`}
                              type="time"
                              value={range.end}
                              onChange={(e) => setCustomRanges({
                                ...customRanges, [day]: { ...range, end: e.target.value },
                              })}
                              className={`h-10 px-3 rounded-field font-data text-table text-atlas-ink
                                          bg-white/70 border border-atlas-control ${focusRing}`}
                            />
                          </span>
                        ) : (
                          <span className="flex-1 font-ui text-caption text-atlas-slate tabular-nums">
                            All day · {formatTime('07:30')} – {formatTime('17:30')}
                          </span>
                        )}

                        <AtlasButton
                          size="row"
                          variant="ghost"
                          icon={X}
                          onClick={() => setSelectedDays(selectedDays.filter((d) => d !== day))}
                          aria-label={`Make ${day} available again`}
                          className="shrink-0 ml-auto"
                        >
                          Remove
                        </AtlasButton>
                      </li>
                    );
                  })}
                </ul>
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
      <AtlasDialog
        isOpen={isSubjectModalOpen}
        onClose={() => { setIsSubjectModalOpen(false); fetchTeachers(); }}
        title={`Subjects — ${selectedTeacherForSubjects?.name || ''}`}
        description={
          subjectScope
            ? `Your role assigns ${subjectScope.assigns} only. Changes save as you tick.`
            : 'Changes save as you tick.'
        }
        footer={
          <AtlasButton onClick={() => { setIsSubjectModalOpen(false); fetchTeachers(); }}>
            Done
          </AtlasButton>
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
              <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1 min-w-0">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-atlas-slate pointer-events-none"
                    aria-hidden="true"
                  />
                  <label htmlFor="subject-search" className="sr-only">Search subjects</label>
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
                <div className="flex gap-3">
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
                        {['Code', 'Subject', 'Type', 'Units'].map((h, i) => (
                          <th
                            key={h}
                            scope="col"
                            className={`px-4 py-3 font-ui text-micro uppercase text-atlas-slate whitespace-nowrap
                                        ${i === 3 ? 'text-right' : 'text-left'}`}
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
    </Page>
  );
}
