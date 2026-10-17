import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { User, Settings as SettingsIcon, LogOut, ChevronDown, HelpCircle } from 'lucide-react';
import { focusRingOnDark } from '../ui/tokens';

/**
 * ATLAS Sidebar User Profile widget.
 *
 * Sits at the bottom of the navigation rail/sidebar.
 * When collapsed (64px), displays the user's avatar.
 * When expanded (240px), displays the full profile card with name, role, and menu trigger.
 * Pops up the account menu upwards on click.
 */
export default function UserProfileWidget({
  profileName,
  profilePicture,
  getProfilePictureUrl,
  role,
  onOpenGuide,
  onLogout,
  expanded = false,
  onNavigate,
  onMenuToggle,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const widgetRef = useRef(null);

  const toggleMenu = () => {
    setMenuOpen((prev) => {
      const next = !prev;
      onMenuToggle?.(next);
      return next;
    });
  };

  const closeMenu = () => {
    setMenuOpen(false);
    onMenuToggle?.(false);
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') closeMenu();
    };
    const onClickOutside = (e) => {
      if (widgetRef.current && !widgetRef.current.contains(e.target)) {
        closeMenu();
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [menuOpen]);

  const initials = useMemo(() => {
    const parts = (profileName || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return (profileName || 'U').substring(0, 2).toUpperCase();
  }, [profileName]);

  const roleLabel = useMemo(() => {
    if (role === 'admin') return 'Administrator';
    const dept = typeof window !== 'undefined' ? (localStorage.getItem('atlas_department') || '') : '';
    if (role === 'coordinator') {
      return dept ? `${dept} · Coordinator` : 'Coordinator';
    }
    return dept ? `${dept} · Program Chair` : 'Program Chair';
  }, [role]);

  return (
    <div ref={widgetRef} className="relative shrink-0 border-t border-emerald-500/20 p-2">
      {/* Account trigger button */}
      <button
        type="button"
        onClick={toggleMenu}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`Account menu for ${profileName || 'user'}`}
        className={`w-full flex items-center h-11 rounded-xl p-1.5 transition-all duration-state ease-standard ${focusRingOnDark} ${
          menuOpen ? 'bg-white/15' : 'hover:bg-white/10'
        }`}
      >
        {/* Avatar circle */}
        <div className="w-8 h-8 rounded-full overflow-hidden bg-emerald-800 border border-emerald-400/40 text-amber-300 flex items-center justify-center font-ui text-caption font-bold shrink-0 shadow-xs mx-auto lg:mx-0">
          {profilePicture ? (
            <img
              src={getProfilePictureUrl?.(profilePicture)}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            initials
          )}
        </div>

        {/* User info (visible when expanded) */}
        <div
          className={`flex-1 min-w-0 text-left pl-2.5 transition-opacity duration-200 ${
            expanded ? 'opacity-100' : 'opacity-0 sr-only'
          }`}
        >
          <span className="block font-ui text-sm font-bold text-white truncate leading-tight">
            {profileName || 'User'}
          </span>
          <span className="block font-ui text-caption text-emerald-200/90 font-medium truncate leading-tight mt-0.5">
            {roleLabel}
          </span>
        </div>

        {/* Chevron indicator (visible when expanded) */}
        <ChevronDown
          className={`w-4 h-4 text-emerald-200/80 shrink-0 transition-transform duration-200 ml-1 ${
            menuOpen ? 'rotate-180 text-white' : ''
          } ${expanded ? 'opacity-100' : 'opacity-0 hidden'}`}
          aria-hidden="true"
        />
      </button>

      {/* Popup menu (opens upwards above the widget) */}
      {menuOpen && (
        <div
          role="menu"
          aria-label="Account options"
          className="absolute bottom-full left-2 right-2 mb-2 rounded-2xl glass-strong bg-white/95 backdrop-blur-md border border-emerald-900/15 py-1.5 z-overlay shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-150"
          style={{ minWidth: '220px' }}
        >
          <div className="px-3.5 py-2.5 border-b border-emerald-900/10">
            <span className="block font-ui text-caption uppercase tracking-wider text-emerald-900 font-bold">
              Signed in as
            </span>
            <span className="block font-ui text-body text-slate-900 font-bold truncate">
              {profileName}
            </span>
            <span className="block font-ui text-caption text-slate-600 font-medium truncate">
              {roleLabel}
            </span>
          </div>

          <div className="py-1">
            <MenuItem
              to="/dashboard/profile"
              icon={User}
              onSelect={() => {
                closeMenu();
                onNavigate?.();
              }}
            >
              Profile
            </MenuItem>
            <MenuItem
              to="/dashboard/settings"
              icon={SettingsIcon}
              onSelect={() => {
                closeMenu();
                onNavigate?.();
              }}
            >
              Settings
            </MenuItem>
            {onOpenGuide && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  closeMenu();
                  onOpenGuide();
                }}
                className="w-full flex items-center gap-2.5 px-3 h-10 font-ui text-body text-atlas-ink hover:bg-atlas-50 transition-colors duration-state ease-standard focus-visible:outline-none focus-visible:bg-atlas-50"
              >
                <HelpCircle className="w-4 h-4 shrink-0 text-emerald-700" aria-hidden="true" />
                User Guide
              </button>
            )}
          </div>

          <div className="border-t border-emerald-900/10 pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                closeMenu();
                onLogout();
              }}
              className="w-full flex items-center gap-2.5 px-3.5 h-10 font-ui text-body text-sem-conflict font-medium hover:bg-sem-conflict-bg transition-colors duration-state ease-standard focus-visible:outline-none focus-visible:bg-sem-conflict-bg"
            >
              <LogOut className="w-4 h-4 shrink-0 text-sem-conflict" aria-hidden="true" />
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
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
