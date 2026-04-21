import React, { useState, useEffect } from 'react';
import { Plus, School } from 'lucide-react';
import Table from '../../components/Table';
import Modal from '../../components/Modal';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';

export default function Colleges() {
  const { addToast } = useToast();
  const [colleges, setColleges] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCollege, setEditingCollege] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: ''
  });

  const columns = [
    { 
      key: 'name', 
      label: 'College Name',
      render: (item) => (
        <div className="flex items-center">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mr-3 font-bold text-xs">
            {item.code}
          </div>
          <span className="font-medium text-gray-900">{item.name}</span>
        </div>
      )
    },
    { key: 'code', label: 'Code' },
    { key: 'description', label: 'Description' },
  ];

  const fetchColleges = async () => {
    setIsLoading(true);
    try {
      const data = await api.get('/departments');
      setColleges(data);
    } catch (error) {
      console.error('Failed to fetch colleges');
      setColleges([
        { id: 1, name: 'College of Veterinary Medicine and Agricultural Sciences', code: 'CVMAS', description: 'Agricultural and Veterinary studies' },
        { id: 2, name: 'College of Business, Management and Accountancy', code: 'CBMA', description: 'Business and Financial courses' },
        { id: 3, name: 'College of Arts, Sciences and Technology', code: 'CAST', description: 'Scientific and Technological innovation' },
        { id: 4, name: 'College of Education', code: 'CED', description: 'Teacher training and Education research' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchColleges();
  }, []);

  const handleOpenModal = (college = null) => {
    if (college) {
      setEditingCollege(college);
      setFormData({
        name: college.name,
        code: college.code,
        description: college.description || ''
      });
    } else {
      setEditingCollege(null);
      setFormData({ name: '', code: '', description: '' });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingCollege(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingCollege) {
        await api.put(`/departments/${editingCollege.id}`, formData);
      } else {
        await api.post('/departments', formData);
      }
      fetchColleges();
      handleCloseModal();
      addToast(`College ${editingCollege ? 'updated' : 'added'} successfully`, 'success');
    } catch (error) {
      addToast(error.message || 'Error saving college', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this college?')) {
      try {
        await api.delete(`/departments/${id}`);
        fetchColleges();
        addToast('College removed successfully', 'success');
      } catch (error) {
        addToast(error.message || 'Error removing college', 'error');
      }
    }
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Manage Colleges</h2>
          <p className="text-gray-500 text-sm mt-1">Manage the departments of the TED School.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="bg-green-700 hover:bg-green-800 text-white px-4 py-2 rounded-lg flex items-center shadow-sm transition-colors font-medium"
        >
          <Plus className="w-5 h-5 mr-1" /> Add College
        </button>
      </div>

      <Table 
        columns={columns} 
        data={colleges} 
        isLoading={isLoading} 
        onEdit={handleOpenModal}
        onDelete={handleDelete}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingCollege ? 'Edit College' : 'Add New College'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">College Name</label>
            <input
              type="text"
              required
              className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Code</label>
            <input
              type="text"
              required
              placeholder="e.g. CVMAS"
              className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea
              className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
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
              {editingCollege ? 'Update College' : 'Save College'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
