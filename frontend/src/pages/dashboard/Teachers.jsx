import React, { useState, useEffect } from 'react';
import { Plus, Users as UsersIcon, Clock, Calendar, ShieldAlert, UserCheck, X, Check, Trash2 } from 'lucide-react';
import Table from '../../components/Table';
import Modal from '../../components/Modal';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Teachers() {
  const { addToast } = useToast();
  const [teachers, setTeachers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'full_time',
    max_units: 18,
    unavailability: []
  });
  const [selectedDays, setSelectedDays] = useState([]);
  const [customRanges, setCustomRanges] = useState({}); // { 'Mon': { start: '07:30', end: '17:30', active: false } }

  const columns = [
    {
      key: 'name',
      label: 'Teacher Name',
      render: (item) => (
        <div className="flex items-center">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600 mr-4 shadow-sm">
            <UsersIcon className="w-5 h-5" />
          </div>
          <div>
            <span className="font-black text-slate-900 block">{item.name}</span>
            <span className="text-xs text-slate-500 font-medium">{item.email}</span>
          </div>
        </div>
      )
    },
    { 
      key: 'load', 
      label: 'Teaching Load',
      render: (item) => {
        const current = item.current_units || 0;
        const max = item.max_units || 18;
        const percentage = Math.min((current / max) * 100, 100);
        const isOverloaded = current > max;
        
        return (
          <div className="w-48">
            <div className="flex justify-between items-center mb-1.5">
              <span className={`text-xs font-black uppercase ${isOverloaded ? 'text-rose-600' : 'text-slate-500'}`}>
                {current} / {max} Units
              </span>
              {isOverloaded && <ShieldAlert className="w-3.5 h-3.5 text-rose-600 animate-pulse" />}
            </div>
            <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200 p-0.5">
              <div 
                className={`h-full transition-all duration-700 rounded-full ${
                  isOverloaded ? 'bg-rose-500' : percentage > 80 ? 'bg-amber-500' : 'bg-green-600'
                }`}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        );
      }
    },
    {
      key: 'type',
      label: 'Type',
      render: (item) => (
        <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
          item.type === 'full_time' 
            ? 'bg-green-50 text-green-700 border border-green-100' 
            : 'bg-blue-50 text-blue-700 border border-blue-100'
        }`}>
          {item.type?.replace('_', ' ') || 'Full Time'}
        </span>
      )
    },
    {
      key: 'availability',
      label: 'Availability',
      render: (item) => (
        <button 
          onClick={() => handleOpenAvailability(item)}
          className="flex items-center space-x-2 px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 rounded-xl border border-slate-200 shadow-sm transition-all font-black text-xs uppercase tracking-widest active:scale-95"
        >
          <Clock className="w-4 h-4 text-green-600" />
          <span>Set Blocked Times</span>
        </button>
      )
    },
  ];

  const [isAvailabilityModalOpen, setIsAvailabilityModalOpen] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [unavailability, setUnavailability] = useState([]);

  const handleOpenAvailability = async (teacher) => {
    setSelectedTeacher(teacher);
    setIsAvailabilityModalOpen(true);
    try {
      const data = await api.get(`/users/${teacher.id}/unavailability`).catch(() => []);
      setUnavailability(data);
    } catch (e) {
      setUnavailability([]);
    }
  };

  const fetchTeachers = async () => {
    setIsLoading(true);
    try {
      const data = await api.get('/users?role=faculty');
      setTeachers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch teachers', error);
      setTeachers([]);
      addToast('Failed to load teachers', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTeachers();
  }, []);

  const handleOpenModal = (teacher = null) => {
    if (teacher) {
      setEditingTeacher(teacher);
      setFormData({
        name: teacher.name,
        type: teacher.type || 'full_time',
        max_units: teacher.max_units || 18,
        unavailability: teacher.unavailability || []
      });
      
      // Initialize selected days and custom ranges from existing unavailability
      const days = [];
      const ranges = {};
      (teacher.unavailability || []).forEach(u => {
        const day = u.day_of_week.substring(0, 3);
        days.push(day);
        ranges[day] = {
          start: u.start_time || '07:30',
          end: u.end_time || '17:30',
          active: u.is_custom || false
        };
      });
      setSelectedDays(days);
      setCustomRanges(ranges);
    } else {
      setEditingTeacher(null);
      setFormData({ name: '', type: 'full_time', max_units: 18, unavailability: [] });
      setSelectedDays([]);
      setCustomRanges({});
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTeacher(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Construct unavailability array for submission
    const finalUnavailability = selectedDays.map(day => {
      const range = customRanges[day] || { start: '07:30', end: '17:30', active: false };
      const fullDayName = {
        'Mon': 'Monday', 'Tue': 'Tuesday', 'Wed': 'Wednesday',
        'Thu': 'Thursday', 'Fri': 'Friday', 'Sat': 'Saturday'
      }[day];
      
      return {
        day_of_week: fullDayName,
        start_time: range.active ? range.start : '07:30',
        end_time: range.active ? range.end : '17:30',
        is_custom: range.active
      };
    });

    const submissionData = {
      ...formData,
      unavailability: finalUnavailability,
      // Default fields required by backend but removed from UI
      email: editingTeacher?.email || `${formData.name.toLowerCase().replace(/\s+/g, '.')}@dlsau.edu.ph`,
      password: 'ChangeMe123!',
      role: 'faculty'
    };

    try {
      if (editingTeacher) {
        await api.put(`/users/${editingTeacher.id}`, submissionData);
      } else {
        await api.post('/users', submissionData);
      }
      fetchTeachers();
      handleCloseModal();
      addToast(`Teacher ${editingTeacher ? 'updated' : 'added'} successfully`, 'success');
    } catch (error) {
      addToast(error.message || 'Error saving teacher', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this teacher?')) {
      try {
        await api.delete(`/users/${id}`);
        fetchTeachers();
        addToast('Teacher removed successfully', 'success');
      } catch (error) {
        addToast(error.message || 'Error removing teacher', 'error');
      }
    }
  };

  return (
    <div className="p-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-orange-100 p-2.5 rounded-xl shadow-sm">
              <UserCheck className="w-6 h-6 text-orange-700" />
            </div>
            <h2 className="text-4xl font-black text-slate-900 tracking-tighter">Manage Teachers</h2>
          </div>
          <p className="text-slate-500 text-base font-medium">Configure faculty profiles, track teaching loads, and manage schedule constraints.</p>
        </div>
        
        <button
          onClick={() => handleOpenModal()}
          className="bg-green-700 hover:bg-green-800 text-white px-8 py-4 rounded-2xl flex items-center shadow-lg transition-all font-black text-sm uppercase tracking-widest transform hover:scale-105 active:scale-95"
        >
          <Plus className="w-6 h-6 mr-2" /> Add Teacher
        </button>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden p-2">
        <Table
          columns={columns}
          data={teachers}
          isLoading={isLoading}
          onEdit={handleOpenModal}
          onDelete={handleDelete}
        />
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingTeacher ? 'Edit Teacher Profile' : 'Add New Faculty Member'}
        maxWidth="sm:max-w-3xl"
      >
        <form onSubmit={handleSubmit} className="space-y-8 max-h-[80vh] overflow-y-auto px-1 pr-2 custom-scrollbar">
          {/* Profile Section */}
          <div className="grid grid-cols-2 gap-6">
            <div className="col-span-2">
              <label className="block text-xs font-black text-slate-400 mb-2 uppercase tracking-[0.2em]">Full Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Juan Dela Cruz"
                className="w-full px-5 py-4 bg-slate-50 border-none focus:ring-2 focus:ring-green-600 rounded-2xl transition-all font-bold text-slate-700 placeholder:text-slate-300 placeholder:font-medium"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-400 mb-2 uppercase tracking-[0.2em]">Faculty Type</label>
              <div className="flex bg-slate-50 p-1.5 rounded-2xl gap-1.5">
                {['full_time', 'part_time'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFormData({ ...formData, type })}
                    className={`flex-1 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${
                      formData.type === type 
                        ? 'bg-white text-green-700 shadow-sm' 
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    {type.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-400 mb-2 uppercase tracking-[0.2em]">Max Units</label>
              <input
                type="number"
                required
                className="w-full px-5 py-4 bg-slate-50 border-none focus:ring-2 focus:ring-green-600 rounded-2xl transition-all font-bold text-slate-700"
                value={formData.max_units}
                onChange={(e) => setFormData({ ...formData, max_units: e.target.value })}
              />
            </div>
          </div>

          {/* Availability Section */}
          <div className="space-y-6 pt-2">
            <label className="block text-xs font-black text-slate-400 mb-4 uppercase tracking-[0.2em]">Time Unavailable</label>
            
            {/* Day Toggle Buttons */}
            <div className="flex flex-wrap gap-3">
              {DAYS.map(day => {
                const isSelected = selectedDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setSelectedDays(selectedDays.filter(d => d !== day));
                      } else {
                        setSelectedDays([...selectedDays, day]);
                        if (!customRanges[day]) {
                          setCustomRanges({ ...customRanges, [day]: { start: '07:30', end: '17:30', active: false } });
                        }
                      }
                    }}
                    className={`px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest border transition-all ${
                      isSelected 
                        ? 'bg-rose-500 border-rose-500 text-white shadow-lg shadow-rose-200 scale-105' 
                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            {/* Time Range Panels */}
            {selectedDays.length > 0 && (
              <div className="space-y-4 animate-in slide-in-from-top-4 duration-500">
                <p className="text-xs font-bold text-slate-500 italic">Set time ranges per selected day (optional):</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedDays.map(day => {
                    const range = customRanges[day] || { start: '07:30', end: '17:30', active: false };
                    return (
                      <div 
                        key={day} 
                        className={`p-5 rounded-[2rem] border transition-all ${
                          range.active ? 'bg-white border-blue-200 shadow-md ring-1 ring-blue-50' : 'bg-slate-50/50 border-slate-100 opacity-80'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-4">
                          <span className={`font-black text-sm uppercase tracking-tighter ${range.active ? 'text-blue-600' : 'text-slate-400'}`}>
                            {day}
                          </span>
                          <button 
                            type="button"
                            onClick={() => setSelectedDays(selectedDays.filter(d => d !== day))}
                            className="text-slate-300 hover:text-rose-500 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <label className="flex items-center gap-3 cursor-pointer group mb-3">
                          <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                            range.active ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300 group-hover:border-slate-400'
                          }`}>
                            {range.active && <Check className="w-3.5 h-3.5 text-white stroke-[4]" />}
                          </div>
                          <input 
                            type="checkbox" 
                            className="hidden" 
                            checked={range.active}
                            onChange={(e) => setCustomRanges({
                              ...customRanges,
                              [day]: { ...range, active: e.target.checked }
                            })}
                          />
                          <span className={`text-xs font-bold ${range.active ? 'text-slate-700' : 'text-slate-400'}`}>Use specific time range</span>
                        </label>

                        {!range.active ? (
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-8">
                            Current: 07:30 – 17:30
                          </p>
                        ) : (
                          <div className="grid grid-cols-2 gap-3 pl-8 animate-in fade-in duration-300">
                            <div>
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.1em] block mb-1">From</span>
                              <div className="relative">
                                <Clock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-blue-500" />
                                <input 
                                  type="time" 
                                  className="w-full pl-9 pr-3 py-2 bg-blue-50/50 border-none rounded-xl text-xs font-bold text-slate-700 focus:ring-1 focus:ring-blue-500"
                                  value={range.start}
                                  onChange={(e) => setCustomRanges({
                                    ...customRanges,
                                    [day]: { ...range, start: e.target.value }
                                  })}
                                />
                              </div>
                            </div>
                            <div>
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.1em] block mb-1">To</span>
                              <div className="relative">
                                <Clock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-blue-500" />
                                <input 
                                  type="time" 
                                  className="w-full pl-9 pr-3 py-2 bg-blue-50/50 border-none rounded-xl text-xs font-bold text-slate-700 focus:ring-1 focus:ring-blue-500"
                                  value={range.end}
                                  onChange={(e) => setCustomRanges({
                                    ...customRanges,
                                    [day]: { ...range, end: e.target.value }
                                  })}
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Selected Summary Section */}
            {selectedDays.length > 0 && (
              <div className="pt-6 border-t border-slate-100">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Selected Unavailable Times</h4>
                  <button 
                    type="button" 
                    onClick={() => {
                      setSelectedDays([]);
                      setCustomRanges({});
                    }}
                    className="text-[10px] font-black text-rose-500 uppercase tracking-widest hover:underline flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Clear All
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  {selectedDays.map(day => {
                    const range = customRanges[day] || { start: '07:30', end: '17:30', active: false };
                    return (
                      <div 
                        key={day}
                        className={`flex items-center justify-between px-4 py-2.5 rounded-full border ${
                          range.active 
                            ? 'bg-blue-50 border-blue-200 text-blue-700' 
                            : 'bg-rose-50 border-rose-100 text-rose-700'
                        }`}
                      >
                        <span className="text-[10px] font-black uppercase tracking-widest">
                          {day}: {range.active ? `${range.start} – ${range.end}` : '07:30 – 17:30'}
                        </span>
                        <button 
                          type="button"
                          onClick={() => setSelectedDays(selectedDays.filter(d => d !== day))}
                          className="hover:scale-110 transition-transform"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="pt-10 flex justify-end items-center gap-8">
            <button
              type="button"
              onClick={handleCloseModal}
              className="text-[11px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-[0.25em] transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-14 py-4 text-[13px] font-black text-white bg-[#1a6b3a] hover:bg-[#14522d] rounded-full shadow-lg shadow-green-100 uppercase tracking-[0.15em] transition-all transform hover:scale-[1.02] active:scale-95 flex items-center justify-center min-w-[200px]"
            >
              {editingTeacher ? 'Update Faculty' : 'Add Faculty'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isAvailabilityModalOpen}
        onClose={() => setIsAvailabilityModalOpen(false)}
        title={`Availability: ${selectedTeacher?.name}`}
      >
        <div className="space-y-6">
          <div className="bg-amber-50/50 border border-amber-200 p-5 rounded-3xl flex items-start space-x-4">
            <div className="bg-white p-2 rounded-xl shadow-sm">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <p className="text-sm text-amber-900 font-medium leading-relaxed">
              Define time windows where this faculty is <span className="font-black text-amber-700">unavailable</span>. The AI Scheduling Engine will strictly avoid assigning classes during these hours.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Currently Blocked</h4>
              <div className="h-px flex-1 bg-slate-100"></div>
            </div>

            {unavailability.length === 0 ? (
              <div className="py-12 text-center border-2 border-dashed border-slate-100 rounded-[2.5rem]">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Calendar className="w-8 h-8 text-slate-200" />
                </div>
                <p className="text-slate-400 text-sm font-black uppercase tracking-widest">No blocked times set</p>
              </div>
            ) : (
              <div className="space-y-3">
                {unavailability.map((block, idx) => (
                  <div key={idx} className="group flex items-center justify-between p-4 bg-white border border-slate-200 rounded-[1.5rem] shadow-sm hover:border-green-200 transition-all">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-slate-50 text-slate-900 rounded-2xl flex items-center justify-center font-black text-xs shadow-inner">
                        {block.day_of_week?.substring(0,3).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-black text-slate-900">{block.day_of_week}</p>
                        <p className="text-xs text-slate-500 font-bold tracking-tight">{block.start_time} — {block.end_time}</p>
                      </div>
                    </div>
                    <button className="text-slate-400 hover:text-rose-600 font-black text-xs uppercase tracking-widest p-3 transition-colors opacity-0 group-hover:opacity-100">Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-6 border-t border-slate-100">
            <button className="w-full bg-slate-900 hover:bg-slate-800 text-white py-4.5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center space-x-2 transition-all transform hover:-translate-y-1 shadow-xl active:scale-95">
              <Plus className="w-5 h-5" />
              <span>Add Blocked Window</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
