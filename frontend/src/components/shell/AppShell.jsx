import React from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import TopBar from './TopBar';
import NavRail from './NavRail';
import UserProfileWidget from './UserProfileWidget';
import { focusRing, focusRingOnDark } from '../ui/tokens';

/**
 * ATLAS application shell. Phase 2 Screen 1.
 *
 * Full-height navigation rail on the left, upper panel (TopBar) on top right.
 * The side panel stays collapsed as a 64px icon rail (like Image 2) and smoothly
 * expands to 240px when hovered, without shifting or jittering page content.
 */
export default function AppShell({
  role,
  termLabel,
  canChangeTerm,
  onOpenTerm,
  conflictCount,
  profileName,
  profilePicture,
  getProfilePictureUrl,
  onOpenGuide,
  onLogout,
  children,
}) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);
  const [isFocused, setIsFocused] = React.useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = React.useState(false);
  const drawerRef = React.useRef(null);
  const sidebarRef = React.useRef(null);

  const isExpanded = isHovered || isFocused || profileMenuOpen;

  // Collapse side panel whenever the user clicks outside on the panel/page
  React.useEffect(() => {
    const handlePointerDown = (e) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target)) {
        setIsHovered(false);
        setIsFocused(false);
        setProfileMenuOpen(false);
        if (sidebarRef.current.contains(document.activeElement)) {
          document.activeElement?.blur();
        }
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  // Close the drawer on Escape and restore focus, matching Dialog behaviour.
  React.useEffect(() => {
    if (!drawerOpen) return;
    const previouslyFocused = document.activeElement;
    const onKey = (e) => e.key === 'Escape' && setDrawerOpen(false);
    document.addEventListener('keydown', onKey);
    drawerRef.current?.querySelector('a, button')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [drawerOpen]);

  return (
    <div
      className="glass-canvas min-h-screen h-screen flex flex-row text-atlas-ink overflow-hidden font-sans"
      style={{ fontFamily: '"Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif' }}
    >
      {/* First tabbable element on the page. */}
      <a
        href="#main"
        className={`sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-overlay
                    focus:px-3 focus:py-2 focus:rounded-field focus:bg-atlas-surface
                    focus:font-ui focus:text-body focus:text-atlas-ink focus:shadow-overlay ${focusRing}`}
      >
        Skip to main content
      </a>

      {/* Desktop Persistent Rail (>= 1024px).
          Reserves a static 64px (w-16) in the flex layout so the page content never shifts.
          Expands smoothly to 240px (w-60) on hover or keyboard focus as an elevated overlay. */}
      <div className="hidden lg:block relative shrink-0 w-16 h-screen z-topbar">
        <aside
          ref={sidebarRef}
          id="primary-nav-sidebar"
          aria-label="Primary navigation"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => {
            setIsHovered(false);
            setIsFocused(false);
            if (sidebarRef.current?.contains(document.activeElement)) {
              document.activeElement?.blur();
            }
          }}
          onFocusCapture={(e) => {
            try {
              if (e.target?.matches(':focus-visible')) {
                setIsFocused(true);
              }
            } catch {
              setIsFocused(true);
            }
          }}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) {
              setIsFocused(false);
            }
          }}
          className={`absolute top-0 left-0 bottom-0 glass-dark border-y-0 border-l-0 border-r border-emerald-500/20
                     flex flex-col transition-[width] duration-300 ease-in-out overflow-hidden z-topbar
                     ${isExpanded ? 'w-60 shadow-2xl' : 'w-16 shadow-none'}`}
        >
          {/* Institutional Lockup in Sidebar Header (h-14 / 56px, aligns with TopBar) */}
          <div className="h-14 shrink-0 flex items-center border-b border-emerald-500/20 px-3 overflow-hidden">
            <Link
              to="/dashboard"
              onClick={() => {
                setIsHovered(false);
                setIsFocused(false);
                if (sidebarRef.current?.contains(document.activeElement)) {
                  document.activeElement?.blur();
                }
              }}
              className={`flex items-center h-10 w-full rounded-xl overflow-hidden hover:bg-white/5 transition-colors ${focusRingOnDark}`}
              aria-label="ATLAS DLSAU Portal Home"
            >
              <div className="w-10 h-10 shrink-0 flex items-center justify-center">
                <img
                  src="/atlas_logo.png"
                  alt="De La Salle Araneta University"
                  className="w-8 h-8 object-contain drop-shadow-md"
                />
              </div>
              <div
                className={`flex items-center gap-2.5 transition-opacity duration-200 ${
                  isExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
              >
                <span className="h-5 w-px bg-emerald-400/30 shrink-0" aria-hidden="true" />
                <div className="flex flex-col whitespace-nowrap">
                  <span className="font-bold text-base tracking-tight text-white leading-none">ATLAS</span>
                  <span className="font-ui text-[10px] uppercase tracking-wider text-emerald-300/80 font-semibold mt-0.5">
                    DLSAU Portal
                  </span>
                </div>
              </div>
            </Link>
          </div>

          {/* Navigation rail items */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <NavRail
              role={role}
              conflictCount={conflictCount}
              onNavigate={() => {
                setIsHovered(false);
                setIsFocused(false);
                setProfileMenuOpen(false);
                if (sidebarRef.current?.contains(document.activeElement)) {
                  document.activeElement?.blur();
                }
              }}
              expanded={isExpanded}
            />
          </div>

          {/* User profile docked under the navigation sidebar */}
          <UserProfileWidget
            profileName={profileName}
            profilePicture={profilePicture}
            getProfilePictureUrl={getProfilePictureUrl}
            role={role}
            onOpenGuide={role === 'admin' || canChangeTerm ? undefined : onOpenGuide}
            onLogout={onLogout}
            expanded={isExpanded}
            onMenuToggle={(open) => setProfileMenuOpen(open)}
            onNavigate={() => {
              setIsHovered(false);
              setIsFocused(false);
              setProfileMenuOpen(false);
            }}
          />
        </aside>
      </div>

      {/* Off-canvas drawer below 1024px */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-overlay flex">
          <div
            className="absolute inset-0 bg-atlas-900/50"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="relative w-60 max-w-[80vw] bg-atlas-900 shadow-overlay flex flex-col"
          >
            <div className="h-14 flex items-center justify-between px-3 shrink-0 border-b border-emerald-500/20">
              <Link
                to="/dashboard"
                onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-2.5"
              >
                <img src="/atlas_logo.png" alt="DLSAU" className="w-7 h-7 object-contain" />
                <span className="font-bold text-white text-base">ATLAS</span>
              </Link>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation"
                className="w-9 h-9 inline-flex items-center justify-center rounded-field
                           text-atlas-100 hover:bg-white/10 hover:text-white
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atlas-300"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <NavRail
                role={role}
                conflictCount={conflictCount}
                onNavigate={() => setDrawerOpen(false)}
                expanded
              />
            </div>

            {/* User profile docked at bottom of mobile drawer */}
            <UserProfileWidget
              profileName={profileName}
              profilePicture={profilePicture}
              getProfilePictureUrl={getProfilePictureUrl}
              role={role}
              onOpenGuide={role === 'admin' || canChangeTerm ? undefined : onOpenGuide}
              onLogout={onLogout}
              expanded={true}
              onNavigate={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main viewport: TopBar on top, content below */}
      <div
        className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden"
        onPointerDown={() => {
          setIsHovered(false);
          setIsFocused(false);
          setProfileMenuOpen(false);
          if (sidebarRef.current?.contains(document.activeElement)) {
            document.activeElement?.blur();
          }
        }}
      >
        <TopBar
          termLabel={termLabel}
          onOpenTerm={onOpenTerm}
          canChangeTerm={canChangeTerm}
          onOpenDrawer={() => setDrawerOpen(true)}
        />

        <main id="main" tabIndex={-1} className="flex-1 min-w-0 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
