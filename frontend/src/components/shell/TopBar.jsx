import React from 'react';
import { Link } from 'react-router-dom';
// Rows3/Rows4 do not exist in lucide-react 0.292 — Rows and AlignJustify do.
import { Menu, ChevronDown, HelpCircle, LogOut, User, Settings as SettingsIcon, Rows, AlignJustify } from 'lucide-react';
import { focusRingOnDark } from '../ui/tokens';

/**
 * ATLAS top bar. 56px, green-900. Phase 2 Screen 1.
 *
 * Institutional lockup: mark, clear space, hairline rule, then the ATLAS
 * wordmark. The wordmark sits AFTER the rule because ATLAS is a system
 * operated by the university, and the lockup should read in that order.
 *
 * NOTE: the repository contains only atlas_logo.png — there is no separate
 * DLSAU institutional mark asset. The lockup is built to accept one; when the
 * official mark is supplied, swap the <img> src and the wordmark stays put.
 */
export default function TopBar({
  termLabel,
  onOpenTerm,
  canChangeTerm,
  profileName,
  profilePicture,
  getProfilePictureUrl,
  density,
  onToggleDensity,
  onOpenGuide,
  onLogout,
  onOpenDrawer,
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false);
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [menuOpen]);

  const initials = React.useMemo(() => {
    const parts = (profileName || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return (profileName || 'U').substring(0, 2).toUpperCase();
  }, [profileName]);

  const iconBtn =
    `w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-field text-atlas-100 ` +
    `hover:bg-white/10 hover:text-white transition-colors duration-state ease-standard ${focusRingOnDark}`;

  return (
    <header className="h-14 shrink-0 bg-atlas-900 flex items-center gap-3 px-4 z-topbar">
      {/* Drawer trigger, below the rail breakpoint only. */}
      <button type="button" onClick={onOpenDrawer} className={`${iconBtn} lg:hidden`} aria-label="Open navigation">
        <Menu className="w-5 h-5" aria-hidden="true" />
      </button>

      {/* Institutional lockup */}
      <Link to="/dashboard" className={`flex items-center gap-4 shrink-0 rounded-field ${focusRingOnDark}`}>
        <img src="/atlas_logo.png" alt="De La Salle Araneta University" className="h-8 w-8 object-contain" />
        <span className="hidden lg:block h-6 w-px bg-atlas-300/40" aria-hidden="true" />
        <span className="hidden lg:block font-display text-[20px] leading-none text-white">ATLAS</span>
      </Link>

      {/* Academic term. A confirmed action for admins, a static label for
          everyone else — changing the active term is global and mutates what
          every department generates against. */}
      <div className="flex-1 min-w-0 flex justify-center px-2">
        {termLabel === null ? (
          // Reserve the same width so the bar does not shift when the term
          // resolves, and say nothing rather than something untrue.
          <span
            className="h-9 w-56 rounded-field bg-white/10 animate-pulse motion-reduce:animate-none"
            aria-hidden="true"
          />
        ) : canChangeTerm ? (
          <button
            type="button"
            onClick={onOpenTerm}
            aria-haspopup="dialog"
            className={`max-w-full inline-flex items-center gap-2 h-9 px-3 rounded-field
                        border border-atlas-300/30 text-atlas-100 hover:bg-white/10 hover:text-white
                        font-ui text-body transition-colors duration-state ease-standard ${focusRingOnDark}`}
          >
            <span className="truncate">{termLabel}</span>
            <ChevronDown className="w-4 h-4 shrink-0" aria-hidden="true" />
          </button>
        ) : (
          <span className="max-w-full inline-flex items-center h-9 px-3 font-ui text-body text-atlas-100 truncate">
            {termLabel}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onToggleDensity}
          className={iconBtn}
          aria-label={`Switch to ${density === 'compact' ? 'comfortable' : 'compact'} density`}
          aria-pressed={density === 'compact'}
        >
          {density === 'compact'
            ? <AlignJustify className="w-5 h-5" aria-hidden="true" />
            : <Rows className="w-5 h-5" aria-hidden="true" />}
        </button>

        <button type="button" onClick={onOpenGuide} className={iconBtn} aria-label="Open the ATLAS user guide">
          <HelpCircle className="w-5 h-5" aria-hidden="true" />
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={`flex items-center gap-2 h-9 pl-1 pr-2 rounded-field text-atlas-100
                        hover:bg-white/10 transition-colors duration-state ease-standard ${focusRingOnDark}`}
          >
            <span className="w-7 h-7 rounded-full overflow-hidden bg-atlas-100 text-atlas-900
                             flex items-center justify-center font-ui text-caption font-semibold shrink-0">
              {profilePicture
                ? <img src={getProfilePictureUrl(profilePicture)} alt="" className="w-full h-full object-cover" />
                : initials}
            </span>
            <ChevronDown className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="sr-only">Account menu for {profileName}</span>
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-56 rounded-panel bg-atlas-surface border border-atlas-line
                         shadow-overlay py-1 z-overlay"
            >
              <p className="px-3 py-2 border-b border-atlas-line">
                <span className="block font-ui text-micro uppercase text-atlas-slate">Signed in as</span>
                <span className="block font-ui text-body text-atlas-ink truncate">{profileName}</span>
              </p>
              <MenuItem to="/dashboard/profile" icon={User} onSelect={() => setMenuOpen(false)}>Profile</MenuItem>
              <MenuItem to="/dashboard/settings" icon={SettingsIcon} onSelect={() => setMenuOpen(false)}>Settings</MenuItem>
              <button
                type="button"
                role="menuitem"
                onClick={() => { setMenuOpen(false); onLogout(); }}
                className="w-full flex items-center gap-2.5 px-3 h-10 font-ui text-body text-sem-conflict
                           hover:bg-sem-conflict-bg transition-colors duration-state ease-standard
                           focus-visible:outline-none focus-visible:bg-sem-conflict-bg"
              >
                <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuItem({ to, icon: Icon, children, onSelect }) {
  return (
    <Link
      to={to}
      role="menuitem"
      onClick={onSelect}
      className="flex items-center gap-2.5 px-3 h-10 font-ui text-body text-atlas-ink
                 hover:bg-atlas-50 transition-colors duration-state ease-standard
                 focus-visible:outline-none focus-visible:bg-atlas-50"
    >
      <Icon className="w-4 h-4 shrink-0 text-atlas-slate" aria-hidden="true" />
      {children}
    </Link>
  );
}
