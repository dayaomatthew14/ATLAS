import React, { useState, useEffect } from 'react';
import { Calendar, CheckCircle2, Plus, Clock, RefreshCw, Trash2, Edit3 } from 'lucide-react';
import api from '../../utils/api';
import Modal from '../../components/Modal';

export default function AcademicSemesters({ addToast }) {
  const [semesters, setSemesters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSemester, setEditingSemester] = useState(null);

  const [formData, setFormData] = useState({
    academic_year: '2026-2027',
    term: '1st Semester',
    is_active: false
  });

  const fetchSemesters = async () => {
    setLoading(true);
    try {
      const data = await api.get('/semesters');
      setSemesters(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch semesters:', err);
      if (addToast) addToast('Failed to load academic terms', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSemesters();
  }, []);

  const handleSetActive = async (sem) => {
    try {
      await api.put(`/semesters/${sem.id}`, {
        is_active: true
      });
      if (addToast) addToast(`Set active semester: ${sem.academic_year} (${sem.term})`, 'success');
      fetchSemesters();
    } catch (err) {
      if (addToast) addToast(err.message || 'Failed to update active semester', 'error');
    }
  };

  const handleOpenCreateModal = () => {
    setEditingSemester(null);
    setFormData({
      academic_year: '2026-2027',
      term: '1st Semester',
      is_active: false
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingSemester) {
        await api.put(`/semesters/${editingSemester.id}`, formData);
        if (addToast) addToast('Semester updated successfully', 'success');
      } else {
        await api.post('/semesters', formData);
        if (addToast) addToast('New academic semester created successfully', 'success');
      }
      setIsModalOpen(false);
      fetchSemesters();
    } catch (err) {
      if (addToast) addToast(err.message || 'Error saving semester', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this academic semester?')) {
      try {
        await api.delete(`/semesters/${id}`);
        if (addToast) addToast('Semester deleted successfully', 'success');
        fetchSemesters();
      } catch (err) {
        if (addToast) addToast(err.message || 'Failed to delete semester', 'error');
      }
    }
  };

  return (
    <div className="p-8 animate-in fade-in duration-700">
      {/* Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-emerald-100 p-2.5 rounded-xl shadow-sm">
              <Calendar className="w-6 h-6 text-emerald-800" />
            </div>
            <h2 className="text-4xl font-black text-slate-900 tracking-tighter">Academic Terms & Semesters</h2>
          </div>
          <p className="text-slate-500 font-bold text-sm">Control the active academic period across all department timetables</p>
        </div>

        <button 
          onClick={handleOpenCreateModal}
          className="flex items-center gap-2 px-6 py-3.5 bg-emerald-800 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-900 transition-all shadow-lg shadow-emerald-900/20"
        >
          <Plus className="w-4 h-4" />
          Add Academic Term
        </button>
      </div>

      {/* Grid of Semesters */}
      {loading ? (
        <div className="p-16 text-center text-slate-400 font-bold text-sm">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-emerald-600" />
          Loading academic terms...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {semesters.map((sem) => (
            <div 
              key={sem.id} 
              className={`p-6 rounded-[2.5rem] border transition-all ${
                sem.is_active 
                  ? 'bg-gradient-to-br from-emerald-950 via-green-900 to-emerald-900 text-white border-emerald-700 shadow-xl shadow-emerald-950/30' 
                  : 'bg-white border-slate-100 shadow-sm text-slate-800 hover:border-slate-200'
              }`}
            >
              <div className="flex justify-between items-start mb-4">
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                  sem.is_active ? 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30' : 'bg-slate-100 text-slate-500'
                }`}>
                  {sem.academic_year}
                </span>

                {sem.is_active ? (
                  <span className="flex items-center gap-1 text-[11px] font-black text-emerald-400 uppercase tracking-widest">
                    <CheckCircle2 className="w-4 h-4" /> Active Term
                  </span>
                ) : (
                  <button
                    onClick={() => handleSetActive(sem)}
                    className="text-xs font-bold text-emerald-600 hover:text-emerald-700 underline"
                  >
                    Set Active
                  </button>
                )}
              </div>

              <h3 className={`text-2xl font-black mb-1 ${sem.is_active ? 'text-white' : 'text-slate-900'}`}>
                {sem.term}
              </h3>
              <p className={`text-xs font-bold mb-6 ${sem.is_active ? 'text-emerald-200/80' : 'text-slate-400'}`}>
                Academic Year {sem.academic_year}
              </p>

              <div className="flex items-center justify-between pt-4 border-t border-white/10">
                <span className={`text-[10px] font-bold ${sem.is_active ? 'text-emerald-300' : 'text-slate-400'}`}>
                  Term ID: #{sem.id}
                </span>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleDelete(sem.id)}
                    className={`p-2 rounded-xl transition-colors ${
                      sem.is_active ? 'text-emerald-300/60 hover:text-rose-400' : 'text-slate-300 hover:text-rose-500'
                    }`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingSemester ? 'Edit Academic Term' : 'Create Academic Term'}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSubmit} className="space-y-6 pt-2">
          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Academic Year</label>
            <input
              type="text"
              required
              placeholder="e.g. 2026-2027"
              className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-emerald-600"
              value={formData.academic_year}
              onChange={(e) => setFormData({ ...formData, academic_year: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Semester Term</label>
            <select
              className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-emerald-600"
              value={formData.term}
              onChange={(e) => setFormData({ ...formData, term: e.target.value })}
            >
              <option value="1st Semester">1st Semester</option>
              <option value="2nd Semester">2nd Semester</option>
              <option value="3rd Semester">3rd Semester</option>
            </select>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="w-5 h-5 text-emerald-600 rounded-lg focus:ring-emerald-500"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
            />
            <span className="text-xs font-black text-slate-700">Set as Active Academic Term</span>
          </label>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="flex-1 py-3.5 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-3.5 bg-emerald-800 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-900 transition-all shadow-lg shadow-emerald-900/20"
            >
              Save Term
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
