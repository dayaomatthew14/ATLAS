import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Users, 
  BookOpen, 
  MapPin, 
  AlertTriangle, 
  TrendingUp, 
  Clock, 
  ChevronRight,
  ChevronDown,
  Plus,
  Zap,
  ShieldCheck,
  Activity,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  FileText,
  Sliders,
  Trash2,
  ArrowRight,
  Check
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import Modal from '../../components/Modal';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';

const formatSemesterTerm = (term) => {
  if (!term) return '';
  if (term === '1st') return '1st Semester';
  if (term === '2nd') return '2nd Semester';
  if (term === '3rd semester') return '3rd Semester';
  return term;
};

export default function DashboardHome() {
  const { addToast } = useToast();
  const navigate = useNavigate();

  const userRole = (localStorage.getItem('atlas_role') || '').toLowerCase().trim();
  const isAdmin = userRole === 'admin';
  const roleDisplay = userRole === 'coordinator' ? 'Coordinator' : (isAdmin ? 'System Administrator' : 'Program Chair');
  const departmentName = localStorage.getItem('atlas_department') || 'DLSAU Academic Department';
  const userName = localStorage.getItem('atlas_user_name') || roleDisplay;

  // Data states
  const [activeSemester, setActiveSemester] = useState(null);
  const [allSemesters, setAllSemesters] = useState([]);
  const [schedulesList, setSchedulesList] = useState([]);
  const [facultyList, setFacultyList] = useState([]);
  const [roomsList, setRoomsList] = useState([]);
  const [curriculumList, setCurriculumList] = useState([]);
  const [offeringsList, setOfferingsList] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [conflictsCount, setConflictsCount] = useState(0);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isSemesterModalOpen, setIsSemesterModalOpen] = useState(false);
  const [newSemesterData, setNewSemesterData] = useState({ academic_year: '', term: '1st Semester' });

  const fetchStats = async () => {
    try {
      const [schedules, semesters, faculty, conflictsRes, logsData, rooms, curriculum] = await Promise.all([
        api.get('/schedules').catch(() => []),
        api.get('/semesters').catch(() => []),
        api.get('/professors').catch(() => []),
        api.get('/conflicts/count').catch(() => ({ count: 0 })),
        api.get('/logs?limit=8').catch(() => []),
        api.get('/rooms').catch(() => []),
        api.get('/curriculum').catch(() => [])
      ]);

      const safeSemesters = Array.isArray(semesters) ? semesters : [];
      const safeSchedules = Array.isArray(schedules) ? schedules : [];
      const safeFaculty = Array.isArray(faculty) ? faculty : [];
      const safeRooms = Array.isArray(rooms) ? rooms : [];
      const safeLogs = Array.isArray(logsData) ? logsData : [];
      const safeCurriculum = Array.isArray(curriculum) ? curriculum : [];

      setAllSemesters(safeSemesters);
      const activeSem = safeSemesters.find(s => s.is_active);
      setActiveSemester(activeSem || null);

      setSchedulesList(safeSchedules);
      setFacultyList(safeFaculty);
      setRoomsList(safeRooms);
      setCurriculumList(safeCurriculum);
      setRecentLogs(safeLogs);
      setConflictsCount(conflictsRes?.count || 0);

      // Fetch subject offerings if active semester exists
      if (activeSem) {
        try {
          const offerings = await api.get(`/subject-offerings?semester_id=${activeSem.id}`);
          setOfferingsList(Array.isArray(offerings) ? offerings : []);
        } catch {
          setOfferingsList([]);
        }
      }
    } catch (e) {
      console.error('Failed to fetch dashboard data', e);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      if (e.altKey) {
        switch (e.key.toLowerCase()) {
          case 's':
            e.preventDefault();
            navigate('/dashboard/schedules');
            break;
          case 't':
            e.preventDefault();
            navigate('/dashboard/teachers');
            break;
          case 'r':
            e.preventDefault();
            navigate('/dashboard/rooms');
            break;
          case 'c':
            e.preventDefault();
            navigate('/dashboard/curriculum');
            break;
          case 'p':
            e.preventDefault();
            navigate('/dashboard/profile');
            break;
          case 'e':
            e.preventDefault();
            if (isAdmin) setIsSemesterModalOpen(true);
            break;
          default:
            break;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, isAdmin]);

  // Derived Metrics
  const totalFaculty = facultyList.length;
  const facultyWithMaxUnits = facultyList.filter(f => f.max_units && f.max_units > 0).length;
  const facultyMissingAvail = totalFaculty - facultyWithMaxUnits;

  const totalRooms = roomsList.length;
  const lectureRooms = roomsList.filter(r => (r.type || '').toLowerCase().includes('lecture') || r.type === 'lecture').length;
  const labRooms = roomsList.filter(r => (r.type || '').toLowerCase().includes('lab')).length;

  const totalCurriculum = curriculumList.length;
  const totalOfferings = offeringsList.length;
  const unassignedOfferings = offeringsList.filter(o => !o.faculty_id).length;

  const totalSchedules = schedulesList.length;
  const scheduledRoomsCount = new Set(schedulesList.filter(s => s.room_id).map(s => s.room_id)).size;
  const roomUtilization = totalRooms > 0 ? Math.round((scheduledRoomsCount / totalRooms) * 100) : 0;

  // 6-Step Readiness Tracker Logic
  const steps = [
    {
      id: 1,
      title: 'Active Semester Setup',
      desc: activeSemester ? `${activeSemester.academic_year} ${formatSemesterTerm(activeSemester.term)}` : 'No active term configured',
      isComplete: !!activeSemester,
      path: '/dashboard/semesters'
    },
    {
      id: 2,
      title: 'Campus Room Setup',
      desc: totalRooms > 0 ? `${totalRooms} rooms (${lectureRooms} Lec, ${labRooms} Lab)` : 'No rooms registered',
      isComplete: totalRooms > 0,
      path: '/dashboard/rooms'
    },
    {
      id: 3,
      title: 'Faculty & Workload Limits',
      desc: totalFaculty > 0 ? `${totalFaculty} faculty (${facultyMissingAvail} unconfigured)` : 'No faculty records',
      isComplete: totalFaculty > 0 && facultyMissingAvail === 0,
      path: '/dashboard/teachers'
    },
    {
      id: 4,
      title: 'Subject Offerings',
      desc: totalOfferings > 0 ? `${totalOfferings} subjects offered (${unassignedOfferings} unassigned)` : 'No active offerings',
      isComplete: totalOfferings > 0 && unassignedOfferings === 0,
      path: '/dashboard/curriculum'
    },
    {
      id: 5,
      title: 'AI Timetable Generation',
      desc: totalSchedules > 0 ? `${totalSchedules} schedule entries generated` : 'Timetable pending generation',
      isComplete: totalSchedules > 0,
      path: '/dashboard/schedules'
    },
    {
      id: 6,
      title: 'Conflict Review & Finalize',
      desc: conflictsCount === 0 && totalSchedules > 0 ? 'Zero conflicts detected • Ready to publish' : `${conflictsCount} active conflict(s)`,
      isComplete: conflictsCount === 0 && totalSchedules > 0,
      path: '/dashboard/schedules'
    }
  ];

  const completedStepsCount = steps.filter(s => s.isComplete).length;
  const readinessPercentage = Math.round((completedStepsCount / steps.length) * 100);

  // Needs Attention items
  const attentionItems = [];
  if (!activeSemester) {
    attentionItems.push({
      id: 'no-semester',
      title: 'No Active Academic Period',
      desc: 'Contact System Administrator to activate the academic term before scheduling.',
      severity: 'high',
      actionText: 'View Terms',
      path: '/dashboard/semesters'
    });
  }
  if (facultyMissingAvail > 0) {
    attentionItems.push({
      id: 'faculty-avail',
      title: `${facultyMissingAvail} Faculty Missing Workload Limits`,
      desc: 'Set max workload unit limits to ensure optimal AI schedule distribution.',
      severity: 'medium',
      actionText: 'Configure Faculty',
      path: '/dashboard/teachers'
    });
  }
  if (unassignedOfferings > 0) {
    attentionItems.push({
      id: 'unassigned-offerings',
      title: `${unassignedOfferings} Subject Offering(s) Unassigned`,
      desc: 'Assign faculty instructors to offered subjects to prepare for timetable generation.',
      severity: 'high',
      actionText: 'Assign Instructors',
      path: '/dashboard/curriculum'
    });
  }
  if (conflictsCount > 0) {
    attentionItems.push({
      id: 'active-conflicts',
      title: `${conflictsCount} Schedule Conflict(s) Detected`,
      desc: 'Overlapping room usage or professor time slot conflicts require resolution.',
      severity: 'high',
      actionText: 'Resolve Conflicts',
      path: '/dashboard/schedules'
    });
  }
  if (totalRooms === 0) {
    attentionItems.push({
      id: 'no-rooms',
      title: 'No Campus Rooms Registered',
      desc: 'Register lecture halls and laboratories in the database before generating schedules.',
      severity: 'high',
      actionText: 'Add Rooms',
      path: '/dashboard/rooms'
    });
  }

  // Admin Semester Management Modal handlers
  const handleSetActiveSemester = async (id) => {
    setIsProcessing(true);
    try {
      await api.put(`/semesters/${id}`, { is_active: true });
      addToast('Active semester updated', 'success');
      fetchStats();
      setIsSemesterModalOpen(false);
    } catch (e) {
      addToast('Failed to update active semester', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteSemester = async (id) => {
    if (!window.confirm('Are you sure you want to delete this semester? Associated records may be affected.')) return;
    setIsProcessing(true);
    try {
      await api.delete(`/semesters/${id}`);
      addToast('Semester deleted successfully', 'success');
      fetchStats();
    } catch (e) {
      addToast(e.response?.data?.detail || 'Failed to delete semester', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateSemester = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      await api.post('/semesters', { ...newSemesterData, is_active: true });
      addToast('New semester created and set to active', 'success');
      setNewSemesterData({ academic_year: '', term: '1st Semester' });
      fetchStats();
      setIsSemesterModalOpen(false);
    } catch (e) {
      addToast(e.response?.data?.detail || 'Failed to create semester', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleQuickAction = async (action) => {
    setIsProcessing(true);
    try {
      if (action === 'pdf') {
        window.open(`${api.defaults.baseURL}/schedules/export/pdf?semester_id=1`, '_blank');
        addToast('Generating official PDF schedule...', 'success');
      } else if (action === 'resolve') {
        await api.post('/ai-scheduler/resolve-conflicts', []);
        addToast('AI conflict resolution executed successfully', 'success');
        fetchStats();
      } else if (action === 'notify') {
        if (activeSemester) {
          await api.post(`/notifications/notify-faculty?semester_id=${activeSemester.id}`);
          addToast('Faculty schedule notifications dispatched!', 'success');
        } else {
          addToast('No active semester found', 'error');
        }
      }
    } catch (e) {
      addToast('Action failed: Backend service unavailable', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-full bg-[#f1f5f9] p-6 lg:p-10 space-y-10 font-sans text-slate-800 relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-green-200/40 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-yellow-100/30 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="relative z-10 space-y-10">
        
        {/* 1. ACTIVE ACADEMIC CONTEXT HEADER CARD */}
        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-emerald-600 via-green-500 to-emerald-700 rounded-[2.8rem] blur opacity-25 group-hover:opacity-40 transition duration-1000"></div>
          <div className="relative bg-gradient-to-br from-emerald-950 via-green-900 to-emerald-950 backdrop-blur-2xl border border-white/20 rounded-[2.5rem] p-8 sm:p-10 flex flex-col lg:flex-row items-center justify-between overflow-hidden shadow-2xl text-white gap-8">
            <div className="relative z-10 max-w-2xl text-center lg:text-left space-y-4">
              
              {/* Context Badges */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2.5">
                <div className="inline-flex items-center space-x-2 bg-amber-400/20 text-amber-300 border border-amber-400/30 px-3.5 py-1 rounded-full text-[10px] font-black tracking-[0.2em] uppercase backdrop-blur-md">
                  <Zap className="w-3 h-3 text-amber-400 animate-pulse" />
                  <span>ATLAS Timetabling Command Center</span>
                </div>
                <div className="inline-flex items-center space-x-1.5 bg-white/10 text-green-100 border border-white/15 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase backdrop-blur-md">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  <span>{roleDisplay}</span>
                </div>
              </div>

              {/* Department & Portal Title */}
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white leading-tight">
                {departmentName} <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-amber-200">Portal</span>
              </h1>

              {/* Active Semester Context Pill */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 pt-1">
                <div className="flex items-center bg-white/10 border border-white/15 px-4 py-2 rounded-2xl space-x-3">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <div className="text-left">
                    <p className="text-[10px] font-black text-amber-300 uppercase tracking-widest leading-none">Active Academic Period</p>
                    <p className="text-sm font-black text-white mt-1">
                      {activeSemester ? `${activeSemester.academic_year} ${formatSemesterTerm(activeSemester.term)}` : 'No Active Semester'}
                    </p>
                  </div>
                  {activeSemester && (
                    <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2.5 py-0.5 rounded-md text-[9px] font-black tracking-widest uppercase">
                      ACTIVE
                    </span>
                  )}
                </div>

                <div className="flex items-center bg-white/10 border border-white/15 px-4 py-2 rounded-2xl space-x-3">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <div className="text-left">
                    <p className="text-[10px] font-black text-emerald-300 uppercase tracking-widest leading-none">Department Readiness</p>
                    <p className="text-sm font-black text-white mt-1">
                      {readinessPercentage}% Complete
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Action Navigation Buttons */}
            <div className="relative z-10 flex flex-col sm:flex-row lg:flex-col gap-3.5 w-full lg:w-auto shrink-0">
              <Link 
                to="/dashboard/schedules" 
                className="px-7 py-4 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-slate-950 rounded-2xl text-xs font-black transition-all transform hover:scale-105 shadow-xl shadow-amber-500/20 flex items-center justify-center uppercase tracking-widest"
              >
                <span>Launch Timetable</span>
                <ChevronRight className="w-4 h-4 ml-2" />
              </Link>
              {isAdmin && (
                <button
                  onClick={() => setIsSemesterModalOpen(true)}
                  className="px-7 py-3.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-2xl text-xs font-black transition-all flex items-center justify-center uppercase tracking-widest backdrop-blur-md"
                >
                  <Calendar className="w-4 h-4 mr-2 text-amber-300" />
                  <span>Manage Academic Terms</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 2. ENRICHED SYSTEM OVERVIEW CARDS (4 Grid Panes) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          
          {/* Faculty Card */}
          <div className="bg-white/85 backdrop-blur-xl border border-white/80 p-7 rounded-[2.2rem] shadow-xl hover:shadow-2xl hover:border-emerald-200 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-5">
                <div className="p-3.5 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-100">
                  <Users className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-black text-emerald-800 bg-emerald-100/80 px-2.5 py-1 rounded-full border border-emerald-200 uppercase tracking-wider">
                  Roster Status
                </span>
              </div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Faculty Members</p>
              <h3 className="text-4xl font-black text-emerald-950 tracking-tight">{totalFaculty}</h3>
            </div>
            <div className="mt-5 pt-4 border-t border-slate-100 flex justify-between text-xs font-bold text-slate-500">
              <span>Active Load: <strong className="text-slate-800">{facultyWithMaxUnits}</strong></span>
              <span className={facultyMissingAvail > 0 ? 'text-amber-600 font-black' : 'text-slate-500'}>
                Unconfigured: <strong className={facultyMissingAvail > 0 ? 'text-amber-600' : 'text-slate-800'}>{facultyMissingAvail}</strong>
              </span>
            </div>
          </div>

          {/* Campus Rooms Card */}
          <div className="bg-white/85 backdrop-blur-xl border border-white/80 p-7 rounded-[2.2rem] shadow-xl hover:shadow-2xl hover:border-emerald-200 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-5">
                <div className="p-3.5 rounded-2xl bg-cyan-50 text-cyan-700 border border-cyan-100">
                  <MapPin className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-black text-cyan-800 bg-cyan-100/80 px-2.5 py-1 rounded-full border border-cyan-200 uppercase tracking-wider">
                  {roomUtilization}% In Use
                </span>
              </div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Campus Rooms</p>
              <h3 className="text-4xl font-black text-emerald-950 tracking-tight">{totalRooms}</h3>
            </div>
            <div className="mt-5 pt-4 border-t border-slate-100 flex justify-between text-xs font-bold text-slate-500">
              <span>Lecture: <strong className="text-slate-800">{lectureRooms}</strong></span>
              <span>Laboratories: <strong className="text-slate-800">{labRooms}</strong></span>
            </div>
          </div>

          {/* Subject Offerings Card */}
          <div className="bg-white/85 backdrop-blur-xl border border-white/80 p-7 rounded-[2.2rem] shadow-xl hover:shadow-2xl hover:border-emerald-200 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-5">
                <div className="p-3.5 rounded-2xl bg-amber-50 text-amber-700 border border-amber-100">
                  <BookOpen className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-black text-amber-800 bg-amber-100/80 px-2.5 py-1 rounded-full border border-amber-200 uppercase tracking-wider">
                  Term Courses
                </span>
              </div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Offered Subjects</p>
              <h3 className="text-4xl font-black text-emerald-950 tracking-tight">{totalOfferings}</h3>
            </div>
            <div className="mt-5 pt-4 border-t border-slate-100 flex justify-between text-xs font-bold text-slate-500">
              <span>Curriculum Total: <strong className="text-slate-800">{totalCurriculum}</strong></span>
              <span className={unassignedOfferings > 0 ? 'text-amber-600 font-black' : 'text-slate-500'}>
                Unassigned: <strong className={unassignedOfferings > 0 ? 'text-amber-600' : 'text-slate-800'}>{unassignedOfferings}</strong>
              </span>
            </div>
          </div>

          {/* Schedules & Conflicts Card */}
          <div className="bg-white/85 backdrop-blur-xl border border-white/80 p-7 rounded-[2.2rem] shadow-xl hover:shadow-2xl hover:border-emerald-200 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-5">
                <div className={`p-3.5 rounded-2xl border ${conflictsCount > 0 ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border uppercase tracking-wider ${
                  conflictsCount > 0 ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                }`}>
                  {conflictsCount > 0 ? 'CRITICAL' : 'CLEAN'}
                </span>
              </div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Generated Timetables</p>
              <h3 className="text-4xl font-black text-emerald-950 tracking-tight">{totalSchedules}</h3>
            </div>
            <div className="mt-5 pt-4 border-t border-slate-100 flex justify-between text-xs font-bold text-slate-500">
              <span>Active Conflicts: <strong className={conflictsCount > 0 ? 'text-rose-600 font-black' : 'text-emerald-700'}>{conflictsCount}</strong></span>
              <span>Draft Status: <strong className="text-slate-800">Active</strong></span>
            </div>
          </div>
        </div>

        {/* 3. SCHEDULING READINESS TRACKER (WORKFLOW PROGRESS) */}
        <div className="bg-white/85 backdrop-blur-xl border border-white/80 rounded-[2.5rem] p-8 sm:p-10 shadow-xl space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6">
            <div>
              <div className="flex items-center space-x-3 mb-1">
                <div className="bg-emerald-100 p-2 rounded-xl text-emerald-800">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <h3 className="text-2xl font-black text-emerald-950 tracking-tight">Department Timetabling Readiness</h3>
              </div>
              <p className="text-xs text-slate-500 font-bold">Follow the step-by-step preparation workflow before schedule finalization</p>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <span className="text-xs font-black text-slate-400 uppercase tracking-wider block">Completion Rate</span>
                <span className="text-2xl font-black text-emerald-800">{readinessPercentage}%</span>
              </div>
              <div className="w-32 bg-slate-100 h-3 rounded-full overflow-hidden p-0.5 border border-slate-200">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-500 to-green-600 rounded-full transition-all duration-700"
                  style={{ width: `${readinessPercentage}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* 6 Workflow Step Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {steps.map(step => (
              <div 
                key={step.id} 
                className={`p-5 rounded-2xl border transition-all flex flex-col justify-between ${
                  step.isComplete ? 'bg-emerald-50/60 border-emerald-200/80' : 'bg-slate-50/80 border-slate-200/80'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Step 0{step.id}</span>
                    {step.isComplete ? (
                      <span className="inline-flex items-center text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full border border-emerald-200">
                        <Check className="w-3 h-3 mr-1 text-emerald-600" /> Complete
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-[10px] font-black uppercase tracking-wider text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full border border-amber-200">
                        <Clock className="w-3 h-3 mr-1 text-amber-600" /> Pending
                      </span>
                    )}
                  </div>
                  <h4 className="font-black text-base text-slate-900 mb-1">{step.title}</h4>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">{step.desc}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200/50 flex justify-end">
                  <Link 
                    to={step.path} 
                    className="inline-flex items-center text-xs font-black text-emerald-800 hover:text-emerald-950 transition-colors uppercase tracking-wider"
                  >
                    <span>Configure</span>
                    <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 4. NEEDS ATTENTION NOTIFICATION SECTION */}
        {attentionItems.length > 0 && (
          <div className="bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-rose-500/10 border border-amber-200/80 rounded-[2.5rem] p-8 sm:p-10 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-amber-200/60 pb-5">
              <div className="flex items-center space-x-3">
                <div className="bg-amber-100 p-2.5 rounded-2xl text-amber-800 shadow-xs">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Needs Attention ({attentionItems.length})</h3>
                  <p className="text-xs font-bold text-slate-500">Actionable items requiring configuration before timetable publishing</p>
                </div>
              </div>
              <span className="bg-amber-200/70 text-amber-900 text-xs font-black px-3.5 py-1.5 rounded-full uppercase tracking-wider">
                Action Required
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {attentionItems.map(item => (
                <div key={item.id} className="bg-white/90 backdrop-blur-sm border border-slate-200/90 rounded-2xl p-5 shadow-sm flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <h4 className="font-black text-sm text-slate-900">{item.title}</h4>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed">{item.desc}</p>
                  </div>
                  <Link
                    to={item.path}
                    className="shrink-0 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-xl transition-all shadow-md uppercase tracking-wider flex items-center"
                  >
                    <span>{item.actionText}</span>
                    <ChevronRight className="w-3.5 h-3.5 ml-1" />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 5. BOTTOM SECTION: RECENT ACTIVITY & QUICK ACTIONS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Prioritized Activity Log */}
          <div className="lg:col-span-2 flex flex-col bg-white/85 backdrop-blur-xl border border-white/80 rounded-[2.5rem] p-8 sm:p-10 shadow-xl h-full">
            <div className="flex items-center justify-between mb-8 shrink-0">
              <h3 className="text-2xl font-black flex items-center tracking-tight text-emerald-950">
                <Activity className="w-6 h-6 mr-3 text-emerald-700" />
                Scheduling Audit Trail
              </h3>
              <div className="flex items-center space-x-2 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-800">Live Activity</span>
              </div>
            </div>

            {recentLogs.length > 0 ? (
              <div className="flex-1 space-y-3.5 py-2 overflow-y-auto pr-2">
                {recentLogs.map(log => (
                  <div key={log.id} className="flex items-start space-x-4 p-4 rounded-2xl bg-white/80 backdrop-blur-sm border border-slate-200/80 hover:border-emerald-300 hover:shadow-md transition-all text-left">
                    <div className={`p-2.5 rounded-xl mt-0.5 shrink-0 ${
                      log.status === 'error' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                      log.status === 'warning' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                      'bg-emerald-50 text-emerald-700 border border-emerald-100'
                    }`}>
                      <Activity className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-emerald-950 truncate">{log.action}</p>
                      <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{log.details}</p>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">
                        {new Date(log.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center space-y-6 py-10 text-center">
                <Activity className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-black text-slate-400 uppercase tracking-[0.2em]">No Recent Activity</p>
                <p className="text-xs text-slate-400 font-medium">Everything is up to date.</p>
              </div>
            )}
          </div>

          {/* Workflow Quick Actions Panel */}
          <div className="space-y-8">
            <div className="bg-gradient-to-br from-emerald-950 via-green-900 to-emerald-950 rounded-[2.5rem] p-8 sm:p-10 shadow-2xl border border-white/20 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:rotate-45 transition-transform duration-700 text-white">
                <Zap className="w-32 h-32" />
              </div>
              <div className="relative z-10">
                <h3 className="text-3xl font-black mb-3 tracking-tight text-white">Quick Workflows</h3>
                <p className="text-amber-300 text-xs font-black mb-8 uppercase tracking-widest leading-relaxed">
                  Timetabling Command Shortcuts
                </p>
                <div className="space-y-3">
                  <Link
                    to="/dashboard/schedules"
                    className="flex items-center justify-between w-full p-4.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-slate-950 rounded-2xl transition-all font-black text-xs uppercase tracking-widest shadow-lg"
                  >
                    <div className="flex items-center">
                      <Sparkles className="w-4 h-4 mr-3" />
                      Run Schedule Generator
                    </div>
                    <ChevronRight className="w-4 h-4" />
                  </Link>

                  <Link
                    to="/dashboard/schedules"
                    className="flex items-center justify-between w-full p-4.5 bg-white/10 hover:bg-white text-white hover:text-emerald-950 rounded-2xl transition-all font-black text-xs uppercase tracking-widest border border-white/10 shadow-md"
                  >
                    <div className="flex items-center">
                      <Calendar className="w-4 h-4 mr-3" />
                      View Department Timetable
                    </div>
                    <ChevronRight className="w-4 h-4" />
                  </Link>

                  <button 
                    onClick={() => handleQuickAction('resolve')}
                    disabled={isProcessing}
                    className="flex items-center justify-between w-full p-4.5 bg-white/10 hover:bg-white text-white hover:text-amber-700 rounded-2xl transition-all font-black text-xs uppercase tracking-widest border border-white/10 shadow-md disabled:opacity-50"
                  >
                    <div className="flex items-center">
                      <AlertTriangle className="w-4 h-4 mr-3" />
                      Resolve Conflicts
                    </div>
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  <button 
                    onClick={() => handleQuickAction('pdf')}
                    disabled={isProcessing}
                    className="flex items-center justify-between w-full p-4.5 bg-white/10 hover:bg-white text-white hover:text-blue-600 rounded-2xl transition-all font-black text-xs uppercase tracking-widest border border-white/10 shadow-md disabled:opacity-50"
                  >
                    <div className="flex items-center">
                      <FileText className="w-4 h-4 mr-3" />
                      Export Timetable (PDF)
                    </div>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Diagnostics Panel */}
            <div className="bg-white/80 backdrop-blur-2xl border border-white rounded-[2.5rem] p-8 text-left group shadow-sm flex flex-col justify-between hover:shadow-2xl hover:shadow-green-900/5 transition-all duration-300">
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div className="w-12 h-12 bg-green-500/10 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <Activity className="w-6 h-6 text-green-700 animate-pulse" />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 px-3 py-1.5 rounded-full">
                    System Health
                  </span>
                </div>
                <h4 className="font-black text-xl text-slate-900 leading-none mb-2">Workspace Health</h4>
                <p className="text-[10px] text-slate-400 font-bold mb-6 uppercase tracking-widest leading-relaxed">
                  Real-time timetabling metrics
                </p>

                <div className="space-y-5">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-black text-slate-500 uppercase tracking-wider">Conflict-Free Rate</span>
                      <span className={`text-xs font-black uppercase ${
                        totalSchedules === 0 ? 'text-slate-400' :
                        (totalSchedules - conflictsCount) / totalSchedules >= 0.95 ? 'text-emerald-700' :
                        (totalSchedules - conflictsCount) / totalSchedules >= 0.8 ? 'text-amber-600' : 'text-rose-600'
                      }`}>
                        {totalSchedules > 0 ? Math.round(((totalSchedules - conflictsCount) / totalSchedules) * 100) : 100}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-1000 ${
                          totalSchedules === 0 ? 'bg-slate-300' :
                          (totalSchedules - conflictsCount) / totalSchedules >= 0.95 ? 'bg-emerald-500' :
                          (totalSchedules - conflictsCount) / totalSchedules >= 0.8 ? 'bg-amber-400' : 'bg-rose-500'
                        }`}
                        style={{ width: `${totalSchedules > 0 ? Math.round(((totalSchedules - conflictsCount) / totalSchedules) * 100) : 100}%` }}
                      ></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-black text-slate-500 uppercase tracking-wider">Room Utilization</span>
                      <span className="text-xs font-black text-slate-700">{roomUtilization}%</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-emerald-500 to-green-600 rounded-full transition-all duration-1000"
                        style={{ width: `${roomUtilization}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* Admin Semester Management Modal */}
      {isAdmin && (
        <Modal
          isOpen={isSemesterModalOpen}
          onClose={() => setIsSemesterModalOpen(false)}
          title="Manage Semesters"
        >
          <div className="space-y-8">
            <div>
              <h4 className="text-sm font-black text-slate-700 mb-4 uppercase tracking-wide">Select Active Semester</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                {allSemesters.map(sem => (
                  <div key={sem.id} className={`flex items-center justify-between p-4 rounded-2xl border ${sem.is_active ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-100'}`}>
                    <div>
                      <p className="font-black text-slate-900">{sem.academic_year}</p>
                      <p className="text-xs font-bold text-slate-500">{formatSemesterTerm(sem.term)}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      {!sem.is_active ? (
                        <button
                          onClick={() => handleSetActiveSemester(sem.id)}
                          className="px-4 py-2 bg-white text-green-700 border border-green-200 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-green-50 transition-colors"
                          disabled={isProcessing}
                        >
                          Set Active
                        </button>
                      ) : (
                        <div className="flex items-center text-green-600 bg-green-100 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider">
                          <Zap className="w-3 h-3 mr-1" /> Active
                        </div>
                      )}
                      <button
                        onClick={() => handleDeleteSemester(sem.id)}
                        className="p-2 text-rose-500 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-colors border border-transparent hover:border-rose-100"
                        disabled={isProcessing}
                        title="Delete Semester"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {allSemesters.length === 0 && (
                  <div className="text-center p-4 text-slate-500 font-medium">No semesters found.</div>
                )}
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100">
              <h4 className="text-sm font-black text-slate-700 mb-4 uppercase tracking-wide">Create New Semester</h4>
              <form onSubmit={handleCreateSemester} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Academic Year</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 2026-2027"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all font-bold text-slate-700"
                      value={newSemesterData.academic_year}
                      onChange={(e) => setNewSemesterData({ ...newSemesterData, academic_year: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Term</label>
                    <div className="relative">
                      <select
                        className="w-full px-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all font-bold text-slate-700 appearance-none cursor-pointer"
                        value={newSemesterData.term}
                        onChange={(e) => setNewSemesterData({ ...newSemesterData, term: e.target.value })}
                      >
                        <option value="1st Semester">1st Semester</option>
                        <option value="2nd Semester">2nd Semester</option>
                        <option value="3rd Semester">3rd Semester</option>
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="w-full py-3.5 bg-green-700 text-white rounded-xl text-sm font-black uppercase tracking-widest transition-all hover:bg-green-800 shadow-md disabled:opacity-50"
                >
                  Create & Set Active
                </button>
              </form>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
