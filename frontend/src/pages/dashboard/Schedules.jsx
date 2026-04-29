import React, { useState, useEffect } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Plus, AlertTriangle, Bell, Sparkles, Calendar as CalendarIcon, Clock, Filter, MapPin, User, Layout } from 'lucide-react';
import Modal from '../../components/Modal';
import ConflictPanel from '../../components/ConflictPanel';
import AIGenerationModal from '../../components/AIGenerationModal';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';
import { detectConflicts, checkScheduleIntegrity } from '../../utils/conflictDetection';

export default function Schedules() {
  const { addToast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [schedules, setSchedules] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConflictPanelOpen, setIsConflictPanelOpen] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [formConflicts, setFormConflicts] = useState([]);

  const role = (localStorage.getItem('atlas_role') || 'guest').toLowerCase();
  const canManage = ['admin', 'program_chair'].includes(role);

  // Date Helpers
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const renderCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const days = [];

    for (let i = 0; i < firstDay; i++) {
      days.push({ day: null, currentMonth: false });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      days.push({ day: d, currentMonth: true, date: new Date(year, month, d) });
    }

    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({ day: i, currentMonth: false });
    }

    return days;
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
  const [curriculumItems, setCurriculumItems] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [formData, setFormData] = useState({
    curriculum_id: '',
    room_id: '',
    faculty_id: '',
    day_of_week: 'Mon',
    start_time: '07:30',
    end_time: '08:30',
    section: ''
  });

  const fetchDropdownData = async () => {
    try {
      const [curriculumData, roomsData, teachersData] = await Promise.all([
        api.get('/curriculum').catch(() => []),
        api.get('/rooms').catch(() => []),
        api.get('/users?role=faculty').catch(() => [])
      ]);
      setCurriculumItems(curriculumData || []);
      setRooms(roomsData || []);
      setTeachers(teachersData || []);
    } catch (error) {
      console.error('Error fetching dropdown data');
      addToast('Failed to fetch required data', 'error');
    }
  };

  const handleOpenModal = () => {
    fetchDropdownData();
    setAiSuggestions([]);
    setIsModalOpen(true);
  };

  const handleGetSuggestions = async () => {
    if (!formData.curriculum_id) {
      addToast('Please select a curriculum item first', 'error');
      return;
    }
    setIsFetchingSuggestions(true);
    try {
      const data = await api.get('/schedules/suggestions', { params: { curriculum_id: formData.curriculum_id } });
      setAiSuggestions(data);
      if (data.length === 0) {
        addToast('No suggestions found. Faculty might be overloaded.', 'warning');
      } else {
        addToast('AI Suggestions generated!', 'success');
      }
    } catch (e) {
      addToast('Failed to fetch AI suggestions', 'error');
    } finally {
      setIsFetchingSuggestions(false);
    }
  };

  // Real-time conflict check
  useEffect(() => {
    if (formData.curriculum_id && formData.start_time) {
      const conflicts = detectConflicts({
        ...formData,
        room_name: rooms.find(r => r.id === parseInt(formData.room_id))?.name,
        teacher: teachers.find(t => t.id === parseInt(formData.faculty_id))?.name
      }, schedules);
      setFormConflicts(conflicts);
    }
  }, [formData, schedules, rooms, teachers]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/schedules', formData);
      fetchSchedules();
      setIsModalOpen(false);
      addToast('Schedule created successfully', 'success');
    } catch (error) {
      addToast(error.response?.data?.detail || error.message || 'Failed to create schedule', 'error');
    }
  };

  const fetchSchedules = async () => {
    setIsLoading(true);
    try {
      const rawData = await api.get('/schedules');
      const formattedData = Array.isArray(rawData) ? rawData.map(s => ({
        ...s,
        date: s.date ? new Date(s.date) : new Date()
      })) : [];
      setSchedules(checkScheduleIntegrity(formattedData));
    } catch (error) {
      console.error('Failed to fetch schedules', error);
      setSchedules([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAIGeneration = (params) => {
    fetchSchedules();
  };

  useEffect(() => {
    fetchSchedules();
  }, [currentDate]);

  const activeConflictsCount = schedules.filter(s => s.isConflicting).length;

  return (
    <div className="p-8 animate-in fade-in duration-700">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-indigo-100 p-2.5 rounded-xl shadow-sm">
              <CalendarIcon className="w-6 h-6 text-indigo-700" />
            </div>
            <h2 className="text-4xl font-black text-slate-900 tracking-tighter">Academic Schedules</h2>
          </div>
          <p className="text-slate-500 text-base font-medium">Manage faculty assignments, room allocations, and resolve scheduling conflicts.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {activeConflictsCount > 0 && (
            <button
              onClick={() => setIsConflictPanelOpen(true)}
              className="bg-rose-50 text-rose-700 border border-rose-200 px-6 py-4 rounded-2xl flex items-center shadow-sm transition-all font-black text-sm uppercase tracking-widest animate-pulse"
            >
              <AlertTriangle className="w-5 h-5 mr-2" />
              {activeConflictsCount} Conflicts
            </button>
          )}

          {canManage && (
            <>
              <button
                onClick={() => setIsAIModalOpen(true)}
                className="bg-amber-100 hover:bg-amber-200 text-amber-700 px-6 py-4 rounded-2xl flex items-center shadow-sm transition-all font-black text-sm uppercase tracking-widest transform hover:scale-105 active:scale-95"
              >
                <Sparkles className="w-5 h-5 mr-2" /> Auto-Generate
              </button>
              <button
                onClick={handleOpenModal}
                className="bg-green-700 hover:bg-green-800 text-white px-8 py-4 rounded-2xl flex items-center shadow-lg transition-all font-black text-sm uppercase tracking-widest transform hover:scale-105 active:scale-95"
              >
                <Plus className="w-6 h-6 mr-2" /> Create Manual
              </button>
            </>
          )}
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col min-h-[800px]">
        {/* Calendar Toolbar */}
        <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
          <div className="flex items-center gap-4">
            <button
              onClick={prevMonth}
              className="p-3 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 shadow-sm transition-all active:scale-90"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-center min-w-[200px]">
              <h3 className="text-2xl font-black text-slate-800 tracking-tight uppercase">
                {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
              </h3>
            </div>
            <button
              onClick={nextMonth}
              className="p-3 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 shadow-sm transition-all active:scale-90"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-3">
             <button className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-900 transition-all flex items-center gap-2">
               <Filter className="w-4 h-4" /> Filter View
             </button>
             <button className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-900 transition-all flex items-center gap-2">
               <Layout className="w-4 h-4" /> List View
             </button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="flex-1 p-8">
          <div className="grid grid-cols-7 gap-4">
            {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => (
              <div key={day} className="pb-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{day}</div>
            ))}

            {renderCalendarDays().map((cell, i) => {
              const daySchedules = schedules.filter(s =>
                cell.date &&
                s.date.getDate() === cell.day &&
                s.date.getMonth() === currentDate.getMonth() &&
                s.date.getFullYear() === currentDate.getFullYear()
              );

              return (
                <div 
                  key={i} 
                  className={`min-h-[140px] p-4 rounded-3xl border transition-all relative group ${
                    cell.currentMonth 
                      ? 'bg-white border-slate-100 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-500/5' 
                      : 'bg-slate-50/50 border-transparent opacity-40'
                  }`}
                >
                  <span className={`absolute top-4 right-5 text-sm font-black ${cell.currentMonth ? 'text-slate-900' : 'text-slate-300'}`}>
                    {cell.day}
                  </span>

                  <div className="mt-6 space-y-2">
                    {daySchedules.map(schedule => (
                      <div
                        key={schedule.id}
                        className={`text-[10px] p-3 rounded-2xl shadow-sm border transition-all ${
                          schedule.isConflicting
                            ? 'bg-rose-50 border-rose-100 text-rose-900 ring-2 ring-rose-500/10'
                            : schedule.isAI
                              ? 'bg-indigo-50 border-indigo-100 text-indigo-900'
                              : 'bg-amber-50 border-amber-100 text-amber-900'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-black uppercase truncate pr-1">{schedule.curriculum}</span>
                          {schedule.isConflicting && <AlertTriangle className="w-3 h-3 text-rose-600 flex-shrink-0" />}
                        </div>
                        <div className="flex items-center gap-1 opacity-70 font-bold mb-1">
                          <Clock className="w-2.5 h-2.5" />
                          <span>{schedule.startTime} - {schedule.endTime}</span>
                        </div>
                        <div className="flex items-center gap-1 opacity-70 font-bold">
                          <MapPin className="w-2.5 h-2.5" />
                          <span>{schedule.room_id ? `Room ${schedule.room_id}` : 'No Room'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <ConflictPanel
        isOpen={isConflictPanelOpen}
        onClose={() => setIsConflictPanelOpen(false)}
        conflicts={schedules.filter(s => s.isConflicting).map(s => ({
          ...s,
          type: 'General',
          conflictWith: s.conflictDetails?.[0]
        }))}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Initialize Schedule Record"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {formConflicts.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 p-5 rounded-3xl flex items-start gap-4">
              <div className="bg-white p-2 rounded-xl shadow-sm">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <p className="text-sm font-black text-rose-900 uppercase tracking-tight">Critical Conflict Detected</p>
                <p className="text-xs text-rose-700 mt-1 font-medium leading-relaxed">
                  The selected time window overlaps with an existing assignment for the same {formConflicts[0].type.toLowerCase()}.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-6">
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Subject / Course</label>
              <select
                required
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-500 transition-all font-black text-slate-900 appearance-none cursor-pointer"
                value={formData.curriculum_id}
                onChange={(e) => setFormData({ ...formData, curriculum_id: e.target.value })}
              >
                <option value="">Select Curriculum Item</option>
                {curriculumItems.map(s => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
              </select>
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Target Section</label>
              <input
                type="text"
                required
                placeholder="e.g. BSCS-3A"
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-500 transition-all font-black text-slate-900"
                value={formData.section}
                onChange={(e) => setFormData({ ...formData, section: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Assigned Faculty</label>
              <select
                required
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-500 transition-all font-black text-slate-900 appearance-none cursor-pointer"
                value={formData.faculty_id}
                onChange={(e) => setFormData({ ...formData, faculty_id: e.target.value })}
              >
                <option value="">Choose Teacher</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Room Allocation</label>
              <select
                required
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-500 transition-all font-black text-slate-900 appearance-none cursor-pointer"
                value={formData.room_id}
                onChange={(e) => setFormData({ ...formData, room_id: e.target.value })}
              >
                <option value="">Choose Room</option>
                {rooms.map(r => <option key={r.id} value={r.id}>{r.name} ({r.building})</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6">
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Day</label>
              <select
                required
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-500 transition-all font-black text-slate-900 appearance-none cursor-pointer"
                value={formData.day_of_week}
                onChange={(e) => setFormData({ ...formData, day_of_week: e.target.value })}
              >
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Start</label>
              <input
                type="time"
                required
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-500 transition-all font-black text-slate-900"
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-2">End</label>
              <input
                type="time"
                required
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-500 transition-all font-black text-slate-900"
                value={formData.end_time}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
              />
            </div>
          </div>

          <div className="pt-6 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6">
            <button
              type="button"
              onClick={handleGetSuggestions}
              disabled={isFetchingSuggestions}
              className="w-full md:w-auto px-6 py-4 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center transition-all disabled:opacity-50"
            >
              <Sparkles className={`w-4 h-4 mr-2 ${isFetchingSuggestions ? 'animate-spin' : ''}`} />
              {isFetchingSuggestions ? 'AI Processing...' : 'Get AI Suggestions'}
            </button>
            <div className="flex gap-4 w-full md:w-auto">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="flex-1 md:flex-none px-8 py-4 text-xs font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest"
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`flex-1 md:flex-none px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all transform hover:scale-105 active:scale-95 text-white ${
                  formConflicts.length > 0 ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-100' : 'bg-green-700 hover:bg-green-800 shadow-green-100'
                }`}
              >
                {formConflicts.length > 0 ? 'Override & Save' : 'Confirm Schedule'}
              </button>
            </div>
          </div>

          {/* AI Suggestions Panel */}
          {aiSuggestions.length > 0 && (
            <div className="mt-8 pt-8 border-t border-slate-100 animate-in slide-in-from-top-4 duration-500">
              <div className="flex items-center gap-3 mb-6">
                <Sparkles className="w-5 h-5 text-indigo-600" />
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Recommended Optimizations</h4>
              </div>
              <div className="grid grid-cols-1 gap-4">
                {aiSuggestions.map((sug, idx) => (
                  <div key={idx} className="group flex items-center justify-between p-5 bg-indigo-50/30 border border-indigo-100 rounded-3xl hover:bg-white hover:border-indigo-300 hover:shadow-xl hover:shadow-indigo-500/5 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-indigo-50">
                        <User className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-800">{sug.faculty_name}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-600">
                            <Clock className="w-3 h-3" /> {sug.day_of_week} {sug.start_time} - {sug.end_time}
                          </span>
                          <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                            <MapPin className="w-3 h-3" /> {sug.room_name}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormData({
                        ...formData,
                        faculty_id: sug.faculty_id.toString(),
                        room_id: sug.room_id.toString(),
                        day_of_week: sug.day_of_week,
                        start_time: sug.start_time,
                        end_time: sug.end_time
                      })}
                      className="px-6 py-3 bg-white text-indigo-600 border border-indigo-200 text-[10px] font-black uppercase tracking-widest rounded-xl shadow-sm hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all active:scale-95"
                    >
                      Apply Recommendation
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>
      </Modal>

      <AIGenerationModal
        isOpen={isAIModalOpen}
        onClose={() => setIsAIModalOpen(false)}
        onGenerate={handleAIGeneration}
      />
    </div>
  );
}
