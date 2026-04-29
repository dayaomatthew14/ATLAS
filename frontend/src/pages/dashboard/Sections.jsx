import React, { useState, useEffect } from 'react';
import { Plus, Layers, Users, GraduationCap, Trash2, Edit, Group } from 'lucide-react';
import Table from '../../components/Table';
import Modal from '../../components/Modal';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';

export default function Sections() {
  const { addToast } = useToast();
  const [sections, setSections] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSection, setEditingSection] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    year_level: '1',
    student_count: 0,
    curriculum: '2024 Revised'
  });

  const columns = [
    {
      key: 'name',
      label: 'Section Name',
      render: (item) => (
        <div className="flex items-center">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 mr-4 font-black text-xs shadow-inner border border-indigo-100/50">
            {item.name.substring(0, 2)}
          </div>
          <div>
            <p className="font-black text-slate-900 uppercase tracking-tight">{item.name}</p>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Year Level {item.year_level}</p>
          </div>
        </div>
      )
    },
    { 
      key: 'student_count', 
      label: 'Enrollment',
      render: (item) => (
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-slate-50 rounded-lg">
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <span className="font-black text-slate-700">{item.student_count} <span className="text-slate-400 font-medium">Students</span></span>
        </div>
      )
    },
    { 
      key: 'curriculum', 
      label: 'Active Curriculum',
      render: (item) => (
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-slate-100/50 border border-slate-200 text-slate-600 rounded-full text-[10px] font-black uppercase tracking-widest">
          <GraduationCap className="w-3 h-3" />
          {item.curriculum}
        </div>
      )
    },
  ];

  const fetchSections = async () => {
    setIsLoading(true);
    try {
      const data = await api.get('/sections');
      setSections(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch sections', error);
      // Fallback data removed to focus on real integration
      setSections([]);
      addToast('Failed to load sections', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSections();
  }, []);

  const handleOpenModal = (section = null) => {
    if (section) {
      setEditingSection(section);
      setFormData({
        name: section.name,
        year_level: section.year_level,
        student_count: section.student_count,
        curriculum: section.curriculum
      });
    } else {
      setEditingSection(null);
      setFormData({ name: '', year_level: '1', student_count: 0, curriculum: '2024 Revised' });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingSection(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingSection) {
        await api.put(`/sections/${editingSection.id}`, formData);
      } else {
        await api.post('/sections', formData);
      }
      fetchSections();
      handleCloseModal();
      addToast(`Section ${editingSection ? 'updated' : 'added'} successfully`, 'success');
    } catch (error) {
      addToast(error.message || 'Error saving section', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this section?')) {
      try {
        await api.delete(`/sections/${id}`);
        fetchSections();
        addToast('Section removed successfully', 'success');
      } catch (error) {
        addToast(error.message || 'Error removing section', 'error');
      }
    }
  };

  return (
    <div className="p-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-indigo-100 p-2.5 rounded-xl shadow-sm">
              <Layers className="w-6 h-6 text-indigo-700" />
            </div>
            <h2 className="text-4xl font-black text-slate-900 tracking-tighter">Student Groups</h2>
          </div>
          <p className="text-slate-500 text-base font-medium">Organize students into logical class sections and manage their academic tracks.</p>
        </div>
        
        <button
          onClick={() => handleOpenModal()}
          className="bg-green-700 hover:bg-green-800 text-white px-8 py-4 rounded-2xl flex items-center shadow-lg transition-all font-black text-sm uppercase tracking-widest transform hover:scale-105 active:scale-95"
        >
          <Plus className="w-6 h-6 mr-2" /> Create Section
        </button>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden p-2">
        <Table
          columns={columns}
          data={sections}
          isLoading={isLoading}
          onEdit={handleOpenModal}
          onDelete={handleDelete}
        />
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingSection ? 'Modify Section Details' : 'Initialize New Section'}
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Section Name</label>
              <input
                type="text"
                required
                placeholder="e.g. BSCS-3A"
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-500 transition-all font-black text-slate-900 placeholder:text-slate-400 placeholder:font-normal"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Academic Year</label>
              <select
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-500 transition-all font-black text-slate-900 appearance-none cursor-pointer"
                value={formData.year_level}
                onChange={(e) => setFormData({ ...formData, year_level: e.target.value })}
              >
                {[1, 2, 3, 4, 5].map(y => <option key={y} value={y}>Year Level {y}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Student Capacity</label>
              <input
                type="number"
                required
                placeholder="0"
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-500 transition-all font-black text-slate-900"
                value={formData.student_count}
                onChange={(e) => setFormData({ ...formData, student_count: parseInt(e.target.value) })}
              />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Applied Curriculum</label>
              <input
                type="text"
                placeholder="e.g. 2024 Revised"
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-500 transition-all font-black text-slate-900 placeholder:text-slate-400 placeholder:font-normal"
                value={formData.curriculum}
                onChange={(e) => setFormData({ ...formData, curriculum: e.target.value })}
              />
            </div>
          </div>

          <div className="pt-6 flex gap-4">
            <button
              type="button"
              onClick={handleCloseModal}
              className="flex-1 py-4 text-sm font-black text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-widest"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-[2] py-4 bg-green-700 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-green-100 hover:bg-green-800 transition-all transform hover:scale-[1.02] active:scale-95"
            >
              {editingSection ? 'Save Changes' : 'Confirm Registration'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
