import React, { useState, useEffect } from 'react';
import { useNavigate, Outlet, useLocation, Link } from 'react-router-dom';
import { LogOut, LayoutDashboard, BookOpen, Layers, MapPin, Calendar, Users, GraduationCap, School, ChevronDown, Folder, AlertCircle, Activity } from 'lucide-react';
import { api } from '../utils/api';

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // Normalized role check
  const rawRole = localStorage.getItem('atlas_role') || 'guest';
  const role = rawRole.toLowerCase();

  const [conflictCount, setConflictCount] = useState(0);
  const department = localStorage.getItem('atlas_department');
  const dashboardTitle = department ? `${department} Program Chair Portal` : 'DLSAU Tertiary Education';

  useEffect(() => {
    const fetchConflictCount = async () => {
      try {
        const data = await api.get('/conflicts/count');
        setConflictCount(data.count || 0);
      } catch (e) {
        setConflictCount(0);
      }
    };
    fetchConflictCount();
    const interval = setInterval(fetchConflictCount, 30000); // Update every 30s
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('atlas_token');
    localStorage.removeItem('atlas_role');
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', roles: ['admin', 'program_chair', 'faculty', 'student'] },
    { name: 'Schedules', icon: Calendar, path: '/dashboard/schedules', roles: ['admin', 'program_chair', 'faculty', 'student'] },
    { name: 'Curriculum Flowchart', icon: BookOpen, path: '/dashboard/curriculum', roles: ['admin', 'program_chair'] },
    { name: 'Sections', icon: Layers, path: '/dashboard/sections', roles: ['admin', 'program_chair'] },
    { name: 'Rooms', icon: MapPin, path: '/dashboard/rooms', roles: ['admin', 'program_chair'] },
    { name: 'Professors', icon: Users, path: '/dashboard/teachers', roles: ['admin', 'program_chair'] },
    { name: 'System Logs', icon: Activity, path: '/dashboard/logs', roles: ['admin', 'program_chair'] },
  ];

  // Filter items based on normalized role
  const filteredNavItems = navItems.filter(item => item.roles.includes(role));

  return (
    <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
      {/* Top Navbar */}
      <nav className="bg-green-800 text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-full mx-auto px-6 sm:px-10 lg:px-12">
          <div className="flex items-center justify-start h-24 space-x-12">
            <Link to="/dashboard" className="flex items-center space-x-4 group shrink-0">
              <img src="/atlas_logo.png" alt="Atlas Logo" className="w-14 h-14 object-contain transform group-hover:rotate-6 transition-transform filter brightness-110 drop-shadow-md" />
              <div className="hidden sm:block">
                <span className="font-black text-4xl tracking-tighter block leading-none">ATLAS</span>
              </div>
            </Link>

            <div className="hidden md:flex space-x-2 items-center">
              {filteredNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = item.path === '/dashboard'
                  ? location.pathname === '/dashboard'
                  : location.pathname.startsWith(item.path);

                return (
                  <Link
                    key={item.name}
                    to={item.path}
                    className={`flex items-center px-6 py-3 rounded-2xl text-lg font-bold transition-all duration-200 ${isActive
                      ? 'bg-white text-green-800 shadow-md transform -translate-y-0.5'
                      : 'text-green-50 hover:bg-green-700 hover:text-white'
                      }`}
                  >
                    <Icon className={`w-5 h-5 mr-3 ${isActive ? 'text-green-700' : 'text-green-200'}`} />
                    {item.name}
                  </Link>
                );
              })}
            </div>

            <div className="relative ml-auto">
              <button
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="flex items-center space-x-4 bg-green-900/50 px-4 py-2 rounded-2xl border border-white/10 hover:bg-green-700/50 transition-colors"
              >
                <div className="w-12 h-12 bg-pink-100 rounded-full overflow-hidden border border-white/20 shadow-inner flex items-center justify-center">
                  <span className="text-pink-600 font-black text-sm uppercase">PR</span>
                </div>
                <div className="hidden lg:block text-left">
                  <p className="text-xs font-black uppercase tracking-tight text-white leading-none mb-1.5">
                    {localStorage.getItem('atlas_user_name') || 'Program Chair'}
                  </p>
                  <p className="text-[10px] font-bold text-yellow-400 uppercase tracking-widest leading-none">
                    {department || 'Tertiary Education'}
                  </p>
                </div>
                <ChevronDown className={`w-4 h-4 text-green-300 transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />
              </button>

              {isProfileOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsProfileOpen(false)}
                  ></div>
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-2xl py-2 z-50 border border-gray-100 animate-in fade-in slide-in-from-top-2">
                    <div className="px-4 py-2 border-b border-gray-50 mb-1">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Account</p>
                      <p className="text-sm font-bold text-gray-700 truncate">{localStorage.getItem('atlas_user_name') || 'Program Chair'}</p>
                    </div>
                    <button className="w-full flex items-center px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 font-medium transition-colors">
                      <Users className="w-4 h-4 mr-3 text-gray-400" />
                      View Profile
                    </button>
                    <button className="w-full flex items-center px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 font-medium transition-colors">
                      <Folder className="w-4 h-4 mr-3 text-gray-400" />
                      Settings
                    </button>
                    <div className="border-t border-gray-50 mt-1 pt-1">
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50 font-bold transition-colors"
                      >
                        <LogOut className="w-4 h-4 mr-3" />
                        Log Out
                      </button>
                    </div>
                  </div>
                </>
              )}
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
