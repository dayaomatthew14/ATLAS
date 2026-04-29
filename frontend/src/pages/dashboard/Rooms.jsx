import React, { useState, useEffect } from 'react';
import { Plus, MapPin, Users, Monitor, BookOpen } from 'lucide-react';
import Table from '../../components/Table';
import Modal from '../../components/Modal';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';

export default function Rooms() {
  const { addToast } = useToast();
  const [rooms, setRooms] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    building: '',
    capacity: '',
    type: 'lecture'
  });

  const columns = [
    { 
      key: 'name', 
      label: 'Room Name',
      render: (item) => (
        <div className="flex items-center">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 mr-4 shadow-sm">
            <MapPin className="w-5 h-5" />
          </div>
          <span className="font-black text-slate-900">{item.name}</span>
        </div>
      )
    },
    { 
      key: 'building', 
      label: 'Location',
      render: (item) => (
        <span className="font-bold text-slate-600">{item.building}</span>
      )
    },
    { 
      key: 'capacity', 
      label: 'Capacity',
      render: (item) => (
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-slate-400" />
          <span className="font-black text-slate-700">{item.capacity} Pax</span>
        </div>
      )
    },
    { 
      key: 'type', 
      label: 'Usage Type',
      render: (item) => (
        <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest border ${
          item.type === 'lecture' ? 'bg-blue-50 text-blue-700 border-blue-100' : 
          item.type === 'lab' ? 'bg-purple-50 text-purple-700 border-purple-100' : 
          'bg-indigo-50 text-indigo-700 border-indigo-100'
        }`}>
          {item.type === 'computer_lab' ? <Monitor className="w-3 h-3" /> : <BookOpen className="w-3 h-3" />}
          {item.type.replace('_', ' ')}
        </div>
      )
    },
  ];

  const fetchRooms = async () => {
    setIsLoading(true);
    try {
      const data = await api.get('/rooms');
      setRooms(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch rooms', error);
      setRooms([]);
      addToast('Failed to load rooms', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  const handleOpenModal = (room = null) => {
    if (room) {
      setEditingRoom(room);
      setFormData({
        name: room.name,
        building: room.building,
        capacity: room.capacity,
        type: room.type
      });
    } else {
      setEditingRoom(null);
      setFormData({ name: '', building: '', capacity: '', type: 'lecture' });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingRoom(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingRoom) {
        await api.put(`/rooms/${editingRoom.id}`, formData);
      } else {
        await api.post('/rooms', formData);
      }
      fetchRooms();
      handleCloseModal();
      addToast(`Room ${editingRoom ? 'updated' : 'created'} successfully`, 'success');
    } catch (error) {
      addToast(error.message || 'Error saving room', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this room?')) {
      try {
        await api.delete(`/rooms/${id}`);
        fetchRooms();
        addToast('Room deleted successfully', 'success');
      } catch (error) {
        addToast(error.message || 'Error deleting room', 'error');
      }
    }
  };

  return (
    <div className="p-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-blue-100 p-2.5 rounded-xl shadow-sm">
              <MapPin className="w-6 h-6 text-blue-700" />
            </div>
            <h2 className="text-4xl font-black text-slate-900 tracking-tighter">Campus Resources</h2>
          </div>
          <p className="text-slate-500 text-base font-medium">Manage physical spaces, laboratories, and classroom capacities for scheduling.</p>
        </div>
        
        <button
          onClick={() => handleOpenModal()}
          className="bg-green-700 hover:bg-green-800 text-white px-8 py-4 rounded-2xl flex items-center shadow-lg transition-all font-black text-sm uppercase tracking-widest transform hover:scale-105 active:scale-95"
        >
          <Plus className="w-6 h-6 mr-2" /> Add Room
        </button>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden p-2">
        <Table 
          columns={columns} 
          data={rooms} 
          isLoading={isLoading} 
          onEdit={handleOpenModal}
          onDelete={handleDelete}
        />
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingRoom ? 'Edit Room Configuration' : 'Register New Resource'}
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-black text-slate-700 mb-2 uppercase tracking-wide">Room Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Room 302"
                className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all font-bold text-slate-700 placeholder:text-slate-400 placeholder:font-normal"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-black text-slate-700 mb-2 uppercase tracking-wide">Capacity</label>
              <input
                type="number"
                required
                placeholder="40"
                className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all font-bold text-slate-700"
                value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-black text-slate-700 mb-2 uppercase tracking-wide">Building / Floor</label>
            <input
              type="text"
              required
              placeholder="e.g. Main Building - 3rd Floor"
              className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all font-bold text-slate-700 placeholder:text-slate-400 placeholder:font-normal"
              value={formData.building}
              onChange={(e) => setFormData({ ...formData, building: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-black text-slate-700 mb-2 uppercase tracking-wide">Room Type</label>
            <select
              className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all font-black text-slate-700 appearance-none cursor-pointer"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            >
              <option value="lecture">Lecture Room</option>
              <option value="lab">Science Laboratory</option>
              <option value="computer_lab">Computer Laboratory</option>
            </select>
          </div>

          <div className="pt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={handleCloseModal}
              className="px-6 py-3.5 text-sm font-black text-slate-500 hover:bg-slate-50 rounded-2xl uppercase tracking-widest transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-10 py-3.5 text-sm font-black text-white bg-green-700 hover:bg-green-800 rounded-2xl shadow-lg uppercase tracking-widest transition-all transform hover:scale-105 active:scale-95"
            >
              {editingRoom ? 'Update Resource' : 'Create Resource'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
