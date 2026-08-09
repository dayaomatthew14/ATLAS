import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Outlet } from 'react-router-dom';
import { X } from 'lucide-react';
import { api } from '../utils/api';
import { clearSession, getRole, getDepartment, getUserName, ROLES } from '../utils/session';
import { ROLE_LABELS } from '../components/ui/tokens';
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
  '3rd semester': '3rd Term',
};

const getProfilePictureUrl = (path) => {
  if (!path) return '';
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl && apiUrl.startsWith('http')) {
    try {
      return `${new URL(apiUrl).origin}${cleanPath}`;
    } catch {
      /* a malformed VITE_API_URL falls back to the relative path */
    }
  }
  return cleanPath;
};

/**
 * Guided tour. Each step names a route that exists — the tour is the only
 * remaining consumer of the old onboarding flow, so its copy is kept plain and
 * describes what the screen is for rather than advertising features.
 *
 * There are two tours, for the same reason there are two rails: the one tour
 * walked every role through Faculty and Schedule, neither of which an
 * administrator may open, so the last two steps of their own onboarding ended
 * on "You do not have access to this page".
 */
const CHAIR_TOUR_STEPS = [
  {
    title: 'Overview',
    desc: 'Check the active academic term and what still needs attention before you generate.',
    path: '/dashboard',
    nextLabel: 'Next: Rooms',
  },
  {
    title: 'Rooms',
    desc: 'Register lecture halls and laboratories with their student capacity.',
    path: '/dashboard/rooms',
    nextLabel: 'Next: Curriculum',
  },
  {
    title: 'Curriculum',
    desc: 'Review the subjects, credit units, and offerings for your department.',
    path: '/dashboard/curriculum',
    nextLabel: 'Next: Faculty',
  },
  {
    title: 'Faculty',
    desc: 'Set teaching unit caps and mark the times each faculty member cannot teach.',
    path: '/dashboard/teachers',
    nextLabel: 'Next: Schedule',
  },
  {
    title: 'Schedule',
    desc: 'Generate the timetable, resolve conflicts one at a time, then export or print.',
    path: '/dashboard/schedules',
    nextLabel: 'Finish',
  },
];

const ADMIN_TOUR_STEPS = [
  {
    title: 'Overview',
    desc: 'Check what needs you: accounts awaiting verification, curriculum gaps, orphaned data.',
    path: '/dashboard',
    nextLabel: 'Next: Users',
  },
  {
    title: 'Users',
    desc: 'Verify new registrations and give every account a role and a college.',
    path: '/dashboard/users',
    nextLabel: 'Next: Colleges',
  },
  {
    title: 'Colleges & Programmes',
    desc: 'Maintain the colleges and the programmes each one offers.',
    path: '/dashboard/colleges',
    nextLabel: 'Next: Curriculum',
  },
  {
    title: 'Curriculum',
    desc: 'Import and revise the catalog each programme is taught from.',
    path: '/dashboard/curriculum',
    nextLabel: 'Next: Academic Terms',
  },
  {
    title: 'Academic Terms',
    desc: 'Set the active academic year and term. No department can generate until one is active.',
    path: '/dashboard/semesters',
    nextLabel: 'Next: Rooms',
  },
  {
    title: 'Rooms',
    desc: 'Register lecture halls and laboratories with their student capacity.',
    path: '/dashboard/rooms',
    nextLabel: 'Finish',
  },
];

