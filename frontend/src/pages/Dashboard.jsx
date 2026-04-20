import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, LayoutDashboard, BookOpen, Layers, MapPin, Calendar, Users, GraduationCap, ChevronLeft, ChevronRight, Plus } from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();
  const role = localStorage.getItem('atlas_role') || 'User';

  const handleLogout = () => {
    localStorage.removeItem('atlas_token');
    localStorage.removeItem('atlas_role');
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', icon: LayoutDashboard, active: false },
    { name: 'Subjects', icon: BookOpen, active: false },
    { name: 'Sections', icon: Layers, active: false },
    { name: 'Rooms', icon: MapPin, active: false },
    { name: 'Schedules', icon: Calendar, active: true },
    { name: 'Students', icon: GraduationCap, active: false },
    { name: 'Teachers', icon: Users, active: false },
  ];

  return (
    <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
      {/* Top Navbar */}
      <nav className="bg-green-800 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-yellow-400 text-green-900 rounded-full flex items-center justify-center font-black text-lg">A</div>
              <span className="font-bold tracking-wide">Class Scheduler</span>
            </div>
            
            <div className="hidden md:flex space-x-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button 
                    key={item.name} 
                    type="button"
                    className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      item.active 
                        ? 'bg-green-900 text-white border-b-2 border-yellow-400' 
                        : 'text-green-100 hover:bg-green-700 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4 mr-1.5" />
                    {item.name}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gray-200 rounded-full overflow-hidden">
                  {/* Placeholder Avatar */}
                  <img src="https://ui-avatars.com/api/?name=Admin+User&background=0D8ABC&color=fff" alt="User" />
                </div>
                <span className="text-sm font-medium capitalize hidden sm:block">{role} ▾</span>
              </div>
              <button onClick={handleLogout} className="text-green-200 hover:text-white p-1">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </nav>

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
              <button className="px-3 py-1.5 border border-gray-200 rounded bg-white text-gray-600 text-sm hover:bg-gray-50 flex items-center transition-colors">
                <ChevronLeft className="w-4 h-4 mr-1" /> Previous
              </button>
            </div>
            
            <h3 className="text-xl font-bold text-gray-800">September 2026</h3>
            
            <div className="flex space-x-2 items-center">
              <button className="px-3 py-1.5 border border-gray-200 rounded bg-white text-gray-600 text-sm hover:bg-gray-50 flex items-center mr-2 transition-colors">
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </button>
              <button className="px-4 py-2 bg-green-700 hover:bg-green-800 text-white rounded-lg text-sm font-medium flex items-center shadow-sm transition-colors">
                <Plus className="w-4 h-4 mr-1" /> Create New Schedule
              </button>
            </div>
          </div>

          {/* Calendar Grid (Static Mockup mimicking screenshot 2) */}
          <div className="p-4">
            <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
              {/* Days Header */}
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="bg-gray-50 py-2 text-center text-sm font-bold text-gray-600">
                  {day}
                </div>
              ))}
              
              {/* Fake Calendar Cells */}
              {Array.from({ length: 35 }).map((_, i) => {
                const isTue = (i % 7) === 2;
                const isWed = (i % 7) === 3;
                const hasClass = i > 6 && i < 28 && (isTue || isWed);
                
                return (
                  <div key={i} className="bg-white min-h-[100px] p-2 relative group hover:bg-gray-50 transition-colors">
                    <span className="absolute top-2 right-2 text-xs font-medium text-gray-400">{i + 1 > 30 ? (i % 30) + 1 : i + 1}</span>
                    
                    {hasClass && isTue && (
                      <div className="mt-6 text-xs bg-yellow-100 border border-yellow-300 text-yellow-800 p-1.5 rounded shadow-sm cursor-pointer hover:bg-yellow-200">
                        <div className="font-bold truncate">Financing</div>
                        <div className="text-[10px] opacity-80">(7:30 AM - 8:30 AM)</div>
                      </div>
                    )}
                    
                    {hasClass && isWed && (
                      <div className="mt-6 text-xs bg-yellow-100 border border-yellow-300 text-yellow-800 p-1.5 rounded shadow-sm cursor-pointer hover:bg-yellow-200">
                        <div className="font-bold truncate">Operations Mgt.</div>
                        <div className="text-[10px] opacity-80">(7:30 AM - 8:30 AM)</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
