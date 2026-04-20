import React, { useState, useEffect } from 'react';
import { Plus, Users as UsersIcon } from 'lucide-react';
import Table from '../../components/Table';
import Modal from '../../components/Modal';
import { api } from '../../utils/api';

export default function Teachers() {
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
          <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 mr-3">
            <UsersIcon className="w-4 h-4" />
          </div>
          <span className="font-medium text-gray-900">{item.name}</span>
        </div>
      )
    },
    { key: 'email', label: 'Email Address' },
    { key: 'max_units', label: 'Max Units' },
    {
      key: 'department',
      label: 'Department',
      render: (item) => item.department?.name || 'Unassigned'
    },
  ];

  const fetchTeachers = async () => {
    setIsLoading(true);
    try {
      const data = await api.get('/users?role=faculty');
      setTeachers(data);
    } catch (error) {
      console.error('Failed to fetch teachers');
      setTeachers([
        { id: 201, name: 'Dr. Emily Carter', email: 'emily@example.com', max_units: 21, department: { name: 'Computer Science' } },
        { id: 202, name: 'Prof. Mark Wilson', email: 'mark@example.com', max_units: 18, department: { name: 'Mathematics' } },
      ]);
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
    } catch (error) {
      alert('Error saving teacher');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this teacher?')) {
      try {
        await api.delete(`/users/${id}`);
        fetchTeachers();
      } catch (error) {
        alert('Error deleting teacher');
      }
    }
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Manage Teachers</h2>
          <p className="text-gray-500 text-sm mt-1">Manage faculty members and their teaching loads.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="bg-green-700 hover:bg-green-800 text-white px-4 py-2 rounded-lg flex items-center shadow-sm transition-colors font-medium"
        >
          <Plus className="w-5 h-5 mr-1" /> Add Teacher
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
        title={editingTeacher ? 'Edit Teacher' : 'Add New Teacher'}
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
              {editingTeacher ? 'Update Teacher' : 'Save Teacher'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
