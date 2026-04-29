import React, { useState, useEffect } from 'react';
import { Plus, Upload, Edit, Trash2, BookOpen, GraduationCap } from 'lucide-react';
import Modal from '../../components/Modal';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';

export default function Curriculum() {
  const { addToast } = useToast();
  const [curriculum, setCurriculum] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [selectedCourse, setSelectedCourse] = useState('All');
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    units: '',
    type: 'lecture',
    department_id: '',
    year: '',
    semester: '1st',
    course: 'BSCS',
    lec_units: 0,
    lab_units: 0,
    pre_requisites: ''
  });

  const columns = [
    { key: 'code', label: 'Code' },
    { key: 'name', label: 'Subject Name' },
    { key: 'units', label: 'Units' },
    {
      key: 'type',
      label: 'Type',
      render: (item) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${item.type === 'lecture' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
          }`}>
          {item.type}
        </span>
      )
    },
  ];

  const fetchCurriculum = async () => {
    setIsLoading(true);
    try {
      const data = await api.get('/curriculum');
      setCurriculum(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch curriculum', error);
      setCurriculum([]);
      addToast('Failed to load curriculum', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      addToast('Uploading and processing curriculum file...', 'info');
      const response = await api.post('/curriculum/upload', formData);
      addToast(`Successfully added ${response.added} subjects. Previous data for ${response.course} was cleared.`, 'success');
      
      await fetchCurriculum();
      
      if (response.course && response.course !== 'Unknown') {
        setSelectedCourse(response.course);
      }
    } catch (error) {
      addToast(error.message || 'Error uploading file', 'error');
    }
    // Clear the input
    event.target.value = '';
  };

  useEffect(() => {
    fetchCurriculum();
  }, []);

  const handleOpenModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        code: item.code,
        name: item.name,
        units: item.units,
        type: item.type,
        department_id: item.department_id || '',
        year: item.year || '',
        semester: item.semester || '1st',
        course: item.course || 'BSCS',
        lec_units: item.lec_units || 0,
        lab_units: item.lab_units || 0,
        pre_requisites: item.pre_requisites || ''
      });
    } else {
      setEditingItem(null);
      setFormData({ 
        code: '', 
        name: '', 
        units: '', 
        type: 'lecture', 
        department_id: '',
        year: '',
        semester: '1st',
        course: 'BSCS',
        lec_units: 0,
        lab_units: 0,
        pre_requisites: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await api.put(`/curriculum/${editingItem.id}`, formData);
      } else {
        await api.post('/curriculum', formData);
      }
      await fetchCurriculum();
      handleCloseModal();
      addToast(`Curriculum item ${editingItem ? 'updated' : 'created'} successfully`, 'success');
      
      // Auto-select the course we just added/edited so the user sees it immediately
      if (formData.course) {
        setSelectedCourse(formData.course);
      }
    } catch (error) {
      addToast(error.message || 'Error saving curriculum item', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this curriculum item?')) {
      try {
        await api.delete(`/curriculum/${id}`);
        fetchCurriculum();
        addToast('Curriculum item deleted successfully', 'success');
      } catch (error) {
        addToast(error.message || 'Error deleting item', 'error');
      }
    }
  };

  const handleDeleteCourse = async (courseName, e) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to completely delete the ${courseName} curriculum? This will remove all subjects and cannot be undone.`)) {
      try {
        await api.delete(`/curriculum/course/${courseName}`);
        await fetchCurriculum();
        if (selectedCourse === courseName) {
          setSelectedCourse('All');
        }
        addToast(`Curriculum ${courseName} deleted successfully`, 'success');
      } catch (error) {
        addToast(error.message || 'Error deleting curriculum', 'error');
      }
    }
  };

  const availableCourses = [...new Set(curriculum.map(s => s.course).filter(Boolean))].sort();

  const filteredCurriculum = selectedCourse === 'All' 
    ? curriculum 
    : curriculum.filter(s => s.course === selectedCourse);

  const groupedByYear = {};
  filteredCurriculum.forEach(s => {
    const year = s.year || 'Unassigned';
    const sem = s.semester || '1st';
    if (!groupedByYear[year]) groupedByYear[year] = {};
    if (!groupedByYear[year][sem]) groupedByYear[year][sem] = [];
    groupedByYear[year][sem].push(s);
  });

  const SemesterTable = ({ semester, data }) => {
    const totalUnits = data.reduce((sum, s) => sum + (s.units || 0), 0);
    
    return (
      <div className="flex-1 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col hover:shadow-md transition-shadow">
        <div className="bg-slate-50/80 backdrop-blur-sm px-5 py-4 border-b border-slate-200 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${semester === '1st' ? 'bg-blue-500' : semester === '2nd' ? 'bg-indigo-500' : 'bg-amber-500'}`}></div>
            <h4 className="font-black text-slate-800 uppercase tracking-[0.1em] text-xs">
              {semester === 'summer' ? 'Summer Term' : `${semester} Semester`}
            </h4>
          </div>
          <span className="bg-slate-200/50 text-slate-700 text-[10px] font-black px-3 py-1.5 rounded-lg uppercase tracking-wider">
            {totalUnits} Units
          </span>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50/30">
                <th className="px-5 py-3 font-black text-slate-400 text-[10px] uppercase tracking-widest w-24">Code</th>
                <th className="px-5 py-3 font-black text-slate-400 text-[10px] uppercase tracking-widest">Description</th>
                <th className="px-3 py-3 font-black text-slate-400 text-[10px] uppercase tracking-widest w-16 text-center">Lec</th>
                <th className="px-3 py-3 font-black text-slate-400 text-[10px] uppercase tracking-widest w-16 text-center">Lab</th>
                <th className="px-3 py-3 font-black text-slate-400 text-[10px] uppercase tracking-widest w-16 text-center">Units</th>
                <th className="px-5 py-3 font-black text-slate-400 text-[10px] uppercase tracking-widest w-32 text-center">Pre-requisite</th>
                <th className="px-5 py-3 font-black text-slate-400 text-[10px] uppercase tracking-widest w-20 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.sort((a, b) => a.code.localeCompare(b.code)).map(subj => (
                <tr key={subj.id} className="hover:bg-slate-50/80 transition-colors group">
                  <td className="px-5 py-4 font-bold text-slate-900 align-top">{subj.code}</td>
                  <td className="px-5 py-4 text-slate-600 font-semibold leading-tight align-top">
                    {subj.name}
                    <div className="mt-1 flex space-x-2">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-black ${subj.type === 'lecture' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                        {subj.type}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-4 text-slate-900 font-bold text-center align-top">{subj.lec_units}</td>
                  <td className="px-3 py-4 text-slate-900 font-bold text-center align-top">{subj.lab_units}</td>
                  <td className="px-3 py-4 text-slate-900 font-black text-center align-top">{subj.units}</td>
                  <td className="px-5 py-4 text-slate-600 font-medium text-center align-top text-xs">{subj.pre_requisites || 'NONE'}</td>
                  <td className="px-5 py-4 text-right align-top">
                    <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                       <button 
                        onClick={() => handleOpenModal(subj)} 
                        className="text-slate-400 hover:text-blue-600 p-1.5 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit Item"
                       >
                         <Edit className="w-4 h-4" />
                       </button>
                       <button 
                        onClick={() => handleDelete(subj.id)} 
                        className="text-slate-400 hover:text-rose-600 p-1.5 hover:bg-rose-50 rounded-lg ml-1 transition-colors"
                        title="Delete Item"
                       >
                         <Trash2 className="w-4 h-4" />
                       </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-3 bg-green-600 rounded-2xl shadow-lg shadow-green-200">
              <BookOpen className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-5xl font-black text-slate-900 tracking-tighter">
              {selectedCourse === 'All' ? 'Academic Curriculum' : `${selectedCourse} Curriculum`}
            </h2>
          </div>
          <p className="text-slate-500 text-lg font-medium">
            {selectedCourse === 'All' 
              ? 'Manage and visualize course requirements for all programs.'
              : `Manage and visualize course requirements for the ${selectedCourse} program.`}
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-4 bg-white p-3 rounded-[2.5rem] shadow-xl shadow-slate-100 border border-slate-100">
          <div className="flex items-center px-4 space-x-3 border-r border-slate-100">
            <GraduationCap className="w-5 h-5 text-slate-400" />
            <select 
              value={selectedCourse} 
              onChange={(e) => setSelectedCourse(e.target.value)}
              className="py-2 bg-transparent focus:outline-none font-black text-slate-700 text-sm uppercase tracking-widest cursor-pointer"
            >
              <option value="All">All Courses</option>
              {availableCourses.map(course => (
                <option key={course} value={course}>{course}</option>
              ))}
            </select>
          </div>
          
          <div className="flex items-center space-x-2 px-2">
            <input 
              type="file" 
              id="excel-upload" 
              accept=".xlsx, .xls" 
              className="hidden" 
              onChange={handleFileUpload}
            />
            <button
              onClick={() => document.getElementById('excel-upload').click()}
              className="bg-slate-50 hover:bg-slate-100 text-slate-600 px-5 py-3 rounded-2xl flex items-center transition-all font-black text-xs uppercase tracking-widest border border-slate-200"
            >
              <Upload className="w-4 h-4 mr-2" /> Import
            </button>
            <button
              onClick={() => handleOpenModal()}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-2xl flex items-center shadow-lg shadow-green-200 transition-all font-black text-xs uppercase tracking-widest transform hover:scale-105 active:scale-95"
            >
              <Plus className="w-5 h-5 mr-1" /> Add Item
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
        </div>
      ) : selectedCourse === 'All' && availableCourses.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {availableCourses.map(course => {
            const courseSubjects = curriculum.filter(s => s.course === course);
            const totalUnits = courseSubjects.reduce((sum, s) => sum + (s.units || 0), 0);
            return (
              <div 
                key={course}
                onClick={() => setSelectedCourse(course)}
                className="bg-white rounded-[2rem] border border-slate-200 p-8 cursor-pointer hover:shadow-2xl shadow-sm hover:shadow-green-900/5 hover:border-green-200 transition-all duration-300 transform hover:-translate-y-2 group relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-green-50 to-transparent rounded-bl-full opacity-50 transition-transform group-hover:scale-110"></div>
                
                <button
                  onClick={(e) => handleDeleteCourse(course, e)}
                  className="absolute top-6 right-6 z-20 p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-full transition-all opacity-0 group-hover:opacity-100 transform hover:scale-110"
                  title="Delete Curriculum"
                >
                  <Trash2 className="w-5 h-5" />
                </button>

                <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-green-50 group-hover:border-green-100 transition-colors relative z-10 shadow-sm group-hover:shadow-green-100">
                  <BookOpen className="w-8 h-8 text-slate-400 group-hover:text-green-600 transition-colors" />
                </div>
                <h3 className="text-2xl font-black text-slate-800 mb-4 tracking-tight relative z-10 group-hover:text-green-700 transition-colors">{course} Curriculum</h3>
                <div className="flex items-center space-x-3 text-xs font-black text-slate-500 uppercase tracking-wider relative z-10">
                  <span className="bg-slate-100/80 backdrop-blur-sm px-4 py-2 rounded-xl group-hover:bg-green-50 group-hover:text-green-700 transition-colors">{courseSubjects.length} Subjects</span>
                  <span className="bg-slate-100/80 backdrop-blur-sm px-4 py-2 rounded-xl group-hover:bg-green-50 group-hover:text-green-700 transition-colors">{totalUnits} Units</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : Object.keys(groupedByYear).length === 0 ? (
        <div className="bg-white rounded-[2rem] border-2 border-dashed border-slate-200 p-20 text-center">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <BookOpen className="w-10 h-10 text-slate-300" />
          </div>
          <h3 className="text-2xl font-black text-slate-800">No subjects found</h3>
          <p className="text-slate-500 font-medium mt-2 max-w-md mx-auto">Upload an Excel file or manually add subjects to start building the curriculum.</p>
        </div>
      ) : (
        <div className="space-y-12">
          {Object.keys(groupedByYear).sort().map(yearKey => (
            <div key={yearKey} className="relative">
              <div className="flex items-center space-x-4 mb-6">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-200 to-transparent"></div>
                <h3 className="text-2xl font-black text-slate-400 uppercase tracking-[0.3em] px-4">
                  {yearKey === 'Unassigned' ? yearKey : `${yearKey}${yearKey === '1' ? 'st' : yearKey === '2' ? 'nd' : yearKey === '3' ? 'rd' : 'th'} Year`}
                </h3>
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-200 to-transparent"></div>
              </div>
              
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {groupedByYear[yearKey]['1st'] && (
                  <SemesterTable semester="1st" data={groupedByYear[yearKey]['1st']} />
                )}
                {groupedByYear[yearKey]['2nd'] && (
                  <SemesterTable semester="2nd" data={groupedByYear[yearKey]['2nd']} />
                )}
                {groupedByYear[yearKey]['summer'] && (
                  <div className="xl:col-span-2">
                    <SemesterTable semester="summer" data={groupedByYear[yearKey]['summer']} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingItem ? 'Edit Curriculum Item' : 'Add New Curriculum Item'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Code</label>
              <input
                type="text"
                required
                placeholder="e.g. CS101"
                className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Units</label>
              <input
                type="number"
                required
                className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
                value={formData.units}
                onChange={(e) => setFormData({ ...formData, units: e.target.value ? parseInt(e.target.value) : '' })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Lec Units</label>
              <input
                type="number"
                required
                className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
                value={formData.lec_units}
                onChange={(e) => setFormData({ ...formData, lec_units: e.target.value ? parseInt(e.target.value) : 0 })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Lab Units</label>
              <input
                type="number"
                required
                className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
                value={formData.lab_units}
                onChange={(e) => setFormData({ ...formData, lab_units: e.target.value ? parseInt(e.target.value) : 0 })}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Subject Name</label>
            <input
              type="text"
              required
              className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Type</label>
            <select
              className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            >
              <option value="lecture">Lecture</option>
              <option value="lab">Lab</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Course</label>
            <input
              list="course-options"
              type="text"
              required
              className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
              value={formData.course}
              onChange={(e) => setFormData({ ...formData, course: e.target.value.toUpperCase() })}
              placeholder="e.g. BSCS"
            />
            <datalist id="course-options">
              {availableCourses.map(course => (
                <option key={course} value={course} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Pre-requisite</label>
            <input
              type="text"
              placeholder="e.g. CS101 or NONE"
              className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
              value={formData.pre_requisites}
              onChange={(e) => setFormData({ ...formData, pre_requisites: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Year Level (e.g. 1)</label>
              <input
                type="number"
                className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
                value={formData.year}
                onChange={(e) => setFormData({ ...formData, year: e.target.value ? parseInt(e.target.value) : '' })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Semester</label>
              <select
                className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
                value={formData.semester}
                onChange={(e) => setFormData({ ...formData, semester: e.target.value })}
              >
                <option value="1st">1st Semester</option>
                <option value="2nd">2nd Semester</option>
                <option value="summer">Summer</option>
              </select>
            </div>
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
              {editingItem ? 'Update' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
