import React, { useState, useEffect } from 'react';
import { useNavigate, Outlet, useLocation, Link } from 'react-router-dom';
import { LogOut, LayoutDashboard, BookOpen, Layers, MapPin, Calendar, Users, GraduationCap, School, ChevronDown, Folder, AlertCircle, Activity, HelpCircle, Sparkles } from 'lucide-react';
import { api } from '../utils/api';
import SystemGuideModal from '../components/SystemGuideModal';

const getProfilePictureUrl = (path) => {
  if (!path) return '';
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl && apiUrl.startsWith('http')) {
    try {
      const url = new URL(apiUrl);
      return `${url.origin}${cleanPath}`;
    } catch (e) {
      console.error(e);
    }
  }
  return cleanPath;
};

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  const [profileName, setProfileName] = useState(localStorage.getItem('atlas_user_name') || 'Program Chair');
  const [profilePicture, setProfilePicture] = useState(localStorage.getItem('atlas_profile_picture') || '');

  // Normalized role check
  const rawRole = localStorage.getItem('atlas_role') || 'guest';
  const role = rawRole.toLowerCase();

  const [conflictCount, setConflictCount] = useState(0);
  const department = localStorage.getItem('atlas_department');
  const dashboardTitle = department ? `${department} Program Chair Portal` : 'DLSAU Tertiary Education';

  useEffect(() => {
    const handleProfileUpdate = () => {
      setProfileName(localStorage.getItem('atlas_user_name') || 'Program Chair');
      setProfilePicture(localStorage.getItem('atlas_profile_picture') || '');
    };
    window.addEventListener('atlas_profile_updated', handleProfileUpdate);
    return () => {
      window.removeEventListener('atlas_profile_updated', handleProfileUpdate);
    };
  }, []);

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

  const handleLogout = async () => {
    try { await api.post('/auth/logout', {}); } catch {}
    localStorage.removeItem('atlas_role');
    localStorage.removeItem('atlas_user_name');
    localStorage.removeItem('atlas_department');
    localStorage.removeItem('atlas_profile_picture');
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', roles: ['admin', 'program_chair', 'faculty', 'student'] },
    { name: 'Schedules', icon: Calendar, path: '/dashboard/schedules', roles: ['admin', 'program_chair', 'faculty', 'student'] },
    { name: 'Curriculum Flowchart', icon: BookOpen, path: '/dashboard/curriculum', roles: ['admin', 'program_chair'] },
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
          <div className="flex items-center justify-between h-24">
            <Link to="/dashboard" className="flex items-center space-x-4 group shrink-0">
              <img src="/atlas_logo.png" alt="Atlas Logo" className="w-14 h-14 object-contain transform group-hover:rotate-6 transition-transform filter brightness-110 drop-shadow-md" />
              <div className="hidden sm:block">
                <span className="font-black text-4xl tracking-tighter block leading-none">ATLAS</span>
              </div>
            </Link>

            <div className="hidden md:flex flex-1 justify-center space-x-2 items-center">
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

            <div className="flex items-center gap-3 shrink-0">
              {/* Header User Guide Button */}
              <button
                type="button"
                onClick={() => setIsGuideOpen(true)}
                className="hidden sm:flex items-center gap-2 bg-green-900/60 hover:bg-green-700/60 px-4 py-2.5 rounded-2xl border border-white/10 text-xs font-bold text-green-100 transition-colors"
                title="Open System Guide"
              >
                <HelpCircle className="w-4 h-4 text-amber-300" />
                <span>Guide</span>
              </button>

              <div className="relative shrink-0">
                <button
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="flex items-center space-x-4 bg-green-900/50 px-4 py-2 rounded-2xl border border-white/10 hover:bg-green-700/50 transition-colors"
                >
                  <div className="w-12 h-12 bg-pink-100 rounded-full overflow-hidden border border-white/20 shadow-inner flex items-center justify-center">
                    {profilePicture ? (
                      <img src={getProfilePictureUrl(profilePicture)} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-pink-600 font-black text-sm uppercase">
                        {(() => {
                          const name = profileName;
                          const parts = name.trim().split(/\s+/);
                          if (parts.length >= 2) {
                            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
                          }
                          return name.substring(0, 2).toUpperCase();
                        })()}
                      </span>
                    )}
                  </div>
                  <div className="hidden lg:block text-left">
                    <p className="text-xs font-black uppercase tracking-tight text-white leading-none mb-1.5">
                      {profileName}
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
                        <p className="text-sm font-bold text-gray-700 truncate">{profileName}</p>
                      </div>
                      <button onClick={() => { setIsProfileOpen(false); setIsGuideOpen(true); }} className="w-full flex items-center px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 font-medium transition-colors">
                        <HelpCircle className="w-4 h-4 mr-3 text-amber-500" />
                        System Guide
                      </button>
                      <button onClick={() => { setIsProfileOpen(false); navigate('/dashboard/profile'); }} className="w-full flex items-center px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 font-medium transition-colors">
                        <Users className="w-4 h-4 mr-3 text-gray-400" />
                        View Profile
                      </button>
                      <button onClick={() => { setIsProfileOpen(false); navigate('/dashboard/settings'); }} className="w-full flex items-center px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 font-medium transition-colors">
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
        </div>
      </nav>

      <main className="flex-1 flex flex-col overflow-y-auto">
        <Outlet />
      </main>

      {/* Floating System Guide Widget (Bottom Left) */}
      <div className="fixed bottom-6 left-6 z-40">
        <button
          type="button"
          onClick={() => setIsGuideOpen(true)}
          className="bg-gradient-to-r from-emerald-600 to-green-700 hover:from-emerald-700 hover:to-green-800 text-white px-5 py-3 rounded-full shadow-xl shadow-green-900/30 flex items-center gap-2.5 transition-all transform hover:scale-105 active:scale-95 border border-white/20 group"
          title="Open ATLAS System Guide & User Manual"
        >
          <div className="bg-white/20 p-1.5 rounded-full group-hover:rotate-12 transition-transform">
            <Sparkles className="w-4 h-4 text-amber-300" />
          </div>
          <span className="text-xs font-black uppercase tracking-wider pr-1">User Guide 💡</span>
        </button>
      </div>

      {/* System Guide Modal */}
      <SystemGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
      />
    </div>
  );
}
