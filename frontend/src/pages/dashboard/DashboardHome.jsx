import { useState, useEffect } from 'react';
import { Users, BookOpen, MapPin, AlertTriangle, TrendingUp, Clock, ChevronRight, Zap, ShieldCheck, Activity, Sparkles, Check, AlertCircle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api, API_BASE } from '../../utils/api';
import { getRole, getUserName, getDepartment, ROLES } from '../../utils/session';
import { useToast } from '../../components/ToastProvider';
import { ROLE_LABELS } from '../../components/ui/tokens';

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

  const userRole = getRole();
  const roleDisplay = ROLE_LABELS[userRole] || 'Signed in';

  // Common Data States
  const [activeSemester, setActiveSemester] = useState(null);
  const [recentLogs, setRecentLogs] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Academic Dashboard States (Program Chair & Coordinator)
  const [stats, setStats] = useState([
    { name: 'Rooms', value: '0', icon: MapPin, color: 'text-cyan-600', trend: '---' },
    { name: 'Active Semester', value: 'None', icon: Clock, color: 'text-purple-600', trend: '---' },
    { name: 'Faculty', value: '0', icon: Users, color: 'text-emerald-600', trend: '---' },
    { name: 'Conflicts', value: '0', icon: AlertTriangle, color: 'text-rose-600', trend: '---' },
  ]);
  const [schedulesCount, setSchedulesCount] = useState(0);
  const [conflictsCount, setConflictsCount] = useState(0);
  const [roomsCount, setRoomsCount] = useState(0);
  const [facultyCount, setFacultyCount] = useState(0);
  const [facultyMissingAvail, setFacultyMissingAvail] = useState(0);
  const [offeringsCount, setOfferingsCount] = useState(0);

  // Admin Dashboard States (System Administrator)

  const fetchStats = async () => {
    try {
      {
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

        const activeSem = safeSemesters.find(s => s.is_active);
        setActiveSemester(activeSem || null);
        setRecentLogs(safeLogs);

        const scheduledRooms = new Set(safeSchedules.filter(s => s.room_id).map(s => s.room_id)).size;
        const computedRoomUtilization = safeRooms.length > 0 ? Math.round((scheduledRooms / safeRooms.length) * 100) : 0;

        setSchedulesCount(safeSchedules.length);
        setConflictsCount(conflicts?.count || 0);

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

  // Load once on mount. This screen only ever serves chairs and coordinators
  // now, so there is no role to re-key the fetch on.
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
          default:
            break;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  const handleQuickAction = async (action) => {
    setIsProcessing(true);
    try {
      if (action === 'pdf') {
        // HEU-03: `api` is a plain object with no `defaults`, so this threw a
        // TypeError the moment the button was clicked. It also hardcoded
        // semester_id=1 rather than using the active term.
        if (!activeSemester) {
          addToast('Set an active term before exporting a schedule.', 'warning');
          return;
        }
        window.open(`${API_BASE}/schedules/export/pdf?semester_id=${activeSemester.id}`, '_blank');
        addToast('Preparing the schedule PDF.', 'success');
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


  return (
    <div className="min-h-full bg-[#f1f5f9] p-6 lg:p-10 space-y-8 font-sans text-slate-800 relative overflow-hidden">
      {/* Dynamic Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-green-200/40 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-yellow-100/30 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="relative z-10 space-y-8">
        {/* The administrator branch that used to sit here is gone: /dashboard
            now resolves through Overview.jsx, which renders AdminOverview for
            administrators and this screen for chairs and coordinators. */}
            {/* Header Section */}
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-emerald-600 via-green-500 to-emerald-700 rounded-[2.8rem] blur opacity-25 group-hover:opacity-40 transition duration-1000"></div>
              <div className="relative bg-gradient-to-br from-emerald-950 via-green-900 to-emerald-950 backdrop-blur-2xl border border-white/20 rounded-[2.5rem] p-8 sm:p-10 flex flex-col lg:flex-row items-center justify-between overflow-hidden shadow-2xl text-white">
                <div className="relative z-10 max-w-xl text-center lg:text-left">
                  <div className="inline-flex items-center space-x-2 bg-amber-400/20 text-amber-300 border border-amber-400/30 px-4 py-1.5 rounded-full text-[10px] font-black tracking-[0.2em] uppercase mb-4 backdrop-blur-md">
                    <Zap className="w-3.5 h-3.5 animate-pulse text-amber-400" />
                    <span>{userRole === ROLES.COORDINATOR ? 'Coordinator Workspace' : 'Program Chair Workspace'}</span>
                  </div>
                  <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight mb-3 text-white leading-tight">
                    Master the <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-amber-200">Schedule.</span>
                  </h1>
                  <p className="text-green-100/90 text-sm sm:text-base lg:text-lg font-medium mb-6 leading-relaxed max-w-2xl">
                    Welcome, <span className="text-amber-300 font-bold">{getUserName() || roleDisplay}</span>. Your command center for the <span className="text-white font-bold">{getDepartment() ? `${getDepartment()} department` : 'academic institution'}</span>.
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

      </div>

    </div>
  );
}
