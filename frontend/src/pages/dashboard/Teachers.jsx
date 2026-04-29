import React, { useState, useEffect } from 'react';
import { Plus, Users as UsersIcon, Clock, Calendar, ShieldAlert } from 'lucide-react';
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
      label: 'Prof Name',
      render: (item) => (
        <div className="flex items-center">
          <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 mr-3">
            <UsersIcon className="w-4 h-4" />
          </div>
          <span className="font-medium text-gray-900">{item.name}</span>
        </div>
      )
    },
    {
      key: 'type',
      label: 'Type',
      render: (item) => {
        const maxUnits = item.max_units || 18;
        const typeStr = maxUnits >= 18 ? 'Full Time' : 'Part Time';
        return (
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${typeStr === 'Full Time' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
            }`}>
            {typeStr}
          </span>
        );
      }
    },
    {
      key: 'load',
      label: 'Max Load',
      render: (item) => (
        <span className="font-bold text-slate-700 text-sm uppercase tracking-widest">{item.max_units || 18} Units</span>
      )
    },
    {
      key: 'availability',
      label: 'Time Unavailable',
      render: (item) => (
        <button
          onClick={() => handleOpenAvailability(item)}
          className="flex items-center space-x-2 px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 transition-all font-bold text-xs uppercase"
        >
          <Clock className="w-3.5 h-3.5" />
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
    // In a real scenario, we would fetch unavailability here
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
      const nameParts = formData.name.trim().split(' ');
      const firstName = nameParts[0] || 'Unknown';
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Professor';
      
      const payload = {
        first_name: firstName,
        last_name: lastName,
        email: formData.email,
        role: formData.role || 'faculty',
        department: localStorage.getItem('atlas_department') || 'CAST',
        max_units: parseInt(formData.max_units) || 18,
      };

      if (!editingTeacher) {
        payload.password = formData.password;
      } else if (formData.password) {
        payload.password = formData.password;
      }

      if (editingTeacher) {
        await api.put(`/users/${editingTeacher.id}`, payload);
      } else {
        await api.post('/users/', payload);
      }
      fetchTeachers();
      handleCloseModal();
      addToast(`Professor ${editingTeacher ? 'updated' : 'added'} successfully`, 'success');
    } catch (error) {
      addToast(error.message || 'Error saving professor', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this professor?')) {
      try {
        await api.delete(`/users/${id}`);
        fetchTeachers();
        addToast('Professor removed successfully', 'success');
      } catch (error) {
        addToast(error.message || 'Error removing professor', 'error');
      }
    }
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tighter">Manage Professors</h2>
          <p className="text-slate-500 text-base font-medium mt-2">Manage faculty members and their teaching loads.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="bg-green-700 hover:bg-green-800 text-white px-8 py-4 rounded-2xl flex items-center shadow-lg transition-all font-black text-sm uppercase tracking-widest transform hover:scale-105"
        >
          <Plus className="w-6 h-6 mr-2" /> Add Professor
        </button>
      </div>

      <Table
        columns={columns}
        data={teachers}
        isLoading={isLoading}
        onEdit={handleOpenModal}
        onDelete={handleDelete}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingTeacher ? 'Edit Professor' : 'Add New Professor'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Full Name</label>
              <input
                type="text"
                required
                className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Max Units</label>
              <input
                type="number"
                required
                className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
                value={formData.max_units}
                onChange={(e) => setFormData({ ...formData, max_units: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Email Address</label>
            <input
              type="email"
              required
              className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              {editingTeacher ? 'New Password (leave blank to keep current)' : 'Password'}
            </label>
            <input
              type="password"
              required={!editingTeacher}
              className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          </div>
          <div className="pt-4 flex justify-end space-x-3">
            <button
              type="button"
              onClick={handleCloseModal}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 border border-gray-300 rounded-md shadow-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-green-700 hover:bg-green-800 rounded-md shadow-sm"
            >
              {editingTeacher ? 'Update Professor' : 'Save Professor'}
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
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-start space-x-3">
            <Clock className="w-5 h-5 text-amber-600 mt-0.5" />
            <p className="text-sm text-amber-800 font-medium leading-relaxed">
              Define time windows where this faculty is <strong>unavailable</strong>. The AI Scheduling Engine will strictly avoid assigning classes during these hours.
            </p>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Currently Blocked</h4>
            {unavailability.length === 0 ? (
              <div className="py-8 text-center border-2 border-dashed border-slate-100 rounded-3xl">
                <Calendar className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-slate-400 text-sm font-bold uppercase tracking-tight">No blocked times set</p>
              </div>
            ) : (
              <div className="space-y-2">
                {unavailability.map((block, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center font-black text-xs">
                        {block.day_of_week?.substring(0, 3)}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">{block.day_of_week}</p>
                        <p className="text-xs text-slate-500 font-medium">{block.start_time} - {block.end_time}</p>
                      </div>
                    </div>
                    <button className="text-rose-600 hover:text-rose-800 font-bold text-xs uppercase tracking-widest p-2">Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100">
            <button className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center space-x-2 hover:bg-slate-800 transition-all">
              <Plus className="w-5 h-5" />
              <span>Add Blocked Window</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
