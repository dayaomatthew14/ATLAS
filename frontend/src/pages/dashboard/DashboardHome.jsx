import React from 'react';
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
  School
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function DashboardHome() {
  const stats = [
    { name: 'Subjects', value: '24', icon: BookOpen, color: 'text-cyan-600', glow: 'shadow-cyan-500/20', trend: '+12%' },
    { name: 'Rooms', value: '12', icon: MapPin, color: 'text-purple-600', glow: 'shadow-purple-500/20', trend: 'Stable' },
    { name: 'Faculty', value: '38', icon: Users, color: 'text-emerald-600', glow: 'shadow-emerald-500/20', trend: '+2' },
    { name: 'Conflicts', value: '2', icon: AlertTriangle, color: 'text-rose-600', glow: 'shadow-rose-500/20', trend: '-50%' },
  ];

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
              <h1 className="text-4xl lg:text-6xl font-black tracking-tighter mb-6 leading-[1.1] text-slate-900">
                Master the <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-green-400">Schedule.</span>
              </h1>
              <p className="text-slate-500 text-lg font-medium mb-10 leading-relaxed">
                Welcome, {localStorage.getItem('atlas_user_name') || 'Administrator'}. Your command center for academic efficiency. Experience a crystal-clear overview of your institution.
              </p>
              <div className="flex flex-wrap gap-4 justify-center lg:justify-start">
                <Link to="/dashboard/schedules" className="px-8 py-4 bg-green-700 hover:bg-green-800 text-white rounded-2xl font-black transition-all transform hover:scale-105 shadow-lg shadow-green-700/20 flex items-center">
                  Launch Calendar <ChevronRight className="w-4 h-4 ml-2" />
                </Link>
                <button className="px-8 py-4 bg-white/40 hover:bg-white/80 backdrop-blur-md text-slate-700 rounded-2xl font-bold transition-all border border-slate-200 flex items-center group shadow-sm">
                  System Logs <Activity className="w-4 h-4 ml-2 group-hover:rotate-12 transition-transform text-slate-400" />
                </button>
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
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">{stat.name}</p>
                <h3 className="text-4xl font-black tracking-tighter leading-none text-slate-900">{stat.value}</h3>
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
            <div className="space-y-8">
              {[
                { title: 'Faculty Assigned', desc: 'Prof. Dayao joined BSCS 3-A', time: 'Just now', icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { title: 'Room Optimized', desc: 'Lab 1 capacity adjusted to 50', time: '14m ago', icon: MapPin, color: 'text-purple-600', bg: 'bg-purple-50' },
                { title: 'New Entry', desc: 'Subject: Advanced AI added', time: '1h ago', icon: BookOpen, color: 'text-cyan-600', bg: 'bg-cyan-50' },
              ].map((item, i) => (
                <div key={i} className="flex items-start group cursor-pointer">
                  <div className={`mt-1 p-3 rounded-xl ${item.bg} ${item.color} mr-6 group-hover:scale-110 transition-transform shadow-sm`}>
                    <item.icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 pb-8 border-b border-slate-100 last:border-0 last:pb-0">
                    <div className="flex justify-between items-center mb-1">
                      <p className="text-sm font-black text-slate-800 group-hover:text-green-700 transition-colors">{item.title}</p>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.time}</span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions - Crystal Panel */}
          <div className="space-y-8">
            <div className="bg-gradient-to-br from-green-700 to-green-600 rounded-[2.5rem] p-10 shadow-xl shadow-green-700/20 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:rotate-45 transition-transform duration-700 text-white">
                <Zap className="w-32 h-32" />
              </div>
              <div className="relative z-10">
                <h3 className="text-2xl font-black mb-4 tracking-tighter text-white">Quick Start</h3>
                <p className="text-green-100 text-xs font-bold mb-8 uppercase tracking-widest leading-loose">
                  Instant access to management modules.
                </p>
                <div className="space-y-3">
                  {[
                    { name: 'Schedules', path: '/dashboard/schedules', icon: Calendar },
                    { name: 'Colleges', path: '/dashboard/colleges', icon: School },
                    { name: 'Teachers', path: '/dashboard/teachers', icon: Users },
                    { name: 'Rooms', path: '/dashboard/rooms', icon: MapPin },
                  ].map(action => (
                    <Link key={action.name} to={action.path} className="flex items-center justify-between w-full p-4 bg-white/10 hover:bg-white text-white hover:text-green-800 rounded-2xl transition-all duration-300 font-black text-xs uppercase tracking-widest group/btn border border-white/10">
                      <div className="flex items-center">
                        <action.icon className="w-4 h-4 mr-3" />
                        {action.name}
                      </div>
                      <ChevronRight className="w-4 h-4 transform group-hover/btn:translate-x-1 transition-transform" />
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-2xl border border-white rounded-[2.5rem] p-8 text-center group shadow-sm">
              <div className="w-16 h-16 bg-yellow-400/10 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:rotate-12 transition-transform">
                <Plus className="w-8 h-8 text-yellow-600" />
              </div>
              <h4 className="font-black text-lg mb-2 text-slate-900">Create Anything</h4>
              <p className="text-xs text-slate-400 font-bold mb-6 px-4 leading-relaxed uppercase tracking-widest">
                Start a new entry from anywhere.
              </p>
              <button className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] transition-all hover:bg-slate-800 shadow-lg">
                Open Global Add
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
