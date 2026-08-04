import React, { useState, useEffect } from 'react';
import { useNavigate, Outlet, useLocation, Link } from 'react-router-dom';
import { LogOut, LayoutDashboard, BookOpen, Layers, MapPin, Calendar, Users, GraduationCap, School, ChevronDown, Folder, AlertCircle, Activity, HelpCircle, Sparkles, X, ShieldCheck } from 'lucide-react';
import { api } from '../utils/api';
import SystemGuideModal from '../components/SystemGuideModal';
import AppShell from '../components/shell/AppShell';

/**
 * Semester.term is stored as '1st' | '2nd' | '3rd semester' — the third value
 * is inconsistent with the other two (audit finding, Phase 2 Screen 7). The UI
 * normalises here so the inconsistency stays in one place.
 */
const TERM_LABELS = {
  '1st': '1st Term',
  '2nd': '2nd Term',
  '3rd semester': 'Midyear',
};

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

  // Normalized role check
  const rawRole = localStorage.getItem('atlas_role') || 'guest';
  const role = rawRole.toLowerCase();
  const roleDisplay = role === 'coordinator' ? 'Coordinator' : (role === 'admin' ? 'System Administrator' : 'Program Chair');

  const [profileName, setProfileName] = useState(localStorage.getItem('atlas_user_name') || roleDisplay);
  const [profilePicture, setProfilePicture] = useState(localStorage.getItem('atlas_profile_picture') || '');

  const [conflictCount, setConflictCount] = useState(0);
  const department = localStorage.getItem('atlas_department');
  const dashboardTitle = department ? `${department} ${roleDisplay} Portal` : 'DLSAU Tertiary Education';

  // --- Shell state (Sprint 3) --------------------------------------------
  // The context bar must always show the academic term, which previously
  // appeared only as a card on Overview (audit finding IA-01).
  const [activeTerm, setActiveTerm] = useState(null);
  // Distinct from `activeTerm === null`. Without this the bar asserted
  // "No active term" during the fetch, which is a false negative shown on
  // every page load — the opposite of what the context bar exists to do.
  const [termLoading, setTermLoading] = useState(true);
  const [density, setDensity] = useState(
    () => localStorage.getItem('atlas_density') || 'comfortable'
  );

  useEffect(() => {
    let cancelled = false;

    const loadActiveTerm = () => {
      api.get('/semesters')
        .then((sems) => {
          if (cancelled) return;
          const list = Array.isArray(sems) ? sems : [];
          setActiveTerm(list.find((s) => s.is_active) || null);
        })
        .catch(() => { /* leave activeTerm null; the bar reports no active term */ })
        .finally(() => { if (!cancelled) setTermLoading(false); });
    };

    loadActiveTerm();

    // The context bar exists so nobody works in the wrong term, which means it
    // must not go stale the moment someone changes the active term. Terms
    // dispatches this after activating one, matching the existing
    // `atlas_profile_updated` pattern.
    window.addEventListener('atlas_term_changed', loadActiveTerm);
    return () => {
      cancelled = true;
      window.removeEventListener('atlas_term_changed', loadActiveTerm);
    };
  }, []);

  useEffect(() => {
    if (density === 'compact') document.documentElement.setAttribute('data-density', 'compact');
    else document.documentElement.removeAttribute('data-density');
    localStorage.setItem('atlas_density', density);
  }, [density]);

  const termLabel = termLoading
    ? null
    : activeTerm
      ? `A.Y. ${activeTerm.academic_year} · ${TERM_LABELS[activeTerm.term] || activeTerm.term}`
      : 'No active term';

  useEffect(() => {
    const handleProfileUpdate = () => {
      setProfileName(localStorage.getItem('atlas_user_name') || roleDisplay);
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
    localStorage.removeItem('atlas_token');
    localStorage.removeItem('atlas_role');
    localStorage.removeItem('atlas_user_name');
    localStorage.removeItem('atlas_department');
    localStorage.removeItem('atlas_profile_picture');
    navigate('/login');
  };

  // The adminNavItems / standardNavItems arrays moved into NavRail, which now
  // serves one label per destination to every role. The admin list previously
  // omitted Schedule and Faculty entirely (INV-01).

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
    <>
      <AppShell
        role={role}
        department={department}
        termLabel={termLabel}
        canChangeTerm={role === 'admin'}
        onOpenTerm={() => navigate('/dashboard/semesters')}
        isPublished={false}
        conflictCount={conflictCount}
        profileName={profileName}
        profilePicture={profilePicture}
        getProfilePictureUrl={getProfilePictureUrl}
        density={density}
        onToggleDensity={() => setDensity((d) => (d === 'compact' ? 'comfortable' : 'compact'))}
        onOpenGuide={() => setIsGuideOpen(true)}
        onLogout={handleLogout}
      >
        <Outlet />
      </AppShell>

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
    </>
  );
}
