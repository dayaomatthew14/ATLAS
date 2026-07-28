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

      if (activeSem) {
        try {
          const offerings = await api.get(`/subject-offerings?semester_id=${activeSem.id}`);
          setOfferingsList(Array.isArray(offerings) ? offerings : []);
        } catch {
          setOfferingsList([]);
        }
      }
    } catch (e) {
      console.error('Failed to fetch dashboard metrics', e);
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

  // Key Counts & Readiness Calculations
  const totalFaculty = facultyList.length;
  const facultyWithMaxUnits = facultyList.filter(f => f.max_units && f.max_units > 0).length;
  const facultyMissingAvail = totalFaculty - facultyWithMaxUnits;

  const totalRooms = roomsList.length;
  const totalOfferings = offeringsList.length;
  const unassignedOfferings = offeringsList.filter(o => !o.faculty_id).length;
  const totalSchedules = schedulesList.length;

  // Visual Readiness Checklist
  const readinessItems = [
    { label: 'Semester', ready: !!activeSemester, value: activeSemester ? `${activeSemester.academic_year} ${formatSemesterTerm(activeSemester.term)}` : 'Not Configured', path: '/dashboard/semesters' },
    { label: 'Rooms', ready: totalRooms > 0, value: `${totalRooms} Campus Rooms`, path: '/dashboard/rooms' },
    { label: 'Faculty', ready: totalFaculty > 0 && facultyMissingAvail === 0, value: `${totalFaculty} Active Roster`, path: '/dashboard/teachers' },
    { label: 'Offerings', ready: totalOfferings > 0 && unassignedOfferings === 0, value: `${totalOfferings} Term Courses`, path: '/dashboard/curriculum' },
    { label: 'Schedule', ready: totalSchedules > 0, value: totalSchedules > 0 ? `${totalSchedules} Timetables` : 'Pending Generation', path: '/dashboard/schedules' }
  ];

  // Needs Attention Compact Summary
  const attentionAlerts = [];
  if (facultyMissingAvail > 0) {
    attentionAlerts.push({
      id: 'fac-avail',
      text: `${facultyMissingAvail} Faculty availability missing`,
      path: '/dashboard/teachers'
    });
  }
  if (unassignedOfferings > 0) {
    attentionAlerts.push({
      id: 'unassigned-off',
      text: `${unassignedOfferings} Subject unassigned`,
      path: '/dashboard/curriculum'
    });
  }
  attentionAlerts.push({
    id: 'conflicts',
    text: `${conflictsCount} Scheduling conflicts`,
    isClean: conflictsCount === 0,
    path: '/dashboard/schedules'
  });

  // Admin Semester Handlers
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
      }
    } catch (e) {
      addToast('Action failed: Backend service unavailable', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-full bg-[#f1f5f9] p-6 lg:p-10 space-y-8 font-sans text-slate-800 relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-green-200/40 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-yellow-100/30 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="relative z-10 space-y-8">
        
        {/* 1. ACTIVE SEMESTER HEADER (COMPACT & CLEAN) */}
        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-emerald-600 via-green-500 to-emerald-700 rounded-[2.5rem] blur opacity-25 group-hover:opacity-40 transition duration-1000"></div>
          <div className="relative bg-gradient-to-br from-emerald-950 via-green-900 to-emerald-950 backdrop-blur-2xl border border-white/20 rounded-[2.2rem] p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between shadow-2xl text-white gap-6">
            <div className="space-y-2 text-center md:text-left">
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                <span className="bg-amber-400/20 text-amber-300 border border-amber-400/30 px-3 py-1 rounded-full text-[10px] font-black tracking-[0.2em] uppercase">
                  ATLAS Timetabling Control Panel
                </span>
                <span className="bg-white/10 text-green-100 border border-white/15 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                  {departmentName} • {roleDisplay}
                </span>
              </div>
              
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-1">
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  Active Semester: <span className="text-amber-300">{activeSemester ? `${activeSemester.academic_year} ${formatSemesterTerm(activeSemester.term)}` : 'None Configured'}</span>
                </h1>
                {activeSemester && (
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2.5 py-0.5 rounded-md text-[9px] font-black tracking-widest uppercase">
                    STATUS: ACTIVE
                  </span>
                )}
              </div>
            </div>

            {isAdmin && (
              <button
                onClick={() => setIsSemesterModalOpen(true)}
                className="px-5 py-3 bg-white/10 hover:bg-white/20 text-amber-300 border border-white/20 rounded-xl text-xs font-black transition-all uppercase tracking-wider backdrop-blur-md shrink-0"
              >
                Manage Terms
              </button>
            )}
          </div>
        </div>

        {/* 2. SYSTEM OVERVIEW CARDS (SIMPLE & NUMERIC FIRST) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          
          {/* Faculty Card */}
          <div className="bg-white/85 backdrop-blur-xl border border-white/80 p-6 rounded-[2rem] shadow-xl hover:shadow-2xl hover:border-emerald-200 transition-all duration-300 flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Faculty</p>
              <h3 className="text-3xl font-black text-emerald-950 tracking-tight mt-1">{totalFaculty} Active</h3>
            </div>
            <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-100 shrink-0">
              <Users className="w-6 h-6" />
            </div>
          </div>

          {/* Rooms Card */}
          <div className="bg-white/85 backdrop-blur-xl border border-white/80 p-6 rounded-[2rem] shadow-xl hover:shadow-2xl hover:border-emerald-200 transition-all duration-300 flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Rooms</p>
              <h3 className="text-3xl font-black text-emerald-950 tracking-tight mt-1">{totalRooms} Available</h3>
            </div>
            <div className="p-3 rounded-2xl bg-cyan-50 text-cyan-700 border border-cyan-100 shrink-0">
              <MapPin className="w-6 h-6" />
            </div>
          </div>

          {/* Subjects Card */}
          <div className="bg-white/85 backdrop-blur-xl border border-white/80 p-6 rounded-[2rem] shadow-xl hover:shadow-2xl hover:border-emerald-200 transition-all duration-300 flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Subjects</p>
              <h3 className="text-3xl font-black text-emerald-950 tracking-tight mt-1">{totalOfferings} Offered</h3>
            </div>
            <div className="p-3 rounded-2xl bg-amber-50 text-amber-700 border border-amber-100 shrink-0">
              <BookOpen className="w-6 h-6" />
            </div>
          </div>

          {/* Conflicts Card */}
          <div className="bg-white/85 backdrop-blur-xl border border-white/80 p-6 rounded-[2rem] shadow-xl hover:shadow-2xl hover:border-emerald-200 transition-all duration-300 flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Conflicts</p>
              <h3 className={`text-3xl font-black tracking-tight mt-1 ${conflictsCount > 0 ? 'text-rose-600' : 'text-emerald-950'}`}>
                {conflictsCount} Issues
              </h3>
            </div>
            <div className={`p-3 rounded-2xl border shrink-0 ${conflictsCount > 0 ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* 3. SCHEDULING READINESS STATUS & 5. NEEDS ATTENTION ROW */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Scheduling Readiness Status (2 Cols) */}
          <div className="lg:col-span-2 bg-white/85 backdrop-blur-xl border border-white/80 rounded-[2.2rem] p-6 sm:p-8 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-xl font-black text-emerald-950 tracking-tight flex items-center">
                <TrendingUp className="w-5 h-5 mr-2 text-emerald-700" />
                Scheduling Status
              </h3>
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Pre-Generation Check</span>
            </div>

            {/* Compact Indicator Checklist */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {readinessItems.map(item => (
                <Link
                  key={item.label}
                  to={item.path}
                  className={`p-3.5 rounded-2xl border transition-all hover:scale-105 flex flex-col justify-between ${
                    item.ready ? 'bg-emerald-50/70 border-emerald-200/90' : 'bg-amber-50/70 border-amber-200/90'
                  }`}
                >
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{item.label}</span>
                  <div className="mt-2 flex items-center justify-between">
                    {item.ready ? (
                      <span className="inline-flex items-center text-xs font-black text-emerald-700">
                        <Check className="w-4 h-4 mr-1 text-emerald-600" /> Ready
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-xs font-black text-amber-700">
                        <Clock className="w-4 h-4 mr-1 text-amber-600" /> Pending
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Needs Attention Compact Summary (1 Col) */}
          <div className="bg-white/85 backdrop-blur-xl border border-white/80 rounded-[2.2rem] p-6 sm:p-8 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center">
                <AlertCircle className="w-5 h-5 mr-2 text-amber-600" />
                Needs Attention
              </h3>
            </div>

            <div className="space-y-2.5">
              {attentionAlerts.map(alert => (
                <Link
                  key={alert.id}
                  to={alert.path}
                  className={`flex items-center justify-between p-3 rounded-xl border text-xs font-bold transition-all hover:translate-x-1 ${
                    alert.isClean ? 'bg-emerald-50/60 border-emerald-100 text-emerald-800' : 'bg-amber-50/70 border-amber-200 text-amber-900'
                  }`}
                >
                  <span className="flex items-center truncate">
                    <span className="mr-2">{alert.isClean ? '✓' : '⚠️'}</span>
                    {alert.text}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-60" />
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* 4. QUICK ACTIONS & 6. RECENT ACTIVITY */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Quick Actions (1 Col) */}
          <div className="bg-gradient-to-br from-emerald-950 via-green-900 to-emerald-950 rounded-[2.2rem] p-7 shadow-2xl border border-white/20 space-y-5 text-white">
            <div>
              <h3 className="text-2xl font-black tracking-tight text-white">Quick Actions</h3>
              <p className="text-amber-300 text-[10px] font-black uppercase tracking-widest mt-0.5">Academic Scheduling Workflows</p>
            </div>

            <div className="space-y-3">
              {/* 1. Generate Schedule */}
              <Link
                to="/dashboard/schedules"
                className="flex items-center justify-between p-3.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-slate-950 rounded-xl transition-all font-black text-xs uppercase tracking-wider shadow-lg"
              >
                <div className="flex items-center">
                  <Zap className="w-4 h-4 mr-2.5" />
                  ⚡ Generate Schedule
                </div>
                <ChevronRight className="w-4 h-4" />
              </Link>

              {/* 2. Schedule Management */}
              <Link
                to="/dashboard/schedules"
                className="flex items-center justify-between p-3.5 bg-white/10 hover:bg-white text-white hover:text-emerald-950 rounded-xl transition-all font-black text-xs uppercase tracking-wider border border-white/10 shadow-md"
              >
                <div className="flex items-center">
                  <Calendar className="w-4 h-4 mr-2.5" />
                  📅 Schedule Management
                </div>
                <ChevronRight className="w-4 h-4" />
              </Link>

              {/* 3. Resolve Conflicts */}
              <button
                onClick={() => handleQuickAction('resolve')}
                disabled={isProcessing}
                className="flex items-center justify-between w-full p-3.5 bg-white/10 hover:bg-white text-white hover:text-amber-700 rounded-xl transition-all font-black text-xs uppercase tracking-wider border border-white/10 shadow-md disabled:opacity-50"
              >
                <div className="flex items-center">
                  <AlertTriangle className="w-4 h-4 mr-2.5" />
                  ⚠️ Resolve Conflicts
                </div>
                <ChevronRight className="w-4 h-4" />
              </button>

              {/* 4. Export Schedule */}
              <button
                onClick={() => handleQuickAction('pdf')}
                disabled={isProcessing}
                className="flex items-center justify-between w-full p-3.5 bg-white/10 hover:bg-white text-white hover:text-blue-600 rounded-xl transition-all font-black text-xs uppercase tracking-wider border border-white/10 shadow-md disabled:opacity-50"
              >
                <div className="flex items-center">
                  <FileText className="w-4 h-4 mr-2.5" />
                  📄 Export Schedule
                </div>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 6. Recent Activity (2 Cols) */}
          <div className="lg:col-span-2 bg-white/85 backdrop-blur-xl border border-white/80 rounded-[2.2rem] p-7 shadow-xl space-y-4 flex flex-col justify-between">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-xl font-black text-emerald-950 tracking-tight flex items-center">
                <Activity className="w-5 h-5 mr-2 text-emerald-700" />
                Recent Scheduling Activity
              </h3>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Audit Trail</span>
            </div>

            {recentLogs.length > 0 ? (
              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                {recentLogs.map(log => (
                  <div key={log.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50/80 border border-slate-100 text-xs">
                    <div className="flex items-center space-x-3 truncate">
                      <span className="text-emerald-700 font-bold">•</span>
                      <span className="font-bold text-slate-800 truncate">{log.action}: {log.details}</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0 ml-2">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
                No recent scheduling logs
              </div>
            )}
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
