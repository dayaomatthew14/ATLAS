import React, { useState, useEffect } from 'react';
import { Plus, Upload } from 'lucide-react';
import Table from '../../components/Table';
import Modal from '../../components/Modal';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';

export default function Curriculum() {
  const { addToast } = useToast();
  const [curriculumItems, setCurriculumItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    units: '',
    type: 'lecture',
    department_id: ''
  });
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = React.useRef(null);

  const columns = [
    { key: 'code', label: 'Code' },
    { key: 'name', label: 'Curriculum Name' },
    { key: 'units', label: 'Units' },
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
      const data = await api.get('/curriculum');
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
  }, []);

  const handleOpenModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        code: item.code,
        name: item.name,
        units: item.units,
        type: item.type,
        department_id: item.department_id || ''
      });
    } else {
      setEditingItem(null);
      setFormData({ code: '', name: '', units: '', type: 'lecture', department_id: '' });
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

    const formData = new FormData();
    formData.append('file', file);

    setIsImporting(true);
    try {
      const response = await api.post('/curriculum/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      addToast(response.message, 'success');
      fetchCurriculum();
    } catch (error) {
      addToast(error.message || 'Failed to import curriculum', 'error');
    } finally {
      setIsImporting(false);
      e.target.value = ''; // Reset input
    }
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tighter">Manage Curriculum</h2>
          <p className="text-slate-500 text-base font-medium mt-2">Configure the academic curriculum items and unit requirements.</p>
        </div>
        <div className="flex space-x-3">
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
            {isImporting ? 'Importing...' : 'Import Excel'}
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="bg-green-700 hover:bg-green-800 text-white px-8 py-4 rounded-2xl flex items-center shadow-lg transition-all font-black text-sm uppercase tracking-widest transform hover:scale-105"
          >
            <Plus className="w-6 h-6 mr-2" /> Add Curriculum
          </button>
        </div>
      </div>

      <Table 
        columns={columns} 
        data={curriculumItems} 
        isLoading={isLoading} 
        onEdit={handleOpenModal}
        onDelete={handleDelete}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingItem ? 'Edit Curriculum' : 'Add New Curriculum'}
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
                onChange={(e) => setFormData({ ...formData, units: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Curriculum Name</label>
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
              {editingItem ? 'Update Curriculum' : 'Save Curriculum'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
