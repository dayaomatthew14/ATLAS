import React, { useState, useEffect } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Plus, AlertTriangle, Bell } from 'lucide-react';
import Modal from '../../components/Modal';
import ConflictPanel from '../../components/ConflictPanel';
import { api } from '../../utils/api';
import { detectConflicts, checkScheduleIntegrity } from '../../utils/conflictDetection';

export default function Schedules() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [schedules, setSchedules] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConflictPanelOpen, setIsConflictPanelOpen] = useState(false);
  const [formConflicts, setFormConflicts] = useState([]);
  
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

    for (let i = 0; i < firstDay; i++) {
      days.push({ day: null, currentMonth: false });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      days.push({ day: d, currentMonth: true, date: new Date(year, month, d) });
    }

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
        api.get('/subjects').catch(() => [
          { id: 1, name: 'Math 101', code: 'M101' },
          { id: 2, name: 'Financing', code: 'FIN1' }
        ]),
        api.get('/rooms').catch(() => [
          { id: 1, name: 'RM 301', building: 'Main' },
          { id: 2, name: 'CL1', building: 'Lab' }
        ]),
        api.get('/users?role=faculty').catch(() => [
          { id: 1, name: 'Dr. Smith' },
          { id: 2, name: 'Prof. Jones' }
        ])
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
    setFormConflicts([]);
  };

  // Real-time conflict check
  useEffect(() => {
    if (formData.subject_id && formData.start_time) {
      const conflicts = detectConflicts({
        ...formData,
        room_name: rooms.find(r => r.id === parseInt(formData.room_id))?.name,
        teacher: teachers.find(t => t.id === parseInt(formData.faculty_id))?.name
      }, schedules);
      setFormConflicts(conflicts);
    }
  }, [formData, schedules, rooms, teachers]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/schedules', formData);
      fetchSchedules();
      setIsModalOpen(false);
    } catch (error) {
      const newSched = {
        id: Date.now(),
        subject: subjects.find(s => s.id === parseInt(formData.subject_id))?.name || 'New Class',
        startTime: formData.start_time,
        endTime: formData.end_time,
        dayOfWeek: formData.day_of_week,
        date: new Date(currentDate.getFullYear(), currentDate.getMonth(), 15), // Mock date
        room_id: parseInt(formData.room_id),
        faculty_id: parseInt(formData.faculty_id),
        section: formData.section
      };
      setSchedules(checkScheduleIntegrity([...schedules, newSched]));
      setIsModalOpen(false);
    }
  };

  const fetchSchedules = async () => {
    setIsLoading(true);
    try {
      const rawData = [
        { id: 1, subject: 'Financing', startTime: '07:30', endTime: '08:30', dayOfWeek: 'Tue', date: new Date(2026, 8, 15), room_id: 1, faculty_id: 1, section: 'A' },
        { id: 2, subject: 'Operations Mgt.', startTime: '07:30', endTime: '08:30', dayOfWeek: 'Wed', date: new Date(2026, 8, 16), room_id: 1, faculty_id: 1, section: 'A' },
      ];
      setSchedules(checkScheduleIntegrity(rawData));
    } catch (error) {
      console.error('Failed to fetch schedules');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, [currentDate]);

  const activeConflictsCount = schedules.filter(s => s.isConflicting).length;

  return (
    <>
      {/* Page Header */}
      <div className="bg-green-700 text-white py-3 shadow-inner">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h2 className="text-lg font-medium">Manage Schedules For Teachers</h2>
          <div className="flex items-center space-x-4">
            {activeConflictsCount > 0 && (
              <button 
                onClick={() => setIsConflictPanelOpen(true)}
                className="flex items-center bg-red-600 hover:bg-red-700 px-3 py-1 rounded-full text-xs font-bold animate-pulse transition-colors"
              >
                <AlertTriangle className="w-3 h-3 mr-1.5" />
                {activeConflictsCount} Conflict{activeConflictsCount > 1 ? 's' : ''} Detected
              </button>
            )}
            <button className="text-sm text-green-100 hover:text-white flex items-center">
              <BookOpen className="w-4 h-4 mr-1" /> Manage Student Schedules
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full relative">
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
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="bg-gray-50 py-2 text-center text-sm font-bold text-gray-600">{day}</div>
              ))}
              
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
                          className={`text-xs p-1.5 rounded shadow-sm cursor-pointer transition-all ${
                            schedule.isConflicting 
                              ? 'bg-red-50 border border-red-300 text-red-800 hover:bg-red-100 ring-2 ring-red-500/20' 
                              : 'bg-yellow-100 border border-yellow-300 text-yellow-800 hover:bg-yellow-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-bold truncate">{schedule.subject}</div>
                            {schedule.isConflicting && <AlertTriangle className="w-3 h-3 text-red-600 ml-1" />}
                          </div>
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

      <ConflictPanel 
        isOpen={isConflictPanelOpen} 
        onClose={() => setIsConflictPanelOpen(false)}
        conflicts={schedules.filter(s => s.isConflicting).map(s => ({
          ...s,
          type: 'General',
          conflictWith: s.conflictDetails?.[0]
        }))}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create New Schedule"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formConflicts.length > 0 && (
            <div className="bg-red-50 border-l-4 border-red-500 p-3 flex items-start">
              <AlertTriangle className="w-5 h-5 text-red-600 mr-3 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-red-800">Potential Conflict Detected!</p>
                <p className="text-[11px] text-red-700 mt-0.5">
                  This time slot overlaps with another class in the same {formConflicts[0].type.toLowerCase()}.
                </p>
              </div>
            </div>
          )}

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
              className={`px-4 py-2 text-sm font-medium text-white rounded-md shadow-sm ${
                formConflicts.length > 0 ? 'bg-orange-600 hover:bg-orange-700' : 'bg-green-700 hover:bg-green-800'
              }`}
            >
              {formConflicts.length > 0 ? 'Save Anyway' : 'Save Schedule'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
    </>
  );
}
