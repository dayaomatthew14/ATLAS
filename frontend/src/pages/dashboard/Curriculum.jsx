import React, { useState, useEffect } from 'react';
import { Plus, Upload, Edit, Trash2, BookOpen, GraduationCap, AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import Modal from '../../components/Modal';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';

export default function Curriculum() {
  const { addToast } = useToast();
  const [curriculum, setCurriculum] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [selectedCourse, setSelectedCourse] = useState('All');
  const [selectedBlock, setSelectedBlock] = useState(null);
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
  const [isImportReviewOpen, setIsImportReviewOpen] = useState(false);
  const [importReport, setImportReport] = useState(null);
  const [isImporting, setIsImporting] = useState(false);

  const [isCreateBlockModalOpen, setIsCreateBlockModalOpen] = useState(false);
  const role = (localStorage.getItem('atlas_role') || 'guest').toLowerCase();
  const canManage = role === 'admin';

  const handleStatusChange = async (blockId, newStatus, e) => {
    if (e) e.stopPropagation();
    try {
      const formData = new FormData();
      formData.append('status', newStatus);
      await api.patch(`/curriculum/blocks/${blockId}/status`, formData);
      addToast(`Curriculum status updated to ${newStatus} ✨`, 'success');
      const updatedBlocks = await api.get('/curriculum/blocks');
      setBlocks(Array.isArray(updatedBlocks) ? updatedBlocks : []);
      if (selectedBlock?.id === blockId) {
        setSelectedBlock(prev => ({ ...prev, status: newStatus }));
      }
    } catch (err) {
      addToast(err.message || 'Failed to update status', 'error');
    }
  };

  const handleSelectCurriculum = (block) => {
    if (!block) return;
    localStorage.setItem('atlas_selected_curriculum_id', String(block.id));
    localStorage.setItem('atlas_selected_program', block.program_name);
    addToast(`Selected ${block.program_name} (${block.academic_year}) as active curriculum context! ✨`, 'success');
  };

  const handleCreateBlock = async (e) => {
    e.preventDefault();
    if (!blockFormData.program_name.trim()) {
      addToast('Program name is required', 'warning');
      return;
    }
    try {
      setIsLoading(true);
      const res = await api.post('/curriculum/blocks', {
        program_name: blockFormData.program_name.trim().toUpperCase(),
        academic_year: blockFormData.academic_year.trim(),
        department_id: parseInt(blockFormData.department_id) || 1
      });
      addToast(`Curriculum block for ${res.program_name} created successfully! ✨`, 'success');
      setIsCreateBlockModalOpen(false);
      setBlockFormData({ program_name: '', academic_year: 'AY 2026-2027', department_id: 1 });
      
      const updatedBlocks = await api.get('/curriculum/blocks');
      setBlocks(Array.isArray(updatedBlocks) ? updatedBlocks : []);
      const newBlock = (updatedBlocks || []).find(b => b.id === res.id) || res;
      setSelectedBlock(newBlock);
      setSelectedCourse(newBlock.program_name);
    } catch (err) {
      addToast(err.response?.data?.detail || err.message || 'Failed to create curriculum block', 'error');
    } finally {
      setIsLoading(false);
    }
  };

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

  const normalizeYear = (value) => {
    if (value === null || value === undefined) return '';
    const s = String(value).trim().toUpperCase();
    if (!s || s === 'NAN' || s === 'NONE' || s === 'N/A') return '';
    const m = s.match(/\b([1-5])\b/);
    if (m) return m[1];
    if (s.includes('FIRST')) return '1';
    if (s.includes('SECOND')) return '2';
    if (s.includes('THIRD')) return '3';
    if (s.includes('FOURTH')) return '4';
    if (s.includes('FIFTH')) return '5';
    return '';
  };

  const normalizeSemester = (value) => {
    if (value === null || value === undefined) return '1st';
    const s = String(value).trim().toUpperCase();
    if (!s || s === 'NAN' || s === 'NONE' || s === 'N/A') return '1st';
    if (s.includes('3RD SEMESTER') || s.includes('MIDYEAR')) return '3rd semester';
    const m = s.match(/\b([123])\b/);
    if (m) return ({ '1': '1st', '2': '2nd', '3': '3rd' }[m[1]]);
    if (s.includes('III')) return '3rd';
    if (s.includes('II')) return '2nd';
    if (s.match(/\bI\b/)) return '1st';
    if (s.includes('1ST') || s.includes('FIRST')) return '1st';
    if (s.includes('2ND') || s.includes('SECOND')) return '2nd';
    if (s.includes('3RD') || s.includes('THIRD')) return '3rd';
    return '1st';
  };

  const fetchCurriculum = async () => {
    setIsLoading(true);
    try {
      if (selectedCourse === 'All') {
        const data = await api.get('/curriculum/blocks');
        setBlocks(Array.isArray(data) ? data : []);
      } else if (selectedBlock) {
        const data = await api.get(`/curriculum?block_id=${selectedBlock.id}`);
        const mappedData = (Array.isArray(data) ? data : []).map(item => ({
          ...item,
          course: item.program_code || item.course,
          year: normalizeYear(item.year_level || item.year),
          semester: normalizeSemester(item.semester_term || item.semester),
          pre_requisites: item.pre_requisite || item.pre_requisites
        }));
        setCurriculum(mappedData);
      }
    } catch (error) {
      console.error('Failed to fetch curriculum', error);
      setCurriculum([]);
      setBlocks([]);
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
    formData.append('dry_run', 'true');
    
    // Fix 1 — Ask for program name before importing
    let targetProgram = selectedCourse !== 'All' ? selectedCourse : null;
    
    if (!targetProgram) {
      targetProgram = window.prompt("Please enter the Program Name (e.g., BSIT, BSCE, BSCS):", "BSCS");
      if (!targetProgram) {
        addToast('Import cancelled: Program name is required.', 'warning');
        event.target.value = '';
        return;
      }
    }
    
    formData.append('program_code', targetProgram.toUpperCase());

    try {
      setIsImporting(true);
      addToast('Analyzing curriculum file...', 'info');
      // Using /import instead of /upload for dry-run support
      const response = await api.post('/curriculum/import', formData);
      
      setImportReport(response);
      setIsImportReviewOpen(true);
      addToast('Analysis complete. Please review the data.', 'success');
    } catch (error) {
      addToast(error.message || 'Error analyzing file', 'error');
    } finally {
      setIsImporting(false);
      event.target.value = '';
    }
  };

  const handleConfirmImport = async () => {
    if (!importReport || !importReport.report) return;

    try {
      setIsImporting(true);
      addToast('Committing curriculum to database...', 'info');
      
      // Send the parsed and validated items to the bulk endpoint using the new Block Isolation payload
      const payload = {
        block_id: selectedBlock?.id || null,
        program_name: importReport.summary.program_name || selectedBlock?.program_name || 'Unknown Program',
        academic_year: importReport.summary.academic_year || selectedBlock?.academic_year || 'Unknown AY',
        department_id: importReport.report[0]?.department_id || selectedBlock?.department_id || 1,
        items: importReport.report
      };
      await api.post('/curriculum/bulk', payload);
      
      addToast(`Successfully imported ${importReport.report.length} subjects.`, 'success');
      setIsImportReviewOpen(false);
      setImportReport(null);
      if (importReport.course && importReport.course !== 'Unknown') {
        setSelectedCourse(importReport.course);
        // We'll need to find the new block ID after re-fetching
        const updatedBlocks = await api.get('/curriculum/blocks');
        setBlocks(updatedBlocks);
        const newBlock = updatedBlocks.find(b => b.program_name.includes(importReport.course) || b.program_name === importReport.summary.program_name);
        if (newBlock) setSelectedBlock(newBlock);
      } else {
        await fetchCurriculum();
      }
    } catch (error) {
      addToast(error.message || 'Error committing import', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  useEffect(() => {
    fetchCurriculum();
  }, [selectedCourse, selectedBlock]);

  const handleOpenModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        code: item.code || '',
        name: item.name || '',
        units: item.units || 3,
        type: item.type || 'lecture',
        department_id: item.department_id || 1,
        year: item.year || '1',
        semester: item.semester || '1st',
        course: item.course || (selectedCourse !== 'All' ? selectedCourse : 'BSCS'),
        lec_units: item.lec_units || 3,
        lab_units: item.lab_units || 0,
        pre_requisites: item.pre_requisites || '',
        block_id: item.block_id || selectedBlock?.id || null
      });
    } else {
      setEditingItem(null);
      const defaultCourse = selectedCourse !== 'All' ? selectedCourse : (selectedBlock?.program_name?.split(' ')[0] || 'BSCS');
      setFormData({ 
        code: '', 
        name: '', 
        units: 3, 
        type: 'lecture', 
        department_id: 1,
        year: '1',
        semester: '1st',
        course: defaultCourse,
        lec_units: 3,
        lab_units: 0,
        pre_requisites: '',
        block_id: selectedBlock?.id || null
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
      const unitsNum = parseInt(formData.units) || (parseInt(formData.lec_units) || 0) + (parseInt(formData.lab_units) || 0);
      const backendPayload = {
        code: (formData.code || '').trim(),
        name: (formData.name || '').trim(),
        units: unitsNum > 0 ? unitsNum : 3,
        type: formData.type || 'lecture',
        department_id: parseInt(formData.department_id) || 1,
        lec_units: parseInt(formData.lec_units) || 0,
        lab_units: parseInt(formData.lab_units) || 0,
        program_code: (formData.course || 'BSCS').trim(),
        year_level: formData.year ? String(formData.year) : '1',
        semester_term: formData.semester || '1st',
        pre_requisite: formData.pre_requisites || null,
        block_id: selectedBlock?.id || formData.block_id || null
      };

      if (editingItem) {
        await api.put(`/curriculum/${editingItem.id}`, backendPayload);
      } else {
        await api.post('/curriculum', backendPayload);
      }
      await fetchCurriculum();
      handleCloseModal();
      addToast(`Curriculum subject ${editingItem ? 'updated' : 'created'} successfully! ✨`, 'success');
      
      if (formData.course && formData.course !== selectedCourse) {
        setSelectedCourse(formData.course);
      }
    } catch (error) {
      console.error('Save curriculum error:', error);
      addToast(error.response?.data?.detail || error.message || 'Error saving curriculum subject', 'error');
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

  const handleDeleteCourse = async (blockId, programName, e) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to completely delete the ${programName} curriculum? This will remove all subjects and cannot be undone.`)) {
      try {
        await api.delete(`/curriculum/block/${blockId}`);
        await fetchCurriculum();
        if (selectedBlock?.id === blockId) {
          setSelectedCourse('All');
          setSelectedBlock(null);
        }
        addToast(`Curriculum ${programName} deleted successfully`, 'success');
      } catch (error) {
        addToast(error.message || 'Error deleting curriculum', 'error');
      }
    }
  };

  const availableCourses = [...new Set(blocks.map(b => b.program_name).filter(Boolean))].sort();

  const filteredCurriculum = curriculum;

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
            <div className={`w-2 h-2 rounded-full ${semester === '1st' ? 'bg-blue-500' : semester === '2nd' ? 'bg-indigo-500' : semester === '3rd' ? 'bg-purple-500' : 'bg-amber-500'}`}></div>
            <h4 className="font-black text-slate-800 uppercase tracking-[0.1em] text-xs">
              {semester === '3rd semester' ? '3rd Semester Term' : `${semester} Semester`}
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
                {canManage && <th className="px-5 py-3 font-black text-slate-400 text-[10px] uppercase tracking-widest w-20 text-right">Actions</th>}
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
                  {canManage && (
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
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="px-12 py-12 w-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-20 gap-12">
        <div>
          <span className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Academic Operations</span>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight mt-1">Curriculum Flowchart Master</h1>
          <p className="text-slate-500 font-semibold text-sm mt-1">
            {canManage ? 'Admin Master Management — Flowcharts, Subjects, Status & Excel Import' : 'Browse published curricula and select active curriculum context for scheduling.'}
          </p>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="bg-slate-100 p-1.5 rounded-2xl flex items-center border border-slate-200/60 shadow-inner">
            <select 
              value={selectedCourse} 
              onChange={(e) => {
                const val = e.target.value;
                setSelectedCourse(val);
                if (val !== 'All') {
                  const b = blocks.find(x => x.program_name === val);
                  if (b) setSelectedBlock(b);
                } else {
                  setSelectedBlock(null);
                }
              }}
              className="py-2 bg-transparent focus:outline-none font-black text-slate-700 text-sm uppercase tracking-widest cursor-pointer px-2"
            >
              <option value="All">All Courses</option>
              {availableCourses.map(course => (
                <option key={course} value={course}>{course}</option>
              ))}
            </select>
          </div>
          
          <div className="flex items-center space-x-2 px-2">
            {canManage ? (
              <>
                <input 
                  type="file" 
                  id="excel-upload" 
                  accept=".xlsx, .xls" 
                  className="hidden" 
                  onChange={handleFileUpload}
                />
                <button
                  onClick={() => setIsCreateBlockModalOpen(true)}
                  className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-3 rounded-2xl flex items-center transition-all font-black text-xs uppercase tracking-widest shadow-md transform hover:scale-105 active:scale-95"
                >
                  <Plus className="w-4 h-4 mr-1.5" /> Create Curriculum
                </button>
                <button
                  onClick={() => document.getElementById('excel-upload').click()}
                  className="bg-slate-50 hover:bg-slate-100 text-slate-600 px-5 py-3 rounded-2xl flex items-center transition-all font-black text-xs uppercase tracking-widest border border-slate-200"
                  title="Import Excel file into curriculum"
                >
                  <Upload className="w-4 h-4 mr-1.5" /> Import Excel
                </button>
                <button
                  onClick={() => handleOpenModal()}
                  className="bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-2xl flex items-center shadow-lg shadow-green-200 transition-all font-black text-xs uppercase tracking-widest transform hover:scale-105 active:scale-95"
                >
                  <Plus className="w-4 h-4 mr-1.5" /> Add Subject
                </button>
              </>
            ) : selectedBlock && (
              <button
                onClick={() => handleSelectCurriculum(selectedBlock)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-2xl flex items-center shadow-lg shadow-emerald-200 transition-all font-black text-xs uppercase tracking-widest transform hover:scale-105 active:scale-95"
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5" /> Select This Curriculum
              </button>
            )}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
        </div>
      ) : selectedCourse === 'All' && blocks.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {blocks.map(block => {
            return (
              <div 
                key={block.id}
                onClick={() => {
                  setSelectedBlock(block);
                  setSelectedCourse(block.program_name);
                }}
                className="bg-white rounded-[2.5rem] border border-slate-200 p-10 cursor-pointer hover:shadow-2xl shadow-sm hover:shadow-green-900/5 hover:border-green-200 transition-all duration-300 transform hover:-translate-y-2 group relative overflow-hidden flex flex-col justify-between"
              >
                <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-green-50 to-transparent rounded-bl-full opacity-50 transition-transform group-hover:scale-110"></div>
                
                <div>
                  <div className="flex items-center justify-between mb-6 relative z-10">
                    <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider ${
                      block.status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-800' :
                      block.status === 'DRAFT' ? 'bg-amber-100 text-amber-800' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {block.status || 'PUBLISHED'}
                    </span>

                    {canManage && (
                      <div className="flex items-center space-x-2">
                        <select
                          value={block.status || 'PUBLISHED'}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => handleStatusChange(block.id, e.target.value, e)}
                          className="text-[10px] font-black bg-slate-50 border border-slate-200 rounded-xl px-2 py-1 cursor-pointer focus:outline-none uppercase tracking-wider text-slate-700"
                        >
                          <option value="DRAFT">DRAFT</option>
                          <option value="PUBLISHED">PUBLISHED</option>
                          <option value="ARCHIVED">ARCHIVED</option>
                        </select>
                        <button
                          onClick={(e) => handleDeleteCourse(block.id, block.program_name, e)}
                          className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-full transition-all"
                          title="Delete Curriculum"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="w-20 h-20 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-green-50 group-hover:border-green-100 transition-colors relative z-10 shadow-sm group-hover:shadow-green-100">
                    <BookOpen className="w-10 h-10 text-slate-400 group-hover:text-green-600 transition-colors" />
                  </div>
                  <h3 className="text-2xl font-black text-slate-800 mb-2 tracking-tight relative z-10 group-hover:text-green-700 transition-colors truncate" title={block.program_name}>
                    {block.program_name}
                  </h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 relative z-10">{block.academic_year}</p>
                </div>

                <div className="flex items-center justify-between text-xs font-black text-slate-500 uppercase tracking-wider relative z-10 pt-4 border-t border-slate-100">
                  <div className="flex space-x-2">
                    <span className="bg-slate-100/80 backdrop-blur-sm px-3 py-1.5 rounded-xl group-hover:bg-green-50 group-hover:text-green-700 transition-colors text-[10px]">{block.subject_count} Subjects</span>
                    <span className="bg-slate-100/80 backdrop-blur-sm px-3 py-1.5 rounded-xl group-hover:bg-green-50 group-hover:text-green-700 transition-colors text-[10px]">{block.total_units} Units</span>
                  </div>

                  {!canManage && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectCurriculum(block);
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm transition-all"
                    >
                      Select
                    </button>
                  )}
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
          {Object.keys(groupedByYear).sort((a, b) => {
            if (a === 'Unassigned') return 1;
            if (b === 'Unassigned') return -1;
            const na = Number(a);
            const nb = Number(b);
            if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
            return String(a).localeCompare(String(b));
          }).map(yearKey => (
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
                {groupedByYear[yearKey]['3rd'] && (
                  <SemesterTable semester="3rd" data={groupedByYear[yearKey]['3rd']} />
                )}
                {groupedByYear[yearKey]['3rd semester'] && (
                  <div className="xl:col-span-2">
                    <SemesterTable semester="3rd semester" data={groupedByYear[yearKey]['3rd semester']} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Curriculum Block Modal */}
      <Modal
        isOpen={isCreateBlockModalOpen}
        onClose={() => setIsCreateBlockModalOpen(false)}
        title="Create New Curriculum"
      >
        <form onSubmit={handleCreateBlock} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Program Name</label>
            <input
              type="text"
              required
              placeholder="e.g. DVM, BSCS, BSIT, BSCpE"
              className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
              value={blockFormData.program_name}
              onChange={(e) => setBlockFormData({ ...blockFormData, program_name: e.target.value.toUpperCase() })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Academic Year</label>
            <input
              type="text"
              required
              placeholder="e.g. AY 2026-2027"
              className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
              value={blockFormData.academic_year}
              onChange={(e) => setBlockFormData({ ...blockFormData, academic_year: e.target.value })}
            />
          </div>
          <div className="pt-4 flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => setIsCreateBlockModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 border border-gray-300 rounded-md shadow-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md shadow-sm"
            >
              Create Curriculum
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingItem ? 'Edit Curriculum Subject' : 'Add New Subject'}
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
                <option value="3rd semester">3rd Semester</option>
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

      {/* Import Review Modal */}
      <Modal
        isOpen={isImportReviewOpen}
        onClose={() => setIsImportReviewOpen(false)}
        title="Curriculum Import Review"
        maxWidth="max-w-6xl"
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-slate-50 p-6 rounded-3xl border border-slate-100">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-blue-100 rounded-2xl text-blue-600">
                <Info className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-black text-slate-900 text-xl tracking-tight">Review Your Data</h4>
                <p className="text-slate-500 text-sm font-medium">Verify the subjects found in your Excel file before saving.</p>
              </div>
            </div>
            <div className="flex space-x-6 text-right">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Found</p>
                <p className="text-2xl font-black text-slate-900">{importReport?.summary?.total_rows || 0}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Issues</p>
                <p className={`text-2xl font-black ${importReport?.summary?.issues_found > 0 ? 'text-amber-500' : 'text-green-500'}`}>
                  {importReport?.summary?.issues_found || 0}
                </p>
              </div>
            </div>
          </div>

          <div className="max-h-[50vh] overflow-y-auto border border-slate-100 rounded-3xl shadow-inner bg-slate-50/30">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-white border-b border-slate-100 z-10">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Code</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Name</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Yr/Sem</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">L/L/U</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {importReport?.report?.map((item, idx) => (
                  <tr key={idx} className={`hover:bg-white transition-colors ${item.validation_issues?.length > 0 ? 'bg-amber-50/30' : ''}`}>
                    <td className="px-6 py-4 font-bold text-slate-900">{item.code}</td>
                    <td className="px-6 py-4 font-medium text-slate-600">{item.name}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-[10px] font-black bg-slate-100 px-2 py-1 rounded-lg">
                        Y{item.year_level} - {item.semester_term}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center text-xs font-bold text-slate-500">
                      {item.lec_units}/{item.lab_units}/{item.units}
                    </td>
                    <td className="px-6 py-4">
                      {item.validation_issues?.length > 0 ? (
                        <div className="flex flex-col space-y-1">
                          {item.validation_issues.map((issue, i) => (
                            <span key={i} className="flex items-center text-[10px] font-bold text-amber-600 bg-amber-100/50 px-2 py-1 rounded-lg">
                              <AlertCircle className="w-3 h-3 mr-1" /> {issue}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="flex items-center text-[10px] font-bold text-green-600 bg-green-100/50 px-2 py-1 rounded-lg w-fit">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Ready
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-4">
             <button
              onClick={() => setIsImportReviewOpen(false)}
              className="px-8 py-4 text-sm font-black text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-widest"
            >
              Cancel Import
            </button>
            <button
              onClick={handleConfirmImport}
              disabled={isImporting}
              className={`bg-slate-900 text-white px-10 py-4 rounded-2xl flex items-center shadow-xl font-black text-sm uppercase tracking-widest transition-all ${isImporting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-800 transform hover:scale-105 active:scale-95'}`}
            >
              {isImporting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-3"></div>
                  Committing...
                </>
              ) : (
                <>
                  Confirm & Commit to Database
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>

  );
}
