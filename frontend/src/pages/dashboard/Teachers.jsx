import React, { useState, useEffect } from 'react';
import { Plus, Users as UsersIcon, Clock, Calendar, ShieldAlert, UserCheck } from 'lucide-react';
import Table from '../../components/Table';
import Modal from '../../components/Modal';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';

export default function Teachers() {
  const { addToast } = useToast();
  const [teachers, setTeachers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'faculty',
    password: '',
    max_units: 18,
    department_id: ''
  });

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
        email: teacher.email,
        role: 'faculty',
        password: '',
        max_units: teacher.max_units || 18,
        department_id: teacher.department_id || ''
      });
    } else {
      setEditingTeacher(null);
      setFormData({ name: '', email: '', role: 'faculty', password: '', max_units: 18, department_id: '' });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTeacher(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingTeacher) {
        await api.put(`/users/${editingTeacher.id}`, formData);
      } else {
        await api.post('/users', formData);
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
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-black text-slate-700 mb-2 uppercase tracking-wide">Full Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Juan Dela Cruz"
                className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all font-bold text-slate-700 placeholder:text-slate-400 placeholder:font-normal"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-black text-slate-700 mb-2 uppercase tracking-wide">Max Units</label>
              <input
                type="number"
                required
                className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all font-bold text-slate-700"
                value={formData.max_units}
                onChange={(e) => setFormData({ ...formData, max_units: e.target.value })}
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-black text-slate-700 mb-2 uppercase tracking-wide">Email Address</label>
            <input
              type="email"
              required
              placeholder="faculty@dlsau.edu.ph"
              className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all font-bold text-slate-700 placeholder:text-slate-400 placeholder:font-normal"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-black text-slate-700 mb-2 uppercase tracking-wide">
              {editingTeacher ? 'New Password' : 'Password'}
            </label>
            <input
              type="password"
              placeholder={editingTeacher ? 'Leave blank to keep current' : '••••••••'}
              required={!editingTeacher}
              className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all font-bold text-slate-700 placeholder:text-slate-400 placeholder:font-normal"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          </div>

          <div className="pt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={handleCloseModal}
              className="px-6 py-3.5 text-sm font-black text-slate-500 hover:bg-slate-50 rounded-2xl uppercase tracking-widest transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-10 py-3.5 text-sm font-black text-white bg-green-700 hover:bg-green-800 rounded-2xl shadow-lg uppercase tracking-widest transition-all transform hover:scale-105 active:scale-95"
            >
              {editingTeacher ? 'Update Profile' : 'Register Faculty'}
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
