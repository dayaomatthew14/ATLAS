import React from 'react';
import { X } from 'lucide-react';
import TopBar from './TopBar';
import ContextBar from './ContextBar';
import NavRail from './NavRail';
import { focusRing } from '../ui/tokens';

/**
 * ATLAS application shell. Phase 2 Screen 1.
 *
 * Presentation only. Every piece of state and every handler is supplied by the
 * caller (Dashboard.jsx), so this component owns layout and nothing else.
 *
 * Layout:
 *   56px top bar  — lockup, term, density, guide, account
 *   36px context bar — department scope, role, gold ribbon
 *   rail + main   — 240px labelled at >=1440, 64px icons 1024–1439,
 *                   off-canvas drawer below 1024
 */
export default function AppShell({
  role,
  department,
  termLabel,
  isPublished,
  canChangeTerm,
  onOpenTerm,
  conflictCount,
  profileName,
  profilePicture,
  getProfilePictureUrl,
  railCollapsed,
  onToggleRail,
  onOpenGuide,
  onLogout,
  children,
}) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const drawerRef = React.useRef(null);

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
    <div className="glass-canvas min-h-screen h-screen flex flex-col text-atlas-ink">
      {/* First tabbable element on the page. */}
      <a
        href="#main"
        className={`sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-overlay
                    focus:px-3 focus:py-2 focus:rounded-field focus:bg-atlas-surface
                    focus:font-ui focus:text-body focus:text-atlas-ink focus:shadow-overlay ${focusRing}`}
      >
        Skip to main content
      </a>

      <TopBar
        termLabel={termLabel}
        onOpenTerm={onOpenTerm}
        canChangeTerm={canChangeTerm}
        profileName={profileName}
        profilePicture={profilePicture}
        getProfilePictureUrl={getProfilePictureUrl}
        railCollapsed={railCollapsed}
        onToggleRail={onToggleRail}
        onOpenGuide={onOpenGuide}
        onLogout={onLogout}
        onOpenDrawer={() => setDrawerOpen(true)}
      />

      {role !== 'admin' && (
        <ContextBar
          department={department}
          role={role}
          termLabel={termLabel}
          isPublished={isPublished}
        />
      )}

      <div className="flex-1 flex min-h-0">
        {/* Persistent rail from 1024 up. 64px icons, 240px with labels at 1440. */}
        <div
          className={`hidden lg:block shrink-0 transition-[width] duration-overlay ease-standard ${
            railCollapsed ? 'w-16' : 'w-60'
          }`}
        >
          <NavRail role={role} conflictCount={conflictCount} expanded={!railCollapsed} />
        </div>

        {/* Off-canvas drawer below 1024. The previous nav simply vanished under
            768px with no replacement, leaving mobile users no navigation. */}
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
              <div className="h-14 flex items-center justify-end px-2 shrink-0">
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
              {/* The drawer is 240px wide even on a phone, so labels always show. */}
              <div className="flex-1 min-h-0">
                <NavRail
                  role={role}
                  conflictCount={conflictCount}
                  onNavigate={() => setDrawerOpen(false)}
                  expanded
                />
              </div>
            </div>
          </div>
        )}

        <main id="main" tabIndex={-1} className="flex-1 min-w-0 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
