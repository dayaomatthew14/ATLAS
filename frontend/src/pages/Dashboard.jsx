import React, { useState } from 'react';
import { useNavigate, Outlet, useLocation, Link } from 'react-router-dom';
import { LogOut, LayoutDashboard, BookOpen, Layers, MapPin, Calendar, Users, GraduationCap, School, ChevronDown, Folder } from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false);
  
  // Normalized role check
  const rawRole = localStorage.getItem('atlas_role') || 'guest';
  const role = rawRole.toLowerCase();
  
  const department = localStorage.getItem('atlas_department');
  const dashboardTitle = department ? `${department} Program Chair Portal` : 'DLSAU Tertiary Education';

  const handleLogout = () => {
    localStorage.removeItem('atlas_token');
    localStorage.removeItem('atlas_role');
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', roles: ['admin', 'program_chair', 'faculty', 'student'] },
    { name: 'Schedules', icon: Calendar, path: '/dashboard/schedules', roles: ['admin', 'program_chair', 'faculty', 'student'] },
    { name: 'Subjects', icon: BookOpen, path: '/dashboard/subjects', roles: ['admin', 'program_chair'] },
    { name: 'Sections', icon: Layers, path: '/dashboard/sections', roles: ['admin', 'program_chair'] },
    { name: 'Rooms', icon: MapPin, path: '/dashboard/rooms', roles: ['admin', 'program_chair'] },
    { name: 'Colleges', icon: School, path: '/dashboard/colleges', roles: ['admin'] },
    { name: 'Teachers', icon: Users, path: '/dashboard/teachers', roles: ['admin', 'program_chair'] },
  ];

  // Filter items based on normalized role
  const filteredNavItems = navItems.filter(item => item.roles.includes(role));

  return (
    <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
      {/* Top Navbar */}
      <nav className="bg-green-800 text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/dashboard" className="flex items-center space-x-3 group">
              <img src="/atlas_logo.png" alt="Atlas Logo" className="w-10 h-10 object-contain transform group-hover:rotate-6 transition-transform filter brightness-110 drop-shadow-md" />
              <div className="hidden sm:block">
                <span className="font-black text-lg tracking-tighter block leading-none">ATLAS</span>
                <span className="text-[10px] font-bold text-yellow-400 uppercase tracking-widest opacity-80">{dashboardTitle}</span>
              </div>
            </Link>
            
            <div className="hidden md:flex space-x-1 items-center">
              {filteredNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = item.path === '/dashboard' 
                  ? location.pathname === '/dashboard' 
                  : location.pathname.startsWith(item.path);
                
                return (
                  <Link 
                    key={item.name} 
                    to={item.path}
                    className={`flex items-center px-4 py-2 rounded-xl text-sm font-bold transition-all duration-200 ${
                      isActive 
                        ? 'bg-white text-green-800 shadow-md transform -translate-y-0.5' 
                        : 'text-green-50 hover:bg-green-700 hover:text-white'
                    }`}
                  >
                    <Icon className={`w-4 h-4 mr-2 ${isActive ? 'text-green-700' : 'text-green-200'}`} />
                    {item.name}
                  </Link>
                );
              })}


            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3 bg-green-900/50 px-3 py-1.5 rounded-2xl border border-white/10">
                <div className="w-8 h-8 bg-white/20 rounded-full overflow-hidden border border-white/20 shadow-inner">
                  <img src={`https://ui-avatars.com/api/?name=${rawRole}&background=random&color=fff`} alt="User" />
                </div>
                <div className="hidden lg:block text-left">
                  <p className="text-xs font-black uppercase tracking-widest text-yellow-400 leading-none mb-0.5">{role}</p>
                  <p className="text-[10px] font-medium text-green-200 leading-none">Logged In</p>
                </div>
              </div>
              <button 
                onClick={handleLogout} 
                className="text-green-100 hover:text-white p-2 hover:bg-red-500/20 rounded-xl transition-all group"
                title="Log Out"
              >
                <LogOut className="w-5 h-5 group-hover:scale-110 transition-transform" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-1 flex flex-col overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
