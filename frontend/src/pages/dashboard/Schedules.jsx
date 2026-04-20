import React, { useState, useEffect } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import Modal from '../../components/Modal';
import { api } from '../../utils/api';

export default function Schedules() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [schedules, setSchedules] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Date Helpers
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const renderCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const days = [];

    // Fill empty slots from previous month
    for (let i = 0; i < firstDay; i++) {
      days.push({ day: null, currentMonth: false });
    }

    // Fill current month days
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({ day: d, currentMonth: true, date: new Date(year, month, d) });
    }

    // Fill remaining slots to complete the grid (6 rows of 7 = 42 slots)
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({ day: i, currentMonth: false });
    }

    return days;
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [subjects, setSubjects] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [formData, setFormData] = useState({
    subject_id: '',
    room_id: '',
    faculty_id: '',
    day_of_week: 'Mon',
    start_time: '07:30',
    end_time: '08:30',
    section: ''
  });

  const fetchDropdownData = async () => {
    try {
      const [subjectsData, roomsData, teachersData] = await Promise.all([
        api.get('/subjects').catch(() => [{ id: 1, name: 'Math 101', code: 'M101' }]),
        api.get('/rooms').catch(() => [{ id: 1, name: 'RM 301', building: 'Main' }]),
        api.get('/users?role=faculty').catch(() => [{ id: 1, name: 'Dr. Smith' }])
      ]);
      setSubjects(subjectsData);
      setRooms(roomsData);
      setTeachers(teachersData);
    } catch (error) {
      console.error('Error fetching dropdown data');
    }
  };

  const handleOpenModal = () => {
    fetchDropdownData();
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/schedules', formData);
      fetchSchedules();
      setIsModalOpen(false);
    } catch (error) {
      // Mocking successful submission for now
      const newSched = {
        id: Date.now(),
        subject: subjects.find(s => s.id === parseInt(formData.subject_id))?.name || 'New Class',
        startTime: formData.start_time,
        endTime: formData.end_time,
        date: new Date() // Just for demo
      };
      setSchedules([...schedules, newSched]);
      setIsModalOpen(false);
    }
  };

  const fetchSchedules = async () => {
    setIsLoading(true);
    try {
      // Mock data for now
      setSchedules([
        { id: 1, subject: 'Financing', startTime: '07:30', endTime: '08:30', dayOfWeek: 'Tue', date: new Date(2026, 8, 15) },
        { id: 2, subject: 'Operations Mgt.', startTime: '07:30', endTime: '08:30', dayOfWeek: 'Wed', date: new Date(2026, 8, 16) },
      ]);
    } catch (error) {
      console.error('Failed to fetch schedules');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, [currentDate]);

  return (
    <>
      {/* Page Header */}
      <div className="bg-green-700 text-white py-3 shadow-inner">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h2 className="text-lg font-medium">Manage Schedules For Teachers</h2>
          <button className="text-sm text-green-100 hover:text-white flex items-center">
            <BookOpen className="w-4 h-4 mr-1" /> Manage Student Schedules
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          
          {/* Calendar Toolbar */}
          <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <div className="flex space-x-2">
              <button 
                onClick={prevMonth}
                className="px-3 py-1.5 border border-gray-200 rounded bg-white text-gray-600 text-sm hover:bg-gray-50 flex items-center transition-colors"
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Previous
              </button>
            </div>
            
            <h3 className="text-xl font-bold text-gray-800">
              {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h3>
            
            <div className="flex space-x-2 items-center">
              <button 
                onClick={nextMonth}
                className="px-3 py-1.5 border border-gray-200 rounded bg-white text-gray-600 text-sm hover:bg-gray-50 flex items-center mr-2 transition-colors"
              >
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </button>
              <button 
                onClick={handleOpenModal}
                className="px-4 py-2 bg-green-700 hover:bg-green-800 text-white rounded-lg text-sm font-medium flex items-center shadow-sm transition-colors"
              >
                <Plus className="w-4 h-4 mr-1" /> Create New Schedule
              </button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="p-4">
            <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
              {/* Days Header */}
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="bg-gray-50 py-2 text-center text-sm font-bold text-gray-600">
                  {day}
                </div>
              ))}
              
              {/* Calendar Cells */}
              {renderCalendarDays().map((cell, i) => {
                const daySchedules = schedules.filter(s => 
                  cell.date && 
                  s.date.getDate() === cell.day && 
                  s.date.getMonth() === currentDate.getMonth() &&
                  s.date.getFullYear() === currentDate.getFullYear()
                );

                return (
                  <div key={i} className={`bg-white min-h-[100px] p-2 relative group transition-colors ${cell.currentMonth ? 'hover:bg-gray-50' : 'bg-gray-50'}`}>
                    <span className={`absolute top-2 right-2 text-xs font-medium ${cell.currentMonth ? 'text-gray-400' : 'text-gray-300'}`}>
                      {cell.day}
                    </span>
                    
                    <div className="mt-6 space-y-1">
                      {daySchedules.map(schedule => (
                        <div 
                          key={schedule.id}
                          className="text-xs bg-yellow-100 border border-yellow-300 text-yellow-800 p-1.5 rounded shadow-sm cursor-pointer hover:bg-yellow-200"
                        >
                          <div className="font-bold truncate">{schedule.subject}</div>
                          <div className="text-[10px] opacity-80">({schedule.startTime} - {schedule.endTime})</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </main>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create New Schedule"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Subject</label>
              <select
                required
                className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm"
                value={formData.subject_id}
                onChange={(e) => setFormData({ ...formData, subject_id: e.target.value })}
              >
                <option value="">Select Subject</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.code} - {s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Section</label>
              <input
                type="text"
                required
                placeholder="e.g. BSCS-3A"
                className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm"
                value={formData.section}
                onChange={(e) => setFormData({ ...formData, section: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Teacher</label>
              <select
                required
                className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm"
                value={formData.faculty_id}
                onChange={(e) => setFormData({ ...formData, faculty_id: e.target.value })}
              >
                <option value="">Select Teacher</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Room</label>
              <select
                required
                className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm"
                value={formData.room_id}
                onChange={(e) => setFormData({ ...formData, room_id: e.target.value })}
              >
                <option value="">Select Room</option>
                {rooms.map(r => <option key={r.id} value={r.id}>{r.name} ({r.building})</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Day</label>
              <select
                required
                className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm"
                value={formData.day_of_week}
                onChange={(e) => setFormData({ ...formData, day_of_week: e.target.value })}
              >
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Start Time</label>
              <input
                type="time"
                required
                className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm"
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">End Time</label>
              <input
                type="time"
                required
                className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm"
                value={formData.end_time}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 border border-gray-300 rounded-md shadow-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-green-700 hover:bg-green-800 rounded-md shadow-sm"
            >
              Save Schedule
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
