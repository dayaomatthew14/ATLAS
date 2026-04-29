import React, { useState, useEffect } from 'react';
import { Plus, Upload, Filter, BookOpen, Layers } from 'lucide-react';
import Table from '../../components/Table';
import Modal from '../../components/Modal';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';

const PROGRAMS = ['BSCS', 'BSIT', 'BSCpE', 'BSCE', 'BSEE', 'BSME'];
const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
const SEMESTERS = ['1st Semester', '2nd Semester', 'Summer'];

export default function Curriculum() {
  const { addToast } = useToast();
  const [curriculumItems, setCurriculumItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [selectedProgram, setSelectedProgram] = useState('BSCS');
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    units: '',
    type: 'lecture',
    department_id: '',
    program_code: 'BSCS',
    year_level: '1st Year',
    semester_term: '1st Semester',
    lec_units: 0,
    lab_units: 0,
    pre_requisite: ''
  });
  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState(null);
  const [showImportVerification, setShowImportVerification] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const fileInputRef = React.useRef(null);

  const columns = [
    { key: 'code', label: 'Code' },
    { key: 'name', label: 'Description' },
    { key: 'lec_units', label: 'Lec' },
    { key: 'lab_units', label: 'Lab' },
    { key: 'units', label: 'Units' },
    { key: 'pre_requisite', label: 'Pre-requisite' },
    { 
      key: 'type', 
      label: 'Type',
      render: (item) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          item.type === 'lecture' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
        }`}>
          {item.type}
        </span>
      )
    },
  ];

  const fetchCurriculum = async () => {
    setIsLoading(true);
    try {
      const data = await api.get(`/curriculum?program_code=${selectedProgram}`);
      setCurriculumItems(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch curriculum', error);
      setCurriculumItems([]);
      addToast('Failed to load curriculum', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCurriculum();
  }, [selectedProgram]);

  const handleOpenModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        code: item.code,
        name: item.name,
        units: item.units,
        type: item.type,
        department_id: item.department_id || '',
        program_code: item.program_code || selectedProgram,
        year_level: item.year_level || '1st Year',
        semester_term: item.semester_term || '1st Semester',
        lec_units: item.lec_units || 0,
        lab_units: item.lab_units || 0,
        pre_requisite: item.pre_requisite || ''
      });
    } else {
      setEditingItem(null);
      setFormData({ 
        code: '', 
        name: '', 
        units: '', 
        type: 'lecture', 
        department_id: curriculumItems[0]?.department_id || '',
        program_code: selectedProgram,
        year_level: '1st Year',
        semester_term: '1st Semester',
        lec_units: 0,
        lab_units: 0,
        pre_requisite: ''
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
      const payload = {
        ...formData,
        units: parseInt(formData.lec_units || 0) + parseInt(formData.lab_units || 0)
      };
      
      if (editingItem) {
        await api.put(`/curriculum/${editingItem.id}`, payload);
      } else {
        await api.post('/curriculum', payload);
      }
      fetchCurriculum();
      handleCloseModal();
      addToast(`Curriculum item ${editingItem ? 'updated' : 'created'} successfully`, 'success');
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
        addToast(error.message || 'Error deleting curriculum item', 'error');
      }
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setPendingFile(file);
    const formDataImport = new FormData();
    formDataImport.append('file', file);
    formDataImport.append('program_code', selectedProgram);
    formDataImport.append('dry_run', 'true');

    setIsImporting(true);
    try {
      const response = await api.post('/curriculum/import', formDataImport, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportSummary(response);
      setShowImportVerification(true);
    } catch (error) {
      addToast(error.message || 'Failed to analyze Excel file', 'error');
    } finally {
      setIsImporting(false);
      e.target.value = ''; // Reset input
    }
  };

  const confirmImport = async () => {
    if (!pendingFile) return;

    const formDataImport = new FormData();
    formDataImport.append('file', pendingFile);
    formDataImport.append('program_code', selectedProgram);
    formDataImport.append('dry_run', 'false');

    setIsImporting(true);
    try {
      const response = await api.post('/curriculum/import', formDataImport, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      addToast(response.message, 'success');
      setShowImportVerification(false);
      setImportSummary(null);
      setPendingFile(null);
      fetchCurriculum();
    } catch (error) {
      addToast(error.message || 'Failed to finalize import', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  // Grouping logic
  const groupedCurriculum = {};
  YEAR_LEVELS.forEach(year => {
    groupedCurriculum[year] = {};
    SEMESTERS.forEach(sem => {
      groupedCurriculum[year][sem] = curriculumItems.filter(
        item => item.year_level === year && item.semester_term === sem
      );
    });
  });

  // Items without year/sem assignment
  const unassignedItems = curriculumItems.filter(
    item => !YEAR_LEVELS.includes(item.year_level) || !SEMESTERS.includes(item.semester_term)
  );

  return (
    <div className="p-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-green-100 p-2 rounded-xl">
              <BookOpen className="w-6 h-6 text-green-700" />
            </div>
            <h2 className="text-4xl font-black text-slate-900 tracking-tighter">Academic Curriculum</h2>
          </div>
          <p className="text-slate-500 text-base font-medium">Manage program courses, credit units, and academic prerequisites.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Filter className="h-4 w-4 text-slate-400 group-hover:text-green-600 transition-colors" />
            </div>
            <select
              value={selectedProgram}
              onChange={(e) => setSelectedProgram(e.target.value)}
              className="pl-11 pr-10 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 shadow-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all appearance-none cursor-pointer hover:border-green-300"
            >
              {PROGRAMS.map(program => (
                <option key={program} value={program}>{program} Program</option>
              ))}
            </select>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept=".xlsx,.xls"
          />
          <button
            onClick={handleImportClick}
            disabled={isImporting}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-6 py-4 rounded-2xl flex items-center shadow-sm transition-all font-black text-sm uppercase tracking-widest disabled:opacity-50"
          >
            <Upload className={`w-5 h-5 mr-2 ${isImporting ? 'animate-bounce' : ''}`} />
            {isImporting ? 'Processing...' : 'Import Excel'}
          </button>
          
          <button
            onClick={() => handleOpenModal()}
            className="bg-green-700 hover:bg-green-800 text-white px-8 py-4 rounded-2xl flex items-center shadow-lg transition-all font-black text-sm uppercase tracking-widest transform hover:scale-105"
          >
            <Plus className="w-6 h-6 mr-2" /> Add Subject
          </button>
        </div>
      </div>

      <div className="space-y-12">
        {YEAR_LEVELS.map(year => {
          const hasContent = SEMESTERS.some(sem => groupedCurriculum[year][sem].length > 0);
          if (!hasContent) return null;

          return (
            <div key={year} className="animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="flex items-center gap-4 mb-6">
                <div className="h-px flex-1 bg-slate-200"></div>
                <h3 className="text-2xl font-black text-slate-400 uppercase tracking-[0.2em]">{year}</h3>
                <div className="h-px flex-1 bg-slate-200"></div>
              </div>

              <div className="grid grid-cols-1 gap-8">
                {SEMESTERS.map(sem => {
                  const items = groupedCurriculum[year][sem];
                  if (items.length === 0) return null;

                  return (
                    <div key={sem} className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100">
                      <div className="flex items-center gap-2 mb-4 ml-2">
                        <Layers className="w-5 h-5 text-green-600" />
                        <h4 className="text-lg font-black text-slate-800 uppercase tracking-wider">{sem}</h4>
                        <span className="ml-2 px-3 py-1 bg-white border border-slate-200 rounded-full text-xs font-bold text-slate-500">
                          {items.length} Subjects
                        </span>
                      </div>
                      <Table 
                        columns={columns} 
                        data={items} 
                        isLoading={false} 
                        onEdit={handleOpenModal}
                        onDelete={handleDelete}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {unassignedItems.length > 0 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex items-center gap-4 mb-6">
              <div className="h-px flex-1 bg-slate-200"></div>
              <h3 className="text-2xl font-black text-slate-400 uppercase tracking-[0.2em]">Unassigned Subjects</h3>
              <div className="h-px flex-1 bg-slate-200"></div>
            </div>
            <Table 
              columns={columns} 
              data={unassignedItems} 
              isLoading={isLoading} 
              onEdit={handleOpenModal}
              onDelete={handleDelete}
            />
          </div>
        )}

        {curriculumItems.length === 0 && !isLoading && (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-20 text-center">
            <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <BookOpen className="w-12 h-12 text-slate-200" />
            </div>
            <h3 className="text-2xl font-black text-slate-800">No Curriculum Data</h3>
            <p className="text-slate-500 max-w-md mx-auto mt-4 text-lg">
              There are no subjects listed for the {selectedProgram} program yet. 
              Try importing from Excel or adding subjects manually.
            </p>
          </div>
        )}
        
        {isLoading && (
          <div className="space-y-8">
            <div className="h-12 w-48 bg-slate-100 animate-pulse rounded-xl"></div>
            <div className="h-64 bg-slate-50 animate-pulse rounded-3xl"></div>
          </div>
        )}
      </div>

      {/* Import Verification Modal */}
      <Modal
        isOpen={showImportVerification}
        onClose={() => setShowImportVerification(false)}
        title="Verify Curriculum Import"
      >
        {importSummary && (
          <div className="space-y-8">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-slate-50 p-6 rounded-3xl text-center border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Parsed</p>
                <p className="text-3xl font-black text-slate-900">{importSummary.summary.total_parsed}</p>
              </div>
              <div className="bg-green-50 p-6 rounded-3xl text-center border border-green-100">
                <p className="text-[10px] font-black text-green-600 uppercase tracking-widest mb-1">New Subjects</p>
                <p className="text-3xl font-black text-green-700">{importSummary.summary.to_add}</p>
              </div>
              <div className="bg-amber-50 p-6 rounded-3xl text-center border border-amber-100">
                <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">Skipped Rows</p>
                <p className="text-3xl font-black text-amber-700">{importSummary.summary.skipped}</p>
              </div>
            </div>

            {importSummary.errors && importSummary.errors.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Reason for Skipping</h4>
                <div className="max-h-[300px] overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                  {importSummary.errors.map((err, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                      <div>
                        <p className="text-sm font-black text-slate-800">{err.code || 'N/A'}</p>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{err.name || 'Unknown Subject'}</p>
                      </div>
                      <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-[10px] font-black uppercase tracking-tight">
                        {err.reason}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {importSummary.preview && importSummary.preview.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Items to be Added</h4>
                <div className="max-h-[200px] overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                   {importSummary.preview.slice(0, 5).map((item, idx) => (
                     <div key={idx} className="p-4 bg-green-50/30 border border-green-100 rounded-2xl flex justify-between items-center">
                        <p className="text-xs font-bold text-green-800">{item.code} — {item.name}</p>
                        <span className="text-[10px] font-black text-green-600 uppercase">{item.year_level}</span>
                     </div>
                   ))}
                   {importSummary.preview.length > 5 && (
                     <p className="text-center text-[10px] font-black text-slate-400 uppercase">And {importSummary.preview.length - 5} more items...</p>
                   )}
                </div>
              </div>
            )}

            <div className="pt-6 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => setShowImportVerification(false)}
                className="px-6 py-4 text-sm font-black text-slate-500 hover:bg-slate-50 rounded-2xl uppercase tracking-widest transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmImport}
                disabled={importSummary.summary.to_add === 0 || isImporting}
                className="px-10 py-4 text-sm font-black text-white bg-green-700 hover:bg-green-800 rounded-2xl shadow-xl uppercase tracking-widest transition-all transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
              >
                {isImporting ? 'Importing...' : 'Confirm & Ingest'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingItem ? 'Edit Subject' : 'Add New Subject'}
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Subject Code</label>
              <input
                type="text"
                required
                placeholder="e.g. CS101"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all font-medium"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Program</label>
              <select
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all font-medium"
                value={formData.program_code}
                onChange={(e) => setFormData({ ...formData, program_code: e.target.value })}
              >
                {PROGRAMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Subject Description</label>
            <input
              type="text"
              required
              placeholder="e.g. Introduction to Computing"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all font-medium"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Lec Units</label>
              <input
                type="number"
                required
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all font-medium"
                value={formData.lec_units}
                onChange={(e) => setFormData({ ...formData, lec_units: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Lab Units</label>
              <input
                type="number"
                required
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all font-medium"
                value={formData.lab_units}
                onChange={(e) => setFormData({ ...formData, lab_units: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Total Units</label>
              <input
                type="number"
                readOnly
                className="w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl font-black text-green-700"
                value={parseInt(formData.lec_units || 0) + parseInt(formData.lab_units || 0)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Year Level</label>
              <select
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all font-medium"
                value={formData.year_level}
                onChange={(e) => setFormData({ ...formData, year_level: e.target.value })}
              >
                {YEAR_LEVELS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Semester</label>
              <select
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all font-medium"
                value={formData.semester_term}
                onChange={(e) => setFormData({ ...formData, semester_term: e.target.value })}
              >
                {SEMESTERS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Type</label>
              <select
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all font-medium"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              >
                <option value="lecture">Lecture</option>
                <option value="lab">Lab</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Prerequisites</label>
              <input
                type="text"
                placeholder="e.g. CS101, CS102"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all font-medium"
                value={formData.pre_requisite}
                onChange={(e) => setFormData({ ...formData, pre_requisite: e.target.value })}
              />
            </div>
          </div>

          <div className="pt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={handleCloseModal}
              className="px-6 py-3 text-sm font-black text-slate-500 hover:bg-slate-50 rounded-xl uppercase tracking-widest transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-8 py-3 text-sm font-black text-white bg-green-700 hover:bg-green-800 rounded-xl shadow-lg uppercase tracking-widest transition-all transform hover:scale-105"
            >
              {editingItem ? 'Update Subject' : 'Save Subject'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

