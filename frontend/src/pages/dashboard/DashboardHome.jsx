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
  Plus,
  Zap,
  ShieldCheck,
  Activity,
  School,
  Sparkles,
  Upload,
  Sliders
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';

export default function DashboardHome() {
  const { addToast } = useToast();
  const [stats, setStats] = useState([
    { name: 'Curriculum Flow Chart', value: '0', icon: BookOpen, color: 'text-cyan-600', trend: '---' },
    { name: 'Rooms', value: '0', icon: MapPin, color: 'text-purple-600', trend: '---' },
    { name: 'Faculty', value: '0', icon: Users, color: 'text-emerald-600', trend: '---' },
    { name: 'Conflicts', value: '0', icon: AlertTriangle, color: 'text-rose-600', trend: '---' },
  ]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchStats = async () => {
    try {
      const [subjects, rooms, faculty, conflicts, logs] = await Promise.all([
        api.get('/curriculum').catch(() => []),
        api.get('/rooms').catch(() => []),
        api.get('/users?role=faculty').catch(() => []),
        api.get('/conflicts/count').catch(() => ({ count: 0 })),
        api.get('/logs?limit=4').catch(() => [])
      ]);

      setStats([
        { name: 'Curriculum Flow Chart', value: subjects.length.toString(), icon: BookOpen, color: 'text-cyan-600', trend: '+12%' },
        { name: 'Rooms', value: rooms.length.toString(), icon: MapPin, color: 'text-purple-600', trend: 'Active' },
        { name: 'Faculty', value: faculty.length.toString(), icon: Users, color: 'text-emerald-600', trend: 'Verified' },
        { name: 'Conflicts', value: (conflicts.count || 0).toString(), icon: AlertTriangle, color: 'text-rose-600', trend: conflicts.count > 0 ? 'CRITICAL' : 'CLEAN' },
      ]);
      setRecentLogs(Array.isArray(logs) ? logs : []);
    } catch (e) {
      console.error('Failed to fetch stats');
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleQuickAction = async (action) => {
    setIsProcessing(true);
    try {
      if (action === 'pdf') {
        // Trigger PDF Download
        window.open(`${api.defaults.baseURL}/schedules/export/pdf?semester_id=1`, '_blank');
        addToast('Generating official PDF schedule...', 'success');
      } else if (action === 'resolve') {
        const result = await api.post('/ai-scheduler/resolve-conflicts', { conflict_ids: [] }); // Dummy resolve all for now
        addToast('AI resolution sequence completed!', 'success');
        fetchStats();
      } else if (action === 'notify') {
        await api.post('/notifications/faculty/notify-all', { message: 'The official schedule for the current semester has been released.' });
        addToast('All faculty members notified!', 'success');
      }
    } catch (e) {
      addToast('Action failed: Backend service unavailable', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExcelImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setIsProcessing(true);
    try {
      await api.post('/schedules/import/excel', formData);
      addToast('Schedules imported successfully from Excel', 'success');
      fetchStats();
    } catch (e) {
      addToast('Import failed: Ensure file follows university template', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-full bg-[#f1f5f9] p-6 lg:p-10 space-y-10 font-sans text-slate-800 relative overflow-hidden">
      {/* Dynamic Background Elements - Light Theme */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-green-200/40 rounded-full blur-[120px]"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-yellow-100/30 rounded-full blur-[120px]"></div>

      <div className="relative z-10 space-y-10">
        {/* Header Section with Crystal Glass Card */}
        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-green-400 to-yellow-300 rounded-[2.5rem] blur opacity-20 group-hover:opacity-30 transition duration-1000"></div>
          <div className="relative bg-white/60 backdrop-blur-2xl border border-white rounded-[2.5rem] p-8 lg:p-12 flex flex-col lg:flex-row items-center justify-between overflow-hidden shadow-xl shadow-green-900/5">
            <div className="relative z-10 max-w-xl text-center lg:text-left">
              <div className="inline-flex items-center space-x-2 bg-green-500/10 border border-green-500/20 px-4 py-1.5 rounded-full text-[10px] font-black tracking-[0.2em] text-green-700 uppercase mb-8">
                <Zap className="w-3 h-3 animate-pulse" />
                <span>System Optimized</span>
              </div>
              <h1 className="text-5xl lg:text-7xl font-black tracking-tighter mb-8 leading-[1] text-slate-900">
                Master the <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-green-400">Schedule.</span>
              </h1>
              <p className="text-slate-500 text-xl font-semibold mb-12 leading-relaxed max-w-2xl">
                Welcome, {localStorage.getItem('atlas_user_name') || 'Administrator'}. Your command center for the {localStorage.getItem('atlas_department') ? `${localStorage.getItem('atlas_department')} department` : 'entire institution'}.
              </p>
              <div className="flex flex-wrap gap-4 justify-center lg:justify-start">
                <Link to="/dashboard/schedules" className="px-8 py-4 bg-green-700 hover:bg-green-800 text-white rounded-2xl font-black transition-all transform hover:scale-105 shadow-lg shadow-green-700/20 flex items-center">
                  Launch Calendar <ChevronRight className="w-4 h-4 ml-2" />
                </Link>
              </div>
            </div>
            
            {/* Visual Element */}
            <div className="hidden lg:block relative w-80 h-80">
              <div className="absolute inset-0 bg-green-500/10 rounded-full animate-ping opacity-20"></div>
              <div className="absolute inset-4 bg-yellow-400/5 rounded-full animate-pulse"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <ShieldCheck className="w-32 h-32 text-green-600/80 drop-shadow-[0_4px_10px_rgba(21,128,61,0.2)]" />
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid - Crystal Panes */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat) => (
            <div key={stat.name} className={`relative group`}>
              <div className="relative bg-white/70 backdrop-blur-xl border border-white p-8 rounded-[2rem] transition-all duration-300 group-hover:bg-white group-hover:shadow-2xl group-hover:shadow-green-900/10 group-hover:-translate-y-1 shadow-sm border-white">
                <div className="flex justify-between items-center mb-6">
                  <div className={`p-3 rounded-2xl bg-slate-50 ${stat.color}`}>
                    <stat.icon className="w-6 h-6" />
                  </div>
                  <div className="text-[10px] font-black text-green-700 bg-green-500/10 px-2 py-1 rounded-md">
                    {stat.trend}
                  </div>
                </div>
                <p className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] mb-2">{stat.name}</p>
                <h3 className="text-5xl font-black tracking-tighter leading-none text-slate-900">{stat.value}</h3>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Timeline - Frosted Glass */}
          <div className="lg:col-span-2 bg-white/50 backdrop-blur-2xl border border-white rounded-[2.5rem] p-10 shadow-sm">
            <div className="flex items-center justify-between mb-10">
              <h3 className="text-2xl font-black flex items-center tracking-tight text-slate-900">
                <Clock className="w-6 h-6 mr-4 text-green-600" />
                Live Feed
              </h3>
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Live Updates</span>
              </div>
            </div>
            <div className="space-y-4 py-4">
              {recentLogs.length > 0 ? (
                recentLogs.map(log => (
                  <div key={log.id} className="flex items-start p-4 rounded-2xl bg-slate-50 border border-slate-100 transition-colors hover:bg-white hover:shadow-md">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mr-4 shrink-0">
                      <Activity className="w-5 h-5 text-green-700" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-bold text-slate-800">{log.action}</p>
                      <p className="text-xs font-medium text-slate-500 mt-1">{log.details}</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-2">
                        {new Date(log.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-6">
                  <Activity className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                  <p className="text-sm font-black text-slate-300 uppercase tracking-[0.2em]">No Recent Activity</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">Everything is up to date.</p>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions - Crystal Panel */}
          <div className="space-y-8">
            <div className="bg-gradient-to-br from-green-700 to-green-600 rounded-[2.5rem] p-10 shadow-xl shadow-green-700/20 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:rotate-45 transition-transform duration-700 text-white">
                <Zap className="w-32 h-32" />
              </div>
              <div className="relative z-10">
                <h3 className="text-3xl font-black mb-6 tracking-tighter text-white">Quick Action</h3>
                <p className="text-green-100 text-xs font-bold mb-10 uppercase tracking-widest leading-loose">
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

            <div className="bg-white/80 backdrop-blur-2xl border border-white rounded-[2.5rem] p-8 text-center group shadow-sm flex flex-col">
              <div>
                <div className="w-16 h-16 bg-green-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                  <Plus className="w-8 h-8 text-green-700" />
                </div>
                <h4 className="font-black text-lg mb-2 text-slate-900 leading-tight">Data Integration</h4>
                <p className="text-[10px] text-slate-400 font-bold mb-4 px-4 leading-relaxed uppercase tracking-widest">
                  Rapid entry & AI Logic Setup.
                </p>
              </div>
              
              <div className="space-y-4 mt-8">
                <input 
                  type="file" 
                  id="excel-import" 
                  className="hidden" 
                  accept=".xlsx, .xls"
                  onChange={handleExcelImport}
                />
                <button 
                  onClick={() => document.getElementById('excel-import').click()}
                  disabled={isProcessing}
                  className="w-full py-5 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-[0.2em] transition-all hover:bg-slate-800 shadow-lg flex items-center justify-center disabled:opacity-50"
                >
                  <Upload className={`w-5 h-5 mr-4 text-green-400 ${isProcessing ? 'animate-bounce' : ''}`} />
                  {isProcessing ? 'Processing...' : 'Import from Excel'}
                </button>
                <Link to="/dashboard/ai-rules" className="w-full py-5 bg-white border border-slate-200 text-slate-700 rounded-2xl text-xs font-black uppercase tracking-[0.2em] transition-all hover:bg-slate-50 shadow-sm flex items-center justify-center">
                  <Sliders className="w-5 h-5 mr-4 text-green-600" />
                  Configure AI Rules
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
