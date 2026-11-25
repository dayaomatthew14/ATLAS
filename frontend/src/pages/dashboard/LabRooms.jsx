import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Monitor, CheckCircle2, Clock, AlertTriangle, XCircle, Plus,
  RefreshCw, Calendar, Building2, Users
} from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';
import { Page, PageHeader } from '../../components/ui/Page';
import AtlasButton from '../../components/ui/Button';
import AtlasDialog from '../../components/ui/Dialog';
import { TextInput, SelectInput } from '../../components/ui/Field';
import { focusRing } from '../../components/ui/tokens';
import { getDepartment } from '../../utils/session';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PRIORITY_PROGRAMS = ['BSCS', 'BSCPE', 'CS', 'COE'];

export default function LabRooms() {
  const { addToast } = useToast();
  const [rooms, setRooms] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [curriculumList, setCurriculumList] = useState([]);
  const [facultyList, setFacultyList] = useState([]);
  const [activeSemester, setActiveSemester] = useState(null);

  // Assignment form state
  const [formData, setFormData] = useState({
    room_id: '',
    curriculum_id: '',
    faculty_id: '',
    day_of_week: 'Mon',
    start_time: '08:00',
    end_time: '10:00',
    program_code: 'BSCS',
  });
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const userDept = getDepartment();

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/lab-rooms');
      setRooms(res.rooms || []);
      setSchedules(res.schedules || []);
      setPendingRequests(res.pending_requests || []);
      setActiveSemester(res.active_semester || null);
      if (res.rooms?.length > 0 && !activeRoomId) {
        setActiveRoomId(res.rooms[0].id);
      }
    } catch (err) {
      addToast(err?.response?.data?.detail || 'Failed to load laboratory rooms', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [activeRoomId, addToast]);

  const loadCurriculumAndFaculty = useCallback(async () => {
    try {
      const [currRes, facRes] = await Promise.all([
        api.get('/curriculum'),
        api.get('/professors'),
      ]);
      setCurriculumList(Array.isArray(currRes) ? currRes : currRes?.items || []);
      setFacultyList(Array.isArray(facRes) ? facRes : facRes?.items || []);
    } catch {
      // Non-blocking
    }
  }, []);

  useEffect(() => {
    loadData();
    loadCurriculumAndFaculty();
  }, [loadData, loadCurriculumAndFaculty]);

  const activeRoom = useMemo(() => {
    return rooms.find((r) => r.id === activeRoomId) || rooms[0] || null;
  }, [rooms, activeRoomId]);

  const activeRoomSchedules = useMemo(() => {
    if (!activeRoom) return [];
    return schedules.filter((s) => s.room_id === activeRoom.id);
  }, [schedules, activeRoom]);

  // Check priority for selected program code in modal
  const isSelectedProgramPriority = useMemo(() => {
    return PRIORITY_PROGRAMS.includes(String(formData.program_code || '').toUpperCase());
  }, [formData.program_code]);

  // Handle Approve
  const handleApprove = async (scheduleId) => {
    try {
      await api.post(`/lab-rooms/${scheduleId}/approve`);
      addToast('Room booking approved successfully', 'success');
      loadData();
    } catch (err) {
      addToast(err?.response?.data?.detail || 'Failed to approve room booking', 'error');
    }
  };

  // Handle Reject
  const handleReject = async (scheduleId) => {
    try {
      await api.post(`/lab-rooms/${scheduleId}/reject`, { reason: 'Declined by CS/COE Chair' });
      addToast('Room request declined and room released', 'info');
      loadData();
    } catch (err) {
      addToast(err?.response?.data?.detail || 'Failed to decline room booking', 'error');
    }
  };

  // Open assign modal
  const handleOpenAssignModal = () => {
    setFormData({
      room_id: activeRoom ? String(activeRoom.id) : '',
      curriculum_id: curriculumList[0]?.id ? String(curriculumList[0].id) : '',
      faculty_id: facultyList[0]?.id ? String(facultyList[0].id) : '',
      day_of_week: 'Mon',
      start_time: '08:00',
      end_time: '10:00',
      program_code: 'BSCS',
    });
    setFormErrors({});
    setIsAssignModalOpen(true);
  };

  // Submit assignment
  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!formData.room_id) errors.room_id = 'Please select a computer laboratory room.';
    if (!formData.curriculum_id) errors.curriculum_id = 'Please select a subject.';
    if (!formData.start_time) errors.start_time = 'Please select a start time.';
    if (!formData.end_time) errors.end_time = 'Please select an end time.';
    if (formData.start_time && formData.end_time && formData.end_time <= formData.start_time) {
      errors.end_time = 'End time must be after start time.';
    }
    if (formData.end_time > '17:30') {
      errors.end_time = 'The 5:30 PM – 7:30 PM slot is restricted to CVMAS. Classes must end by 5:30 PM (17:30).';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        room_id: Number(formData.room_id),
        curriculum_id: Number(formData.curriculum_id),
        faculty_id: formData.faculty_id ? Number(formData.faculty_id) : null,
        day_of_week: formData.day_of_week,
        start_time: formData.start_time,
        end_time: formData.end_time,
        program_code: formData.program_code,
        semester_id: activeSemester?.id,
      };
      const res = await api.post('/lab-rooms/assign', payload);
      addToast(res.message || 'Room assigned successfully', 'success');
      setIsAssignModalOpen(false);
      loadData();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (detail && detail.includes('overlap')) {
        setFormErrors({ end_time: detail });
      }
      addToast(detail || 'Failed to assign laboratory room', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Page>
      <PageHeader
        title="CAST Laboratory Rooms"
        subtitle="Manage and schedule Computer Laboratory rooms (Room 608, Room 609, Cyberneta)."
        actions={
          <div className="flex items-center gap-2">
            <AtlasButton
              variant="secondary"
              icon={RefreshCw}
              onClick={loadData}
              disabled={isLoading}
            >
              Refresh
            </AtlasButton>
            <AtlasButton
              variant="primary"
              icon={Plus}
              onClick={handleOpenAssignModal}
            >
              Assign Laboratory Room
            </AtlasButton>
          </div>
        }
      />

      {/* Priority Policy Banner */}
      <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-900 text-white shadow-sm border border-emerald-700/40 font-ui flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-800/80 border border-emerald-400/30 flex items-center justify-center shrink-0 text-amber-300">
            <Monitor className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-bold text-sm tracking-tight flex items-center gap-2">
              CAST Computer Laboratory Priority Policy
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-400 text-slate-950">
                Priority Rules Active
              </span>
            </h3>
            <p className="text-xs text-emerald-100/90 mt-1 leading-relaxed max-w-3xl">
              <strong>BSCS</strong> and <strong>BSCPE (COE)</strong> Program Chairs have primary priority when assigning Computer Laboratory Rooms. Assignments from other CAST programs (e.g. Psychology) are flagged for approval by the CS/COE Program Chair before becoming confirmed.
            </p>
          </div>
        </div>
        <div className="text-right shrink-0 flex items-center gap-2 self-start sm:self-center">
          <span className="text-xs px-2.5 py-1 rounded-md bg-white/10 border border-white/20 text-emerald-200 font-data">
            Dept: {userDept || 'CAST'}
          </span>
        </div>
      </div>

      {/* Pending Approvals Section for CS/COE Chairs */}
      {pendingRequests.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50/80 p-4 shadow-xs font-ui">
          <div className="flex items-center justify-between gap-3 mb-3 pb-2 border-b border-amber-200">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-700 shrink-0" aria-hidden="true" />
              <h4 className="font-bold text-sm text-amber-950">
                Pending Room Requests Requiring Approval ({pendingRequests.length})
              </h4>
            </div>
            <span className="text-xs font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
              CS/COE Priority Review
            </span>
          </div>

          <div className="space-y-2">
            {pendingRequests.map((req) => (
              <div
                key={req.id}
                className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-white border border-amber-200/80 shadow-2xs"
              >
                <div className="min-w-0 flex items-center gap-3">
                  <span className="px-2 py-1 rounded bg-amber-100 text-amber-900 font-data font-bold text-xs shrink-0">
                    {req.room_name}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">{req.subject_code}</span>
                      <span className="text-xs text-slate-500 truncate max-w-xs">{req.subject_name}</span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold">
                        {req.program_code || 'CAST'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 font-data mt-0.5">
                      {req.day_of_week} · {req.start_time} – {req.end_time} · Faculty: {req.faculty_name}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <AtlasButton
                    size="row"
                    variant="primary"
                    icon={CheckCircle2}
                    onClick={() => handleApprove(req.id)}
                  >
                    Approve
                  </AtlasButton>
                  <AtlasButton
                    size="row"
                    variant="destructive"
                    icon={XCircle}
                    onClick={() => handleReject(req.id)}
                  >
                    Reject
                  </AtlasButton>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Room Tabs */}
      <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-emerald-900/15 pb-2">
        {rooms.map((room) => {
          const isActive = room.id === activeRoom?.id;
          const roomSchedCount = schedules.filter((s) => s.room_id === room.id).length;
          return (
            <button
              key={room.id}
              type="button"
              onClick={() => setActiveRoomId(room.id)}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-t-xl font-ui text-sm font-bold transition-all ${focusRing} ${
                isActive
                  ? 'bg-emerald-800 text-white shadow-xs border-b-2 border-amber-400'
                  : 'bg-white/60 text-atlas-slate hover:bg-white hover:text-atlas-ink border border-transparent'
              }`}
            >
              <Monitor className={`w-4 h-4 ${isActive ? 'text-amber-300' : 'text-slate-400'}`} aria-hidden="true" />
              <span>{room.name}</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10.5px] font-data font-bold ${
                isActive ? 'bg-emerald-900/90 text-emerald-200' : 'bg-slate-100 text-slate-600'
              }`}>
                {roomSchedCount}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active Room Metadata & Overview */}
      {activeRoom && (
        <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-white border border-emerald-900/10 shadow-xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs uppercase text-atlas-slate font-bold font-ui">Laboratory Space</p>
              <h4 className="text-base font-bold text-slate-900 font-ui">{activeRoom.name}</h4>
              <p className="text-xs text-slate-500 font-data">{activeRoom.building || 'Main Building'}</p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white border border-emerald-900/10 shadow-xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs uppercase text-atlas-slate font-bold font-ui">Student Capacity</p>
              <h4 className="text-base font-bold text-slate-900 font-ui">{activeRoom.capacity} Workstations</h4>
              <p className="text-xs text-slate-500 font-data">Computer Laboratory</p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white border border-emerald-900/10 shadow-xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs uppercase text-atlas-slate font-bold font-ui">Current Occupancy</p>
              <h4 className="text-base font-bold text-slate-900 font-ui">{activeRoomSchedules.length} Scheduled Classes</h4>
              <p className="text-xs text-slate-500 font-data">Active Term Timetable</p>
            </div>
          </div>
        </div>
      )}

      {/* Mon-Sat Timetable Matrix for Selected Room */}
      <div className="rounded-xl border border-emerald-900/15 bg-white shadow-xs overflow-hidden">
        <div className="p-3.5 bg-emerald-950 text-white font-ui font-bold text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-300" aria-hidden="true" />
            <span>Weekly Laboratory Timetable: {activeRoom?.name}</span>
          </div>
          <span className="text-xs font-normal text-emerald-200">
            Time Span: 07:30 – 17:30 (Monday to Saturday)
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-6 divide-y md:divide-y-0 md:divide-x divide-emerald-900/10">
          {DAYS.map((day) => {
            const daySchedules = activeRoomSchedules.filter((s) => s.day_of_week === day);
            daySchedules.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

            return (
              <div key={day} className="flex flex-col min-h-[320px]">
                <div className="p-2.5 bg-emerald-50/70 border-b border-emerald-900/10 text-center font-ui font-bold text-xs uppercase tracking-wider text-emerald-950">
                  {day}
                  <span className="block text-[10px] font-normal text-slate-500">
                    {daySchedules.length} {daySchedules.length === 1 ? 'class' : 'classes'}
                  </span>
                </div>

                <div className="p-2 flex-1 space-y-2 bg-slate-50/30">
                  {daySchedules.length === 0 ? (
                    <div className="h-full flex items-center justify-center py-8 text-center text-xs text-slate-400 font-ui italic">
                      Free / Available
                    </div>
                  ) : (
                    daySchedules.map((s) => {
                      const isPending = s.room_approval_status === 'pending_approval';
                      const isPriority = PRIORITY_PROGRAMS.includes(String(s.program_code || '').toUpperCase());

                      return (
                        <div
                          key={s.id}
                          className={`p-2.5 rounded-lg border text-left shadow-2xs font-ui transition-all ${
                            isPending
                              ? 'bg-amber-50/90 border-dashed border-amber-300 text-amber-950'
                              : 'bg-white border-emerald-700/30 text-slate-900'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="font-bold text-xs text-emerald-900">{s.subject_code}</span>
                            <span className={`px-1.5 py-0.2 rounded text-[9.5px] font-bold ${
                              isPending
                                ? 'bg-amber-200 text-amber-900'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {isPending ? 'Pending' : (isPriority ? 'CS/COE Priority' : 'Confirmed')}
                            </span>
                          </div>

                          <p className="text-[11px] text-slate-600 line-clamp-1">{s.subject_name}</p>

                          <div className="mt-1.5 pt-1.5 border-t border-slate-200/60 flex items-center justify-between text-[10.5px] font-data text-slate-600">
                            <span>{s.start_time} – {s.end_time}</span>
                            <span className="font-semibold text-slate-800 truncate max-w-[80px]" title={s.faculty_name}>
                              {s.faculty_name}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Assign Room Dialog */}
      <AtlasDialog
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        icon={Monitor}
        title="Assign Computer Laboratory Room"
        description="Select a Computer Laboratory room and assign it to a scheduled subject."
        size="entity"
        footer={
          <div className="flex items-center justify-end gap-2">
            <AtlasButton
              variant="ghost"
              onClick={() => setIsAssignModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </AtlasButton>
            <AtlasButton
              variant="primary"
              onClick={handleAssignSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Confirm Assignment'}
            </AtlasButton>
          </div>
        }
      >
        <form onSubmit={handleAssignSubmit} className="space-y-4 font-ui">
          {/* Priority Notice Banner */}
          <div className={`p-3 rounded-lg text-xs leading-relaxed border ${
            isSelectedProgramPriority
              ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
              : 'bg-amber-50 border-amber-300 text-amber-950'
          }`}>
            {isSelectedProgramPriority ? (
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  <strong>Priority Assignment (CS / COE):</strong> Because this assignment belongs to {formData.program_code}, it receives primary priority and will be confirmed immediately without waiting for approval.
                </span>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  <strong>Approval Required ({formData.program_code}):</strong> Assignments for other CAST programs are flagged as <em>Pending Approval</em> and must be approved by the CS/COE Program Chair before they are treated as confirmed.
                </span>
              </div>
            )}
          </div>

          <SelectInput
            label="Computer Laboratory Room"
            required
            error={formErrors.room_id}
            value={formData.room_id}
            onChange={(e) => setFormData((prev) => ({ ...prev, room_id: e.target.value }))}
          >
            <option value="">Select Laboratory Room</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.capacity} seats, {r.building})
              </option>
            ))}
          </SelectInput>

          <SelectInput
            label="Program / Degree"
            required
            value={formData.program_code}
            onChange={(e) => setFormData((prev) => ({ ...prev, program_code: e.target.value }))}
          >
            <option value="BSCS">BS Computer Science (BSCS) – Priority</option>
            <option value="BSCPE">BS Computer Engineering (BSCPE) – Priority</option>
            <option value="ABPSY">BA Psychology (ABPSY) – Requires Approval</option>
          </SelectInput>

          <SelectInput
            label="Subject / Curriculum"
            required
            error={formErrors.curriculum_id}
            value={formData.curriculum_id}
            onChange={(e) => setFormData((prev) => ({ ...prev, curriculum_id: e.target.value }))}
          >
            <option value="">Select Subject</option>
            {curriculumList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} – {c.name} ({c.units} units)
              </option>
            ))}
          </SelectInput>

          <SelectInput
            label="Assigned Faculty"
            value={formData.faculty_id}
            onChange={(e) => setFormData((prev) => ({ ...prev, faculty_id: e.target.value }))}
          >
            <option value="">Select Professor (or unassigned)</option>
            {facultyList.map((f) => (
              <option key={f.id} value={f.id}>
                {f.first_name} {f.last_name} ({f.type})
              </option>
            ))}
          </SelectInput>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SelectInput
              label="Day of Week"
              required
              value={formData.day_of_week}
              onChange={(e) => setFormData((prev) => ({ ...prev, day_of_week: e.target.value }))}
            >
              {DAYS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </SelectInput>

            <TextInput
              label="Start Time"
              type="time"
              required
              value={formData.start_time}
              onChange={(e) => setFormData((prev) => ({ ...prev, start_time: e.target.value }))}
              error={formErrors.start_time}
            />

            <TextInput
              label="End Time"
              type="time"
              required
              value={formData.end_time}
              onChange={(e) => setFormData((prev) => ({ ...prev, end_time: e.target.value }))}
              error={formErrors.end_time}
            />
          </div>
        </form>
      </AtlasDialog>
    </Page>
  );
}
