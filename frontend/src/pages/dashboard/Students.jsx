import React, { useState, useEffect } from 'react';
import { Plus, GraduationCap } from 'lucide-react';
import Table from '../../components/Table';
import Modal from '../../components/Modal';
import { api } from '../../utils/api';

export default function Students() {
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'student',
    password: ''
  });

  const columns = [
    { 
      key: 'name', 
      label: 'Student Name',
      render: (item) => (
        <div className="flex items-center">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mr-3">
            <GraduationCap className="w-4 h-4" />
          </div>
          <span className="font-medium text-gray-900">{item.name}</span>
        </div>
      )
    },
    { key: 'email', label: 'Email Address' },
    { 
      key: 'created_at', 
      label: 'Joined Date',
      render: (item) => new Date(item.created_at || Date.now()).toLocaleDateString()
    },
  ];

  const fetchStudents = async () => {
    setIsLoading(true);
    try {
      const data = await api.get('/users?role=student');
      setStudents(data);
    } catch (error) {
      console.error('Failed to fetch students');
      setStudents([
        { id: 101, name: 'Alice Smith', email: 'alice@example.com', role: 'student', created_at: '2026-01-15' },
        { id: 102, name: 'Bob Johnson', email: 'bob@example.com', role: 'student', created_at: '2026-02-20' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const handleOpenModal = (student = null) => {
    if (student) {
      setEditingStudent(student);
      setFormData({
        name: student.name,
        email: student.email,
        role: 'student',
        password: '' // Don't pre-fill password
      });
    } else {
      setEditingStudent(null);
      setFormData({ name: '', email: '', role: 'student', password: '' });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingStudent(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingStudent) {
        await api.put(`/users/${editingStudent.id}`, formData);
      } else {
        await api.post('/users', formData);
      }
      fetchStudents();
      handleCloseModal();
    } catch (error) {
      alert('Error saving student');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this student?')) {
      try {
        await api.delete(`/users/${id}`);
        fetchStudents();
      } catch (error) {
        alert('Error deleting student');
      }
    }
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Manage Students</h2>
          <p className="text-gray-500 text-sm mt-1">Enroll and manage student accounts.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="bg-green-700 hover:bg-green-800 text-white px-4 py-2 rounded-lg flex items-center shadow-sm transition-colors font-medium"
        >
          <Plus className="w-5 h-5 mr-1" /> Add Student
        </button>
      </div>

      <Table 
        columns={columns} 
        data={students} 
        isLoading={isLoading} 
        onEdit={handleOpenModal}
        onDelete={handleDelete}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingStudent ? 'Edit Student' : 'Add New Student'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
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
              {editingStudent ? 'New Password (leave blank to keep current)' : 'Password'}
            </label>
            <input
              type="password"
              required={!editingStudent}
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
              {editingStudent ? 'Update Student' : 'Save Student'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
