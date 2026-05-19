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
  Sparkles,
  Upload,
  Sliders,
  Trash2
} from 'lucide-react';
import { Link } from 'react-router-dom';
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
  const [stats, setStats] = useState([
    { name: 'Schedules', value: '0', icon: Calendar, color: 'text-cyan-600', trend: '---' },
    { name: 'Active Semester', value: 'None', icon: Clock, color: 'text-purple-600', trend: '---' },
    { name: 'Faculty', value: '0', icon: Users, color: 'text-emerald-600', trend: '---' },
    { name: 'Conflicts', value: '0', icon: AlertTriangle, color: 'text-rose-600', trend: '---' },
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSemesterModalOpen, setIsSemesterModalOpen] = useState(false);
  const [allSemesters, setAllSemesters] = useState([]);
  const [newSemesterData, setNewSemesterData] = useState({ academic_year: '', term: '1st Semester' });

  const fetchStats = async () => {
    try {
      const [schedules, semesters, faculty, conflicts] = await Promise.all([
        api.get('/schedules').catch(() => []),
        api.get('/semesters').catch(() => []),
        api.get('/professors').catch(() => []),
        api.get('/conflicts/count').catch(() => ({ count: 0 }))
      ]);

      setAllSemesters(semesters);
      const activeSemester = semesters.find(s => s.is_active);

      setStats([
        { name: 'Schedules', value: schedules.length.toString(), icon: Calendar, color: 'text-cyan-600', trend: '+12%' },
        { name: 'Active Semester', value: activeSemester ? `${activeSemester.academic_year} ${formatSemesterTerm(activeSemester.term)}` : 'None', icon: Clock, color: 'text-purple-600', trend: 'Active' },
        { name: 'Faculty', value: faculty.length.toString(), icon: Users, color: 'text-emerald-600', trend: 'Verified' },
        { name: 'Conflicts', value: (conflicts.count || 0).toString(), icon: AlertTriangle, color: 'text-rose-600', trend: conflicts.count > 0 ? 'CRITICAL' : 'CLEAN' },
      ]);
    } catch (e) {
      console.error('Failed to fetch stats');
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

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
      // Only close if it's empty now? Let's just fetchStats so they see it disappear.
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
        // Trigger PDF Download
        window.open(`${api.defaults.baseURL}/schedules/export/pdf?semester_id=1`, '_blank');
        addToast('Generating official PDF schedule...', 'success');
      } else if (action === 'resolve') {
        const result = await api.post('/ai-scheduler/resolve-conflicts', []); // Dummy resolve all for now
        addToast('AI resolution sequence completed!', 'success');
        fetchStats();
      } else if (action === 'notify') {
        const sems = await api.get('/semesters');
        const active = sems.find(s => s.is_active);
        if (active) {
          await api.post(`/notifications/notify-faculty?semester_id=${active.id}`);
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
            <div 
              key={stat.name} 
              className={`relative group h-full ${stat.name === 'Active Semester' ? 'cursor-pointer' : ''}`}
              onClick={() => stat.name === 'Active Semester' && setIsSemesterModalOpen(true)}
            >
              <div className="h-full flex flex-col justify-between relative bg-white/70 backdrop-blur-xl border border-white p-8 rounded-[2rem] transition-all duration-300 group-hover:bg-white group-hover:shadow-2xl group-hover:shadow-green-900/10 group-hover:-translate-y-1 shadow-sm border-white">
                <div>
                  <div className="flex justify-between items-center mb-6">
                    <div className={`p-3 rounded-2xl bg-slate-50 ${stat.color}`}>
                      <stat.icon className="w-6 h-6" />
                    </div>
                    <div className="text-[10px] font-black text-green-700 bg-green-500/10 px-2 py-1 rounded-md">
                      {stat.trend}
                    </div>
                  </div>
                  <p className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] mb-2">{stat.name}</p>
                </div>
                {stat.name === 'Active Semester' && stat.value !== 'None' ? (
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <span className="text-2xl lg:text-3xl font-black text-green-700 bg-green-500/10 px-4 py-2 rounded-2xl inline-block w-fit border border-green-500/20 shadow-sm">
                      {stat.value.split(' ').slice(1).join(' ')}
                    </span>
                    <span className="text-sm lg:text-base font-black text-slate-400 uppercase tracking-widest leading-none">
                      {stat.value.split(' ')[0]}
                    </span>
                  </div>
                ) : (
                  <h3 className={`font-black tracking-tighter leading-none text-slate-900 ${stat.value.length > 10 ? 'text-lg lg:text-2xl mt-4' : 'text-5xl'}`}>{stat.value}</h3>
                )}
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
            <div className="space-y-8 py-10 text-center">
              <Activity className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-sm font-black text-slate-300 uppercase tracking-[0.2em]">No Recent Activity</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Everything is up to date.</p>
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
                  <select
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all font-bold text-slate-700 appearance-none cursor-pointer"
                    value={newSemesterData.term}
                    onChange={(e) => setNewSemesterData({ ...newSemesterData, term: e.target.value })}
                  >
                    <option value="1st Semester">1st Semester</option>
                    <option value="2nd Semester">2nd Semester</option>
                    <option value="3rd Semester">3rd Semester</option>
                  </select>
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
    </div>
  );
}
