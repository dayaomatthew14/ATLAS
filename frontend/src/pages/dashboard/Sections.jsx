import React, { useState, useEffect } from 'react';
import { Plus, Layers, Users, GraduationCap, Trash2, Edit } from 'lucide-react';
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
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 mr-4 font-black text-xs">
            {item.name.substring(0, 2)}
          </div>
          <div>
            <p className="font-black text-slate-900 uppercase tracking-tight">{item.name}</p>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Year {item.year_level}</p>
          </div>
        </div>
      )
    },
    { 
      key: 'student_count', 
      label: 'Capacity',
      render: (item) => (
        <div className="flex items-center space-x-2">
          <Users className="w-4 h-4 text-slate-400" />
          <span className="font-bold text-slate-700">{item.student_count} Students</span>
        </div>
      )
    },
    { 
      key: 'curriculum', 
      label: 'Curriculum',
      render: (item) => (
        <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-black uppercase tracking-widest">
          {item.curriculum}
        </span>
      )
    },
  ];

  const fetchSections = async () => {
    setIsLoading(true);
    try {
      const data = await api.get('/sections').catch(() => [
        { id: 1, name: 'BSCS-3A', year_level: '3', student_count: 35, curriculum: '2024 Revised' },
        { id: 2, name: 'BSCS-3B', year_level: '3', student_count: 32, curriculum: '2024 Revised' },
        { id: 3, name: 'BSCS-4A', year_level: '4', student_count: 28, curriculum: '2020 Standard' },
      ]);
      setSections(Array.isArray(data) ? data : []);
    } catch (error) {
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
    <div className="p-10 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tighter uppercase tracking-[0.05em]">Section Management</h2>
          <p className="text-slate-500 text-base font-medium mt-2">Organize students into logical class sections and year levels.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="bg-slate-900 hover:bg-slate-800 text-white px-8 py-4 rounded-2xl flex items-center shadow-2xl shadow-slate-200 transition-all font-black text-sm uppercase tracking-widest transform hover:scale-105 active:scale-95"
        >
          <Plus className="w-6 h-6 mr-2" /> Create New Section
        </button>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden">
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
        title={editingSection ? 'Modify Section' : 'Create New Section'}
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Section Name</label>
              <input
                type="text"
                required
                placeholder="e.g. BSCS-3A"
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-slate-100 transition-all font-bold text-slate-900"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Year Level</label>
              <select
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-slate-100 transition-all font-bold text-slate-900"
                value={formData.year_level}
                onChange={(e) => setFormData({ ...formData, year_level: e.target.value })}
              >
                {[1, 2, 3, 4, 5].map(y => <option key={y} value={y}>Year {y}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Student Count</label>
              <input
                type="number"
                required
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-slate-100 transition-all font-bold text-slate-900"
                value={formData.student_count}
                onChange={(e) => setFormData({ ...formData, student_count: parseInt(e.target.value) })}
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Curriculum</label>
              <input
                type="text"
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-slate-100 transition-all font-bold text-slate-900"
                value={formData.curriculum}
                onChange={(e) => setFormData({ ...formData, curriculum: e.target.value })}
              />
            </div>
          </div>

          <div className="pt-6 flex space-x-4">
            <button
              type="button"
              onClick={handleCloseModal}
              className="flex-1 py-4 text-sm font-black text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-widest"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-slate-100 hover:bg-slate-800 transition-all"
            >
              {editingSection ? 'Apply Changes' : 'Confirm & Create'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
