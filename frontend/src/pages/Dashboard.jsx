import React, { useState, useEffect } from 'react';
import { useNavigate, Outlet, useLocation, Link } from 'react-router-dom';
import { LogOut, LayoutDashboard, BookOpen, Layers, MapPin, Calendar, Users, GraduationCap, School, ChevronDown, Folder, AlertCircle, Activity, HelpCircle, Sparkles, X } from 'lucide-react';
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

  const [isTourActive, setIsTourActive] = useState(false);
  const [tourStep, setTourStep] = useState(1);

  const tourSteps = [
    {
      step: 1,
      title: '1/5: Dashboard Overview',
      desc: 'Verify active academic semester status and overall department schedule metrics.',
      path: '/dashboard',
      nextLabel: 'Next: Rooms ➔'
    },
    {
      step: 2,
      title: '2/5: Campus Rooms & Labs',
      desc: 'Set up lecture halls and computer labs with accurate student capacity limits.',
      path: '/dashboard/rooms',
      nextLabel: 'Next: Curriculum ➔'
    },
    {
      step: 3,
      title: '3/5: Curriculum Flowchart',
      desc: 'Review department subjects, credit units, and curriculum offerings.',
      path: '/dashboard/curriculum',
      nextLabel: 'Next: Faculty ➔'
    },
    {
      step: 4,
      title: '4/5: Faculty & Workload Limits',
      desc: 'Assign professors, max unit caps, and day/time unavailability slots.',
      path: '/dashboard/teachers',
      nextLabel: 'Next: Schedules ➔'
    },
    {
      step: 5,
      title: '5/5: Schedules & AI Engine',
      desc: 'Run AI Generation, Solve Conflicts ✨, Restore 🔄, or Export CSV/PDF 📊!',
      path: '/dashboard/schedules',
      nextLabel: 'Finish Tour 🎉'
    }
  ];

  const handleTourNext = () => {
    if (tourStep < tourSteps.length) {
      const nextStepNum = tourStep + 1;
      setTourStep(nextStepNum);
      navigate(tourSteps[nextStepNum - 1].path);
    } else {
      setIsTourActive(false);
      setTourStep(1);
    }
  };

  const handleTourPrev = () => {
    if (tourStep > 1) {
      const prevStepNum = tourStep - 1;
      setTourStep(prevStepNum);
      navigate(tourSteps[prevStepNum - 1].path);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
      {/* Top Navbar */}
      <nav className="bg-gradient-to-r from-emerald-950/90 via-green-900/90 to-emerald-950/90 backdrop-blur-xl border-b border-white/10 text-white shadow-xl sticky top-0 z-50 transition-all">
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
                      ? 'bg-white text-green-900 shadow-md transform -translate-y-0.5'
                      : 'text-green-100/90 hover:bg-white/10 hover:text-white'
                      }`}
                  >
                    <Icon className={`w-5 h-5 mr-3 ${isActive ? 'text-green-800' : 'text-green-200/80'}`} />
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
                className="hidden sm:flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-2.5 rounded-2xl border border-white/15 text-xs font-bold text-green-100 transition-all shadow-xs"
                title="Open System Guide"
              >
                <HelpCircle className="w-4 h-4 text-amber-300" />
                <span>Guide</span>
              </button>

              <div className="relative shrink-0">
                <button
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="flex items-center space-x-4 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-2xl border border-white/15 transition-all shadow-xs"
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

      {/* Interactive Guided System Tour Controller */}
      {isTourActive && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex flex-col sm:flex-row items-center gap-4 animate-in slide-in-from-bottom-5 duration-300 border border-slate-800 max-w-xl w-[90%]">
          <div className="flex items-center gap-3 flex-1">
            <div className="bg-amber-400 text-slate-900 p-2 rounded-xl shrink-0 font-black text-xs">
              🎯
            </div>
            <div>
              <p className="text-xs font-black text-amber-300 uppercase tracking-wider">
                {tourSteps[tourStep - 1].title}
              </p>
              <p className="text-xs text-slate-200 mt-0.5 leading-snug font-medium">
                {tourSteps[tourStep - 1].desc}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {tourStep > 1 && (
              <button
                type="button"
                onClick={handleTourPrev}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all"
              >
                ⬅️ Back
              </button>
            )}
            <button
              type="button"
              onClick={handleTourNext}
              className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-black rounded-xl uppercase tracking-wider transition-all shadow-md"
            >
              {tourSteps[tourStep - 1].nextLabel}
            </button>
            <button
              type="button"
              onClick={() => setIsTourActive(false)}
              className="text-slate-400 hover:text-white p-1 ml-1"
              title="Exit Guided Tour"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* System Guide Modal */}
      <SystemGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        onStartTour={() => {
          setIsGuideOpen(false);
          setIsTourActive(true);
          setTourStep(1);
          navigate('/dashboard');
        }}
      />
    </div>
  );
}
