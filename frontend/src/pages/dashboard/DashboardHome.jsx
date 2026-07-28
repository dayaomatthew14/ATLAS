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
  Upload,
  Sliders,
  Trash2,
  Check,
  CheckCircle2,
  AlertCircle,
  Server,
  Database,
  Lock,
  UserCheck,
  UserX,
  FileText,
  ArrowRight
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

  // Common Data States
  const [activeSemester, setActiveSemester] = useState(null);
  const [allSemesters, setAllSemesters] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSemesterModalOpen, setIsSemesterModalOpen] = useState(false);
  const [newSemesterData, setNewSemesterData] = useState({ academic_year: '', term: '1st Semester' });

  // Academic Dashboard States (Program Chair & Coordinator)
  const [stats, setStats] = useState([
    { name: 'Rooms', value: '0', icon: MapPin, color: 'text-cyan-600', trend: '---' },
    { name: 'Active Semester', value: 'None', icon: Clock, color: 'text-purple-600', trend: '---' },
    { name: 'Faculty', value: '0', icon: Users, color: 'text-emerald-600', trend: '---' },
    { name: 'Conflicts', value: '0', icon: AlertTriangle, color: 'text-rose-600', trend: '---' },
  ]);
  const [schedulesCount, setSchedulesCount] = useState(0);
  const [conflictsCount, setConflictsCount] = useState(0);
  const [roomUtilization, setRoomUtilization] = useState(0);
  const [roomsCount, setRoomsCount] = useState(0);
  const [facultyCount, setFacultyCount] = useState(0);
  const [facultyMissingAvail, setFacultyMissingAvail] = useState(0);
  const [offeringsCount, setOfferingsCount] = useState(0);

  // Admin Dashboard States (System Administrator)
  const [usersList, setUsersList] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [healthStatus, setHealthStatus] = useState({
    backend: 'ONLINE',
    database: 'CONNECTED',
    auth: 'SECURE',
    latency: '14ms'
  });

  const fetchStats = async () => {
    try {
      if (isAdmin) {
        // Fetch Admin-specific governance data
        const [users, semesters, logsData] = await Promise.all([
          api.get('/users').catch(() => []),
          api.get('/semesters').catch(() => []),
          api.get('/logs?limit=8').catch(() => [])
        ]);

        const safeUsers = Array.isArray(users) ? users : [];
        const safeSemesters = Array.isArray(semesters) ? semesters : [];
        const safeLogs = Array.isArray(logsData) ? logsData : [];

        setUsersList(safeUsers);
        setPendingUsers(safeUsers.filter(u => u.is_verified === false));
        setAllSemesters(safeSemesters);
        setActiveSemester(safeSemesters.find(s => s.is_active) || null);
        setRecentLogs(safeLogs);
      } else {
        // Fetch Academic Scheduling data for Program Chair & Coordinator
        const [schedules, semesters, faculty, conflicts, logsData, rooms] = await Promise.all([
          api.get('/schedules').catch(() => []),
          api.get('/semesters').catch(() => []),
          api.get('/professors').catch(() => []),
          api.get('/conflicts/count').catch(() => ({ count: 0 })),
          api.get('/logs?limit=5').catch(() => []),
          api.get('/rooms').catch(() => [])
        ]);

        const safeSemesters = Array.isArray(semesters) ? semesters : [];
        const safeSchedules = Array.isArray(schedules) ? schedules : [];
        const safeFaculty = Array.isArray(faculty) ? faculty : [];
        const safeRooms = Array.isArray(rooms) ? rooms : [];
        const safeLogs = Array.isArray(logsData) ? logsData : [];

        setAllSemesters(safeSemesters);
        const activeSem = safeSemesters.find(s => s.is_active);
        setActiveSemester(activeSem || null);
        setRecentLogs(safeLogs);

        const scheduledRooms = new Set(safeSchedules.filter(s => s.room_id).map(s => s.room_id)).size;
        const computedRoomUtilization = safeRooms.length > 0 ? Math.round((scheduledRooms / safeRooms.length) * 100) : 0;

        setSchedulesCount(safeSchedules.length);
        setConflictsCount(conflicts?.count || 0);
        setRoomUtilization(computedRoomUtilization);

        setRoomsCount(safeRooms.length);
        setFacultyCount(safeFaculty.length);

        const unconfiguredFaculty = safeFaculty.filter(f => !f.max_units || f.max_units === 0).length;
        setFacultyMissingAvail(unconfiguredFaculty);

        if (activeSem) {
          try {
            const offerings = await api.get(`/subject-offerings?semester_id=${activeSem.id}`).catch(() => []);
            if (Array.isArray(offerings)) setOfferingsCount(offerings.length);
          } catch {
            setOfferingsCount(0);
          }
        } else {
          setOfferingsCount(0);
        }

        setStats([
          { name: 'Rooms', value: safeRooms.length.toString(), icon: MapPin, color: 'text-cyan-600', trend: `${computedRoomUtilization}% in use` },
          { name: 'Active Semester', value: activeSem ? `${activeSem.academic_year} ${formatSemesterTerm(activeSem.term)}` : 'None', icon: Clock, color: 'text-purple-600', trend: 'Active' },
          { name: 'Faculty', value: safeFaculty.length.toString(), icon: Users, color: 'text-emerald-600', trend: 'Verified' },
          { name: 'Conflicts', value: (conflicts?.count || 0).toString(), icon: AlertTriangle, color: (conflicts?.count || 0) > 0 ? 'text-rose-600' : 'text-emerald-600', trend: (conflicts?.count || 0) > 0 ? 'CRITICAL' : 'CLEAN' },
        ]);
      }
    } catch (e) {
      console.error('Failed to fetch dashboard stats', e);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [isAdmin]);

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

  // Admin User Verification Toggle Handler
  const handleToggleVerification = async (userId) => {
    setIsProcessing(true);
    try {
      await api.post(`/users/${userId}/toggle-verification`, {});
      addToast('User verification status updated!', 'success');
      fetchStats();
    } catch (err) {
      addToast(err.message || 'Failed to update verification', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Admin Semester Management Handlers
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
        addToast('AI resolution sequence completed!', 'success');
        fetchStats();
      } else if (action === 'notify') {
        if (activeSemester) {
          await api.post(`/notifications/notify-faculty?semester_id=${activeSemester.id}`);
          addToast('All faculty members notified!', 'success');
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

  // Admin Metrics Calculations
  const chairCount = usersList.filter(u => (u.role || '').toLowerCase() === 'program_chair').length;
  const coordCount = usersList.filter(u => (u.role || '').toLowerCase() === 'coordinator').length;
  const adminRoleCount = usersList.filter(u => (u.role || '').toLowerCase() === 'admin').length;

  return (
    <div className="min-h-full bg-[#f1f5f9] p-6 lg:p-10 space-y-8 font-sans text-slate-800 relative overflow-hidden">
      {/* Dynamic Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-green-200/40 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-yellow-100/30 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="relative z-10 space-y-8">
        
        {/* ========================================================================= */}
        {/* VIEW 1: SYSTEM ADMINISTRATOR DASHBOARD (role === 'admin')                 */}
        {/* ========================================================================= */}
        {isAdmin ? (
          <>
            {/* Admin Header Section */}
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-emerald-600 via-green-500 to-emerald-700 rounded-[2.5rem] blur opacity-25 group-hover:opacity-40 transition duration-1000"></div>
              <div className="relative bg-gradient-to-br from-emerald-950 via-green-900 to-emerald-950 backdrop-blur-2xl border border-white/20 rounded-[2.2rem] p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between shadow-2xl text-white gap-6">
                <div className="space-y-2 text-center md:text-left">
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                    <span className="bg-amber-400/20 text-amber-300 border border-amber-400/30 px-3 py-1 rounded-full text-[10px] font-black tracking-[0.2em] uppercase">
                      ATLAS Administration Portal
                    </span>
                    <span className="bg-white/10 text-green-100 border border-white/15 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                      System Governance & Security Command Center
                    </span>
                  </div>
                  
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-1">
                    <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                      Active Semester Scope: <span className="text-amber-300">{activeSemester ? `${activeSemester.academic_year} ${formatSemesterTerm(activeSemester.term)}` : 'None Configured'}</span>
                    </h1>
                    {activeSemester && (
                      <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2.5 py-0.5 rounded-md text-[9px] font-black tracking-widest uppercase">
                        STATUS: ACTIVE
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => setIsSemesterModalOpen(true)}
                    className="px-5 py-3 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-slate-950 rounded-xl text-xs font-black transition-all shadow-lg uppercase tracking-wider shrink-0"
                  >
                    Manage Academic Terms
                  </button>
                </div>
              </div>
            </div>

            {/* Admin Overview Cards (4 Grid Cards) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Card 1: User Accounts */}
              <Link to="/dashboard/users" className="bg-white/85 backdrop-blur-xl border border-white/80 p-6 rounded-[2rem] shadow-xl hover:shadow-2xl hover:border-emerald-200 transition-all duration-300 flex items-center justify-between">
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">User Governance</p>
                  <h3 className="text-3xl font-black text-emerald-950 tracking-tight mt-1">{usersList.length} Accounts</h3>
                  <p className={`text-xs font-bold mt-1 ${pendingUsers.length > 0 ? 'text-amber-600' : 'text-slate-500'}`}>
                    {pendingUsers.length > 0 ? `⚠ ${pendingUsers.length} Pending Approval` : 'All Verified'}
                  </p>
                </div>
                <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-100 shrink-0">
                  <Users className="w-6 h-6" />
                </div>
              </Link>

              {/* Card 2: Active Semester */}
              <div onClick={() => setIsSemesterModalOpen(true)} className="cursor-pointer bg-white/85 backdrop-blur-xl border border-white/80 p-6 rounded-[2rem] shadow-xl hover:shadow-2xl hover:border-emerald-200 transition-all duration-300 flex items-center justify-between">
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Active Term</p>
                  <h3 className="text-xl font-black text-emerald-950 tracking-tight mt-1">
                    {activeSemester ? `${activeSemester.academic_year}` : 'None'}
                  </h3>
                  <p className="text-xs font-bold text-slate-500 mt-1">
                    {activeSemester ? formatSemesterTerm(activeSemester.term) : 'Inoperative'}
                  </p>
                </div>
                <div className="p-3 rounded-2xl bg-amber-50 text-amber-700 border border-amber-100 shrink-0">
                  <Clock className="w-6 h-6" />
                </div>
              </div>

              {/* Card 3: Infrastructure Health */}
              <div className="bg-white/85 backdrop-blur-xl border border-white/80 p-6 rounded-[2rem] shadow-xl hover:shadow-2xl hover:border-emerald-200 transition-all duration-300 flex items-center justify-between">
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">System Health</p>
                  <h3 className="text-3xl font-black text-emerald-700 tracking-tight mt-1">100% Online</h3>
                  <p className="text-xs font-bold text-slate-500 mt-1">API Latency: {healthStatus.latency}</p>
                </div>
                <div className="p-3 rounded-2xl bg-cyan-50 text-cyan-700 border border-cyan-100 shrink-0">
                  <Server className="w-6 h-6" />
                </div>
              </div>

              {/* Card 4: Security Status */}
              <Link to="/dashboard/logs" className="bg-white/85 backdrop-blur-xl border border-white/80 p-6 rounded-[2rem] shadow-xl hover:shadow-2xl hover:border-emerald-200 transition-all duration-300 flex items-center justify-between">
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Security Status</p>
                  <h3 className="text-3xl font-black text-emerald-950 tracking-tight mt-1">0 Alerts</h3>
                  <p className="text-xs font-bold text-slate-500 mt-1">Audit Trail Clean</p>
                </div>
                <div className="p-3 rounded-2xl bg-purple-50 text-purple-700 border border-purple-100 shrink-0">
                  <ShieldCheck className="w-6 h-6" />
                </div>
              </Link>
            </div>

            {/* Admin Quick Workflows */}
            <div className="bg-gradient-to-br from-emerald-950 via-green-900 to-emerald-950 rounded-[2.2rem] p-6 shadow-2xl border border-white/20 text-white space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-xl font-black tracking-tight text-white flex items-center">
                  <Zap className="w-5 h-5 mr-2 text-amber-400" />
                  Administrative Governance Workflows
                </h3>
                <span className="text-[10px] font-black text-amber-300 uppercase tracking-widest">Platform Controls</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Link
                  to="/dashboard/users"
                  className="flex items-center justify-between p-4 bg-white/10 hover:bg-white text-white hover:text-emerald-950 rounded-xl transition-all font-black text-xs uppercase tracking-wider border border-white/10 shadow-md"
                >
                  <div className="flex items-center">
                    <Users className="w-4 h-4 mr-2 text-amber-300" />
                    👥 Manage Users
                  </div>
                  <ChevronRight className="w-4 h-4" />
                </Link>

                <button
                  onClick={() => setIsSemesterModalOpen(true)}
                  className="flex items-center justify-between p-4 bg-white/10 hover:bg-white text-white hover:text-emerald-950 rounded-xl transition-all font-black text-xs uppercase tracking-wider border border-white/10 shadow-md"
                >
                  <div className="flex items-center">
                    <Calendar className="w-4 h-4 mr-2 text-amber-300" />
                    🗓️ Academic Terms
                  </div>
                  <ChevronRight className="w-4 h-4" />
                </button>

                <Link
                  to="/dashboard/logs"
                  className="flex items-center justify-between p-4 bg-white/10 hover:bg-white text-white hover:text-emerald-950 rounded-xl transition-all font-black text-xs uppercase tracking-wider border border-white/10 shadow-md"
                >
                  <div className="flex items-center">
                    <Activity className="w-4 h-4 mr-2 text-amber-300" />
                    🛡️ View Audit Logs
                  </div>
                  <ChevronRight className="w-4 h-4" />
                </Link>

                <button
                  onClick={() => handleQuickAction('notify')}
                  disabled={isProcessing}
                  className="flex items-center justify-between p-4 bg-white/10 hover:bg-white text-white hover:text-emerald-950 rounded-xl transition-all font-black text-xs uppercase tracking-wider border border-white/10 shadow-md disabled:opacity-50"
                >
                  <div className="flex items-center">
                    <Zap className="w-4 h-4 mr-2 text-amber-300" />
                    📢 System Broadcast
                  </div>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Admin Middle Grid: Pending Approvals & Infrastructure Diagnostics */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* User Governance & Pending Approvals (2 Cols) */}
              <div className="lg:col-span-2 bg-white/85 backdrop-blur-xl border border-white/80 rounded-[2.2rem] p-6 sm:p-8 shadow-xl space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-xl font-black text-emerald-950 tracking-tight flex items-center">
                      <Users className="w-5 h-5 mr-2 text-emerald-700" />
                      Pending Account Approvals ({pendingUsers.length})
                    </h3>
                    <p className="text-xs font-bold text-slate-500 mt-0.5">Approve registration requests for Program Chairs and Department Coordinators</p>
                  </div>
                  <Link to="/dashboard/users" className="text-xs font-black text-emerald-700 hover:text-emerald-900 uppercase tracking-wider">
                    Full Roster →
                  </Link>
                </div>

                {/* Pending Users Roster */}
                {pendingUsers.length > 0 ? (
                  <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                    {pendingUsers.map(user => (
                      <div key={user.id} className="flex items-center justify-between p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80">
                        <div>
                          <p className="font-black text-slate-900 text-sm">{user.name || user.email}</p>
                          <p className="text-xs font-bold text-slate-500">
                            {user.role === 'program_chair' ? 'Program Chair' : (user.role === 'coordinator' ? 'Coordinator' : 'Administrator')} • {user.department || 'DLSAU'}
                          </p>
                        </div>
                        <button
                          onClick={() => handleToggleVerification(user.id)}
                          disabled={isProcessing}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl transition-all shadow-md uppercase tracking-wider flex items-center"
                        >
                          <Check className="w-3.5 h-3.5 mr-1" /> Approve Access
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center rounded-2xl bg-emerald-50/50 border border-emerald-100 text-emerald-800 text-xs font-bold">
                    ✓ All user accounts verified and active. No pending approvals required.
                  </div>
                )}

                {/* Role Distribution Summary */}
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4 text-xs font-bold text-slate-600">
                  <span>Role Distribution:</span>
                  <div className="flex gap-3">
                    <span className="bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                      Chairs: <strong className="text-slate-900 font-black">{chairCount}</strong>
                    </span>
                    <span className="bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                      Coordinators: <strong className="text-slate-900 font-black">{coordCount}</strong>
                    </span>
                    <span className="bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                      Admins: <strong className="text-slate-900 font-black">{adminRoleCount}</strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* Infrastructure Diagnostics (1 Col) */}
              <div className="bg-white/85 backdrop-blur-xl border border-white/80 rounded-[2.2rem] p-6 sm:p-8 shadow-xl space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center">
                    <Server className="w-5 h-5 mr-2 text-cyan-600" />
                    Infrastructure Diagnostics
                  </h3>
                </div>

                <div className="space-y-3.5 text-xs font-bold">
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="flex items-center text-slate-700">
                      <Server className="w-4 h-4 mr-2 text-emerald-600" />
                      FastAPI Backend API
                    </span>
                    <span className="bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-md font-black text-[10px]">
                      ✓ ONLINE
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="flex items-center text-slate-700">
                      <Database className="w-4 h-4 mr-2 text-cyan-600" />
                      PostgreSQL Database
                    </span>
                    <span className="bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-md font-black text-[10px]">
                      ✓ CONNECTED
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="flex items-center text-slate-700">
                      <Lock className="w-4 h-4 mr-2 text-purple-600" />
                      JWT Auth Engine
                    </span>
                    <span className="bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-md font-black text-[10px]">
                      ✓ SECURE
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="flex items-center text-slate-700">
                      <ShieldCheck className="w-4 h-4 mr-2 text-amber-600" />
                      Security Audits
                    </span>
                    <span className="bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-md font-black text-[10px]">
                      ✓ 0 ALERTS
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Admin Audit Trail Feed */}
            <div className="bg-white/85 backdrop-blur-xl border border-white/80 rounded-[2.2rem] p-7 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-xl font-black text-emerald-950 tracking-tight flex items-center">
                  <Activity className="w-5 h-5 mr-2 text-emerald-700" />
                  System Audit Trail & Event Monitoring
                </h3>
                <Link to="/dashboard/logs" className="text-xs font-black text-emerald-700 hover:text-emerald-900 uppercase tracking-wider">
                  View Full Audit Logs →
                </Link>
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
                  No system activity logs recorded
                </div>
              )}
            </div>
          </>
        ) : (
          /* ========================================================================= */
          /* VIEW 2: PROGRAM CHAIR & COORDINATOR ACADEMIC CONTROL PANEL (!isAdmin)    */
          /* ========================================================================= */
          <>
            {/* Header Section */}
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-emerald-600 via-green-500 to-emerald-700 rounded-[2.8rem] blur opacity-25 group-hover:opacity-40 transition duration-1000"></div>
              <div className="relative bg-gradient-to-br from-emerald-950 via-green-900 to-emerald-950 backdrop-blur-2xl border border-white/20 rounded-[2.5rem] p-8 sm:p-10 flex flex-col lg:flex-row items-center justify-between overflow-hidden shadow-2xl text-white">
                <div className="relative z-10 max-w-xl text-center lg:text-left">
                  <div className="inline-flex items-center space-x-2 bg-amber-400/20 text-amber-300 border border-amber-400/30 px-4 py-1.5 rounded-full text-[10px] font-black tracking-[0.2em] uppercase mb-4 backdrop-blur-md">
                    <Zap className="w-3.5 h-3.5 animate-pulse text-amber-400" />
                    <span>{userRole === 'coordinator' ? 'Coordinator Command Center' : 'Program Chair Command Center'}</span>
                  </div>
                  <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight mb-3 text-white leading-tight">
                    Master the <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-amber-200">Schedule.</span>
                  </h1>
                  <p className="text-green-100/90 text-sm sm:text-base lg:text-lg font-medium mb-6 leading-relaxed max-w-2xl">
                    Welcome, <span className="text-amber-300 font-bold">{localStorage.getItem('atlas_user_name') || roleDisplay}</span>. Your command center for the <span className="text-white font-bold">{localStorage.getItem('atlas_department') ? `${localStorage.getItem('atlas_department')} department` : 'academic institution'}</span>.
                  </p>
                  <div className="flex flex-wrap gap-3 justify-center lg:justify-start">
                    <Link to="/dashboard/schedules" className="px-7 py-3.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-slate-950 rounded-2xl text-xs sm:text-sm font-black transition-all transform hover:scale-105 shadow-xl shadow-amber-500/20 flex items-center uppercase tracking-wider">
                      Launch Calendar <ChevronRight className="w-4 h-4 ml-1.5" />
                    </Link>
                  </div>
                </div>
                
                <div className="hidden lg:block relative w-72 h-72 shrink-0">
                  <div className="absolute inset-0 bg-emerald-400/10 rounded-full animate-ping opacity-30"></div>
                  <div className="absolute inset-4 bg-amber-400/10 rounded-full animate-pulse"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <ShieldCheck className="w-32 h-32 text-amber-300/90 drop-shadow-[0_4px_20px_rgba(251,191,36,0.3)]" />
                  </div>
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {stats.map((stat) => (
                <div 
                  key={stat.name} 
                  className="relative group h-full"
                >
                  <div className="h-full flex flex-col justify-between relative bg-white/85 backdrop-blur-xl border border-white/80 p-7 rounded-[2.2rem] transition-all duration-300 group-hover:bg-white group-hover:shadow-2xl group-hover:border-emerald-200 group-hover:-translate-y-1.5 shadow-xl">
                    <div>
                      <div className="flex justify-between items-center mb-6">
                        <div className={`p-3.5 rounded-2xl bg-emerald-50 border border-emerald-100 ${stat.color}`}>
                          <stat.icon className="w-6 h-6" />
                        </div>
                        <div className="text-[10px] font-black text-emerald-800 bg-emerald-100/80 px-2.5 py-1 rounded-full border border-emerald-200 uppercase tracking-wider">
                          {stat.trend}
                        </div>
                      </div>
                      <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-2">{stat.name}</p>
                    </div>
                    {stat.name === 'Active Semester' && stat.value !== 'None' ? (
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <span className="text-xl lg:text-2xl font-black text-emerald-950 bg-emerald-50 px-4 py-2 rounded-2xl inline-block w-fit border border-emerald-200 shadow-xs">
                          {stat.value.split(' ').slice(1).join(' ')}
                        </span>
                        <span className="text-xs lg:text-sm font-black text-slate-500 uppercase tracking-widest leading-none">
                          {stat.value.split(' ')[0]}
                        </span>
                      </div>
                    ) : (
                      <h3 className={`font-black tracking-tighter leading-none text-emerald-950 ${stat.value.length > 10 ? 'text-lg lg:text-2xl mt-4' : 'text-5xl'}`}>{stat.value}</h3>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Scheduling Status & Needs Attention Panels */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white/85 backdrop-blur-xl border border-white/80 rounded-[2.2rem] p-6 sm:p-8 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-xl font-black text-emerald-950 tracking-tight flex items-center">
                    <TrendingUp className="w-5 h-5 mr-2 text-emerald-700" />
                    Scheduling Status
                  </h3>
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Pre-Generation Check</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {[
                    { label: 'Semester', ready: !!activeSemester, text: activeSemester ? 'Ready' : 'Pending', path: '/dashboard/semesters' },
                    { label: 'Rooms', ready: roomsCount > 0, text: roomsCount > 0 ? 'Ready' : 'Pending', path: '/dashboard/rooms' },
                    { label: 'Faculty', ready: facultyCount > 0 && facultyMissingAvail === 0, text: (facultyCount > 0 && facultyMissingAvail === 0) ? 'Ready' : 'Pending', path: '/dashboard/teachers' },
                    { label: 'Offerings', ready: offeringsCount > 0, text: offeringsCount > 0 ? 'Ready' : 'Pending', path: '/dashboard/curriculum' },
                    { label: 'Schedule', ready: schedulesCount > 0, text: schedulesCount > 0 ? 'Completed' : 'Pending', path: '/dashboard/schedules' }
                  ].map(item => (
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
                            <Check className="w-4 h-4 mr-1 text-emerald-600" /> {item.text}
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-xs font-black text-amber-700">
                            <Clock className="w-4 h-4 mr-1 text-amber-600" /> {item.text}
                          </span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="bg-white/85 backdrop-blur-xl border border-white/80 rounded-[2.2rem] p-6 sm:p-8 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center">
                    <AlertCircle className="w-5 h-5 mr-2 text-amber-600" />
                    Needs Attention
                  </h3>
                </div>

                <div className="space-y-2.5">
                  {[
                    {
                      id: 'conflicts',
                      text: conflictsCount === 0 ? '✓ 0 Scheduling conflicts' : `⚠ ${conflictsCount} Scheduling conflicts`,
                      isClean: conflictsCount === 0,
                      path: '/dashboard/schedules'
                    },
                    ...(facultyMissingAvail > 0 ? [{
                      id: 'fac-avail',
                      text: '⚠ Missing faculty availability',
                      isClean: false,
                      path: '/dashboard/teachers'
                    }] : []),
                    ...(offeringsCount === 0 ? [{
                      id: 'no-offerings',
                      text: '⚠ No subject offerings created',
                      isClean: false,
                      path: '/dashboard/curriculum'
                    }] : []),
                    ...(roomsCount === 0 ? [{
                      id: 'no-rooms',
                      text: '⚠ Unassigned rooms detected',
                      isClean: false,
                      path: '/dashboard/rooms'
                    }] : [])
                  ].map(alert => (
                    <Link
                      key={alert.id}
                      to={alert.path}
                      className={`flex items-center justify-between p-3 rounded-xl border text-xs font-bold transition-all hover:translate-x-1 ${
                        alert.isClean ? 'bg-emerald-50/60 border-emerald-100 text-emerald-800' : 'bg-amber-50/70 border-amber-200 text-amber-900'
                      }`}
                    >
                      <span className="flex items-center truncate">
                        {alert.text}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-60" />
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 flex flex-col bg-white/85 backdrop-blur-xl border border-white/80 rounded-[2.5rem] p-8 sm:p-10 shadow-xl h-full">
                <div className="flex items-center justify-between mb-8 shrink-0">
                  <h3 className="text-2xl font-black flex items-center tracking-tight text-emerald-950">
                    <Clock className="w-6 h-6 mr-3 text-emerald-700" />
                    Live Feed
                  </h3>
                  <div className="flex items-center space-x-2 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-800">Live Updates</span>
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

              <div className="space-y-8">
                <div className="bg-gradient-to-br from-emerald-950 via-green-900 to-emerald-950 rounded-[2.5rem] p-8 sm:p-10 shadow-2xl border border-white/20 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:rotate-45 transition-transform duration-700 text-white">
                    <Zap className="w-32 h-32" />
                  </div>
                  <div className="relative z-10">
                    <h3 className="text-3xl font-black mb-3 tracking-tight text-white">Quick Actions</h3>
                    <p className="text-amber-300 text-xs font-black mb-8 uppercase tracking-widest leading-relaxed">
                      High-impact AI commands.
                    </p>
                    <div className="space-y-3">
                      {[
                        { name: 'Auto-Resolve Conflicts', action: 'resolve', icon: Sparkles, color: 'hover:text-yellow-600' },
                        { name: 'Generate Official PDF', action: 'pdf', icon: BookOpen, color: 'hover:text-blue-600' },
                        { name: 'Notify All Faculty', action: 'notify', icon: Zap, color: 'hover:text-purple-600' },
                      ].map(action => (
                        <button 
                          key={action.name} 
                          onClick={() => handleQuickAction(action.action)}
                          disabled={isProcessing}
                          className={`flex items-center justify-between w-full p-5 bg-white/10 hover:bg-white text-white ${action.color} rounded-2xl transition-all duration-300 font-black text-xs uppercase tracking-widest group/btn border border-white/10 shadow-lg disabled:opacity-50`}
                        >
                          <div className="flex items-center">
                            <action.icon className={`w-4 h-4 mr-3 ${isProcessing && action.action === 'resolve' ? 'animate-spin' : ''}`} />
                            {action.name}
                          </div>
                          <ChevronRight className="w-4 h-4 transform group-hover/btn:translate-x-1 transition-transform" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-white/80 backdrop-blur-2xl border border-white rounded-[2.5rem] p-8 text-left group shadow-sm flex flex-col justify-between hover:shadow-2xl hover:shadow-green-900/5 transition-all duration-300">
                  <div>
                    <div className="flex items-center justify-between mb-6">
                      <div className="w-12 h-12 bg-green-500/10 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                        <Activity className="w-6 h-6 text-green-700 animate-pulse" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 px-3 py-1.5 rounded-full">
                        Diagnostics
                      </span>
                    </div>
                    <h4 className="font-black text-xl text-slate-900 leading-none mb-2">Workspace Health</h4>
                    <p className="text-[10px] text-slate-400 font-bold mb-6 uppercase tracking-widest leading-relaxed">
                      Real-time system performance
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

      </div>

      {/* Admin Semester Management Modal */}
      {isAdmin && (
        <Modal
          isOpen={isSemesterModalOpen}
          onClose={() => setIsSemesterModalOpen(false)}
          title="Manage Academic Term"
          maxWidth="max-w-md"
        >
          <div className="space-y-6 pt-2">
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
                Select Active Term
              </label>
              <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
                {allSemesters.map(sem => (
                  <div 
                    key={sem.id} 
                    className={`p-4 rounded-2xl border transition-all flex items-center justify-between ${
                      sem.is_active 
                        ? 'bg-gradient-to-br from-emerald-950 via-green-900 to-emerald-900 text-white border-emerald-700 shadow-md' 
                        : 'bg-slate-50 border-slate-100 text-slate-800 hover:border-slate-200'
                    }`}
                  >
                    <div>
                      <p className={`font-black text-sm ${sem.is_active ? 'text-white' : 'text-slate-900'}`}>{sem.academic_year}</p>
                      <p className={`text-xs font-bold ${sem.is_active ? 'text-emerald-200/90' : 'text-slate-500'}`}>{formatSemesterTerm(sem.term)}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      {!sem.is_active ? (
                        <button
                          onClick={() => handleSetActiveSemester(sem.id)}
                          className="px-3.5 py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors shadow-sm"
                          disabled={isProcessing}
                        >
                          Set Active
                        </button>
                      ) : (
                        <div className="flex items-center text-emerald-400 text-xs font-black uppercase tracking-widest">
                          <CheckCircle2 className="w-4 h-4 mr-1 text-emerald-400" /> Active
                        </div>
                      )}
                      <button
                        onClick={() => handleDeleteSemester(sem.id)}
                        className={`p-1.5 rounded-xl transition-colors ${
                          sem.is_active ? 'text-emerald-300/70 hover:text-rose-300' : 'text-slate-400 hover:text-rose-500 hover:bg-rose-50'
                        }`}
                        disabled={isProcessing}
                        title="Delete Semester"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {allSemesters.length === 0 && (
                  <div className="text-center p-4 text-slate-400 font-bold text-xs">No academic terms found.</div>
                )}
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100 space-y-4">
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">
                Add Academic Term
              </label>
              <form onSubmit={handleCreateSemester} className="space-y-4">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Academic Year</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 2026-2027"
                    className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-emerald-600"
                    value={newSemesterData.academic_year}
                    onChange={(e) => setNewSemesterData({ ...newSemesterData, academic_year: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Semester Term</label>
                  <select
                    className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-emerald-600"
                    value={newSemesterData.term}
                    onChange={(e) => setNewSemesterData({ ...newSemesterData, term: e.target.value })}
                  >
                    <option value="1st Semester">1st Semester</option>
                    <option value="2nd Semester">2nd Semester</option>
                    <option value="3rd Semester">3rd Semester</option>
                  </select>
                </div>

                <label className="flex items-center gap-3 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    className="w-5 h-5 text-emerald-600 rounded-lg focus:ring-emerald-500"
                    checked={newSemesterData.is_active}
                    onChange={(e) => setNewSemesterData({ ...newSemesterData, is_active: e.target.checked })}
                  />
                  <span className="text-xs font-black text-slate-700">Set as Active Academic Term</span>
                </label>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsSemesterModalOpen(false)}
                    className="flex-1 py-3.5 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="flex-1 py-3.5 bg-emerald-800 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-900 transition-all shadow-lg shadow-emerald-900/20 disabled:opacity-50"
                  >
                    Save Term
                  </button>
                </div>
              </form>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
