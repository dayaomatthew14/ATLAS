import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';
import { Activity, Shield, Terminal, Search, Filter, Trash2, Download, Clock, User, Zap, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function SystemLogs() {
  const { addToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterType, setFilterType] = useState('All Types');

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const data = await api.get('/logs');
      setLogs(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch logs');
      setLogs([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 15000); // Poll every 15s
    return () => clearInterval(interval);
  }, []);

  const handleExport = () => {
    window.open(`${api.defaults.baseURL}/logs/export`, '_blank');
    addToast('Downloading system logs...', 'success');
  };

  const handleClear = async () => {
    if (window.confirm('Are you sure you want to clear all system logs? This cannot be undone.')) {
      try {
        await api.delete('/logs');
        addToast('System logs cleared', 'success');
        fetchLogs();
      } catch (e) {
        addToast('Failed to clear logs', 'error');
      }
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'success': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'warning': return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      case 'error': return <Shield className="w-4 h-4 text-rose-500" />;
      default: return <Clock className="w-4 h-4 text-blue-500" />;
    }
  };

  const getStatusBg = (status) => {
    switch (status) {
      case 'success': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'warning': return 'bg-yellow-50 text-yellow-700 border-yellow-100';
      case 'error': return 'bg-rose-50 text-rose-700 border-rose-100';
      default: return 'bg-blue-50 text-blue-700 border-blue-100';
    }
  };

  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (log.user?.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesFilter = filterType === 'All Types' || 
                         (filterType === 'AI Generation' && log.activity_type?.includes('AI')) ||
                         (filterType === 'User Activity' && !log.activity_type?.includes('AI')) ||
                         (filterType === 'Errors' && log.status === 'error');
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="flex-1 flex flex-col p-6 lg:p-10 space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 flex items-center">
            <Terminal className="w-8 h-8 mr-4 text-green-700" />
            System Logs
          </h1>
          <p className="text-slate-500 font-medium mt-1">Audit trail and AI generation history for the institution.</p>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={handleExport}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors flex items-center shadow-sm"
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </button>
          <button 
            onClick={handleClear}
            className="px-4 py-2 bg-rose-50 text-rose-600 border border-rose-100 rounded-xl text-sm font-bold hover:bg-rose-100 transition-colors flex items-center shadow-sm"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Clear All
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search logs by message or user..." 
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border-transparent focus:bg-white focus:border-green-600 rounded-xl outline-none transition-all text-sm font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center space-x-2 w-full md:w-auto">
          <select 
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="flex-1 md:w-40 px-4 py-3 bg-slate-50 border-transparent rounded-xl text-sm font-bold text-slate-600 outline-none cursor-pointer"
          >
            <option>All Types</option>
            <option>AI Generation</option>
            <option>User Activity</option>
            <option>Security</option>
            <option>Errors</option>
          </select>
          <button className="p-3 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-colors">
            <Filter className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden relative group">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-green-600 to-yellow-400 opacity-50"></div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Status</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Event Message</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">User</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Timestamp</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/80 transition-colors group/row">
                  <td className="px-6 py-5">
                    <div className={`inline-flex items-center px-3 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest ${getStatusBg(log.status)}`}>
                      <span className="mr-1.5">{getStatusIcon(log.status)}</span>
                      {log.type.replace('_', ' ')}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <p className="text-sm font-bold text-slate-700 leading-snug">{log.message}</p>
                    {log.type === 'AI_GEN' && (
                      <div className="flex items-center mt-1.5 text-[10px] text-indigo-500 font-bold uppercase tracking-widest">
                        <Zap className="w-3 h-3 mr-1" /> AI Optimization Engine
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center">
                      <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center mr-3">
                        <User className="w-4 h-4 text-slate-400" />
                      </div>
                      <span className="text-sm font-bold text-slate-600">{log.user}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 whitespace-nowrap">
                    <span className="text-xs font-black text-slate-400 tracking-tighter uppercase">{log.time}</span>
                  </td>
                  <td className="px-6 py-5">
                    <button className="text-xs font-black text-green-700 hover:text-green-800 uppercase tracking-widest opacity-0 group-hover/row:opacity-100 transition-opacity">
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {filteredLogs.length === 0 && (
          <div className="py-20 text-center">
            <Activity className="w-16 h-16 text-slate-100 mx-auto mb-4" />
            <p className="text-sm font-black text-slate-300 uppercase tracking-widest">No matching logs found</p>
          </div>
        )}
      </div>

      {/* Footer Meta */}
      <div className="flex items-center justify-between text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2">
        <p>Showing {filteredLogs.length} recent system events</p>
        <p className="flex items-center">
          <Activity className="w-3 h-3 mr-2 text-green-500 animate-pulse" />
          Auto-updating in real-time
        </p>
      </div>
    </div>
  );
}
