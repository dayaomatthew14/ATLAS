import React from 'react';
import { useNavigate, Outlet, useLocation } from 'react-router-dom';
import { LogOut, LayoutDashboard, BookOpen, Layers, MapPin, Calendar, Users, GraduationCap } from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const role = localStorage.getItem('atlas_role') || 'User';

  const handleLogout = () => {
    localStorage.removeItem('atlas_token');
    localStorage.removeItem('atlas_role');
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard/schedules' },
    { name: 'Subjects', icon: BookOpen, path: '/dashboard/subjects' },
    { name: 'Sections', icon: Layers, path: '/dashboard/sections' },
    { name: 'Rooms', icon: MapPin, path: '/dashboard/rooms' },
    { name: 'Schedules', icon: Calendar, path: '/dashboard/schedules' },
    { name: 'Students', icon: GraduationCap, path: '/dashboard/students' },
    { name: 'Teachers', icon: Users, path: '/dashboard/teachers' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
      {/* Top Navbar */}
      <nav className="bg-green-800 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center space-x-3 cursor-pointer" onClick={() => navigate('/dashboard')}>
              <div className="w-8 h-8 bg-yellow-400 text-green-900 rounded-full flex items-center justify-center font-black text-lg">A</div>
              <span className="font-bold tracking-wide">Class Scheduler</span>
            </div>
            
            <div className="hidden md:flex space-x-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <button 
                    key={item.name} 
                    type="button"
                    onClick={() => navigate(item.path)}
                    className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive 
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

      <Outlet />
    </div>
  );
}