export default function Dashboard() {
  const navigate = useNavigate();

  const role = getRole();
  const isAdmin = role === ROLES.ADMIN;
  const department = getDepartment();
  const roleDisplay = ROLE_LABELS[role] || 'Signed in';
  const tourSteps = isAdmin ? ADMIN_TOUR_STEPS : CHAIR_TOUR_STEPS;

  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [profileName, setProfileName] = useState(() => getUserName() || roleDisplay);
  const [profilePicture, setProfilePicture] = useState(
    () => localStorage.getItem('atlas_profile_picture') || ''
  );
  const [conflictCount, setConflictCount] = useState(0);

  // --- Shell state --------------------------------------------------------
  // The context bar must always show the academic term, which previously
  // appeared only as a card on Overview (audit finding IA-01).
  const [activeTerm, setActiveTerm] = useState(null);
  // Distinct from `activeTerm === null`. Without this the bar asserted
  // "No active term" during the fetch, which is a false negative shown on
  // every page load — the opposite of what the context bar exists to do.
  const [termLoading, setTermLoading] = useState(true);
  // Navigation rail width. Persisted, because it is a working preference: an
  // admin on a laptop wants the labels, the same admin on the timetable wants
  // the 176px back. Defaults to collapsed on narrower desktops, where the rail
  // and a 904px-minimum grid do not both fit.
  const [railCollapsed, setRailCollapsed] = useState(() => {
    const stored = localStorage.getItem('atlas_rail_collapsed');
    if (stored !== null) return stored === 'true';
    return typeof window !== 'undefined' && window.innerWidth < 1440;
  });

  useEffect(() => {
    localStorage.setItem('atlas_rail_collapsed', String(railCollapsed));
  }, [railCollapsed]);

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
    const stored = localStorage.getItem('atlas_density') || 'comfortable';
    if (stored === 'compact') document.documentElement.setAttribute('data-density', 'compact');
    else document.documentElement.removeAttribute('data-density');
  }, []);

  const termLabel = termLoading
    ? null
    : activeTerm
      ? `A.Y. ${activeTerm.academic_year} · ${TERM_LABELS[activeTerm.term] || activeTerm.term}`
      : 'No active term';

  useEffect(() => {
    const handleProfileUpdate = () => {
      setProfileName(getUserName() || roleDisplay);
      setProfilePicture(localStorage.getItem('atlas_profile_picture') || '');
    };
    window.addEventListener('atlas_profile_updated', handleProfileUpdate);
    return () => window.removeEventListener('atlas_profile_updated', handleProfileUpdate);
  }, [roleDisplay]);

  // Conflicts are a scheduling concern and the badge that carries them hangs on
  // the Schedule rail item, which the administrator no longer has. Polling it
  // every 30s for a number nothing renders is a request per half-minute for
  // nothing, so the poll is scoped to the roles that can act on the answer.
  useEffect(() => {
    if (isAdmin) return;
    const fetchConflictCount = async () => {
      try {
        const data = await api.get('/conflicts/count');
        setConflictCount(data.count || 0);
      } catch {
        setConflictCount(0);
      }
    };
    fetchConflictCount();
    const interval = setInterval(fetchConflictCount, 30000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  const handleLogout = useCallback(async () => {
    // The session cookie is HttpOnly: this request is the only thing that can
    // clear it, and `clearSession()` below reaches localStorage only. If it
    // fails, the browser keeps sending a credential the user has just said
    // they are finished with -- so the local state is still cleared and the
    // user is still sent to the login screen, but they are told the session
    // was not ended on the server rather than being left to assume it was.
    let serverSessionEnded = true;
    try {
      await api.post('/auth/logout', {});
    } catch {
      serverSessionEnded = false;
    }
    clearSession();
    navigate('/login', {
      state: serverSessionEnded ? undefined : { signOutIncomplete: true },
    });
  }, [navigate]);

  // --- Guided tour --------------------------------------------------------
  const [tourStep, setTourStep] = useState(0); // 0 = inactive, 1..n = step
  const isTourActive = tourStep > 0;
  const currentStep = isTourActive ? tourSteps[tourStep - 1] : null;

  const goToStep = (step) => {
    setTourStep(step);
    navigate(tourSteps[step - 1].path);
  };

  const handleTourNext = () => {
    if (tourStep < tourSteps.length) goToStep(tourStep + 1);
    else setTourStep(0);
  };

  return (
    <>
      <AppShell
        role={role}
        department={department}
        termLabel={termLabel}
        canChangeTerm={isAdmin}
        isPublished={false}
        conflictCount={conflictCount}
        profileName={profileName}
        profilePicture={profilePicture}
        getProfilePictureUrl={getProfilePictureUrl}
        railCollapsed={railCollapsed}
        onOpenTerm={() => navigate('/dashboard/semesters')}
        onToggleRail={() => setRailCollapsed((v) => !v)}
        onOpenGuide={() => setIsGuideOpen(true)}
        onLogout={handleLogout}
      >
        <Outlet />
      </AppShell>

      {isTourActive && (
        <div
          role="region"
          aria-label="Guided tour"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-toast w-[90%] max-w-xl
                     bg-atlas-900 text-white rounded-panel shadow-overlay border border-white/10
                     px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4"
        >
          <div className="flex-1 min-w-0">
            <p className="font-ui text-micro uppercase text-atlas-300">
              Step {tourStep} of {tourSteps.length} · {currentStep.title}
            </p>
            <p className="font-ui text-caption text-atlas-100 mt-1 leading-snug">
              {currentStep.desc}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {tourStep > 1 && (
              <button
                type="button"
                onClick={() => goToStep(tourStep - 1)}
                className="h-9 px-3 rounded-control font-ui text-caption text-atlas-100
                           hover:bg-white/10 hover:text-white transition-colors duration-state ease-standard
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atlas-300"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={handleTourNext}
              className="h-9 px-4 rounded-control bg-white text-atlas-900 font-ui font-medium text-caption
                         hover:bg-atlas-100 transition-colors duration-state ease-standard
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atlas-300"
            >
              {currentStep.nextLabel}
            </button>
            <button
              type="button"
              onClick={() => setTourStep(0)}
              aria-label="Exit guided tour"
              className="w-9 h-9 inline-flex items-center justify-center rounded-field text-atlas-300
                         hover:bg-white/10 hover:text-white transition-colors duration-state ease-standard
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atlas-300"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <SystemGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        onStartTour={() => {
          setIsGuideOpen(false);
          goToStep(1);
        }}
      />
    </>
  );
}
