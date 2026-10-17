import React from 'react';
import { Link } from 'react-router-dom';
import { Menu, ChevronDown } from 'lucide-react';
import { focusRingOnDark } from '../ui/tokens';

/**
 * ATLAS top bar. 56px, green-900. Phase 2 Screen 1.
 *
 * Sits to the right of the full-height navigation sidebar on desktop.
 * On mobile (< 1024px), provides the hamburger menu button and institutional mark.
 * User profile & account menu are docked at the bottom of the sidebar.
 */
export default function TopBar({
  termLabel,
  onOpenTerm,
  canChangeTerm,
  onOpenDrawer,
}) {
  const iconBtn =
    `w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-field text-atlas-100 ` +
    `hover:bg-white/10 hover:text-white transition-colors duration-state ease-standard ${focusRingOnDark}`;

  return (
    <header className="h-14 shrink-0 glass-dark border-x-0 border-t-0 border-b border-emerald-500/20 flex items-center justify-between px-4 z-10">
      {/* Mobile-only navigation trigger & institutional lockup */}
      <div className="flex items-center gap-2 lg:hidden">
        <button
          type="button"
          onClick={onOpenDrawer}
          className={iconBtn}
          aria-label="Open navigation"
        >
          <Menu className="w-5 h-5" aria-hidden="true" />
        </button>

        <Link
          to="/dashboard"
          className={`flex items-center gap-2 rounded-full py-1 px-1.5 hover:bg-white/5 transition-colors ${focusRingOnDark}`}
        >
          <img src="/atlas_logo.png" alt="De La Salle Araneta University" className="h-7 w-7 object-contain drop-shadow-md" />
          <span className="font-bold text-base tracking-tight text-white leading-none">ATLAS</span>
        </Link>
      </div>

      {/* Desktop spacer to keep the Academic Term pill centered */}
      <div className="hidden lg:block w-28 shrink-0" aria-hidden="true" />

      {/* Academic term. Styled with the glowing institutional pill badge. */}
      <div className="flex-1 min-w-0 flex justify-center px-2">
        {termLabel === null ? (
          <span
            className="h-8 w-52 rounded-full bg-emerald-900/40 border border-emerald-400/20 animate-pulse motion-reduce:animate-none"
            aria-hidden="true"
          />
        ) : canChangeTerm ? (
          <button
            type="button"
            onClick={onOpenTerm}
            aria-haspopup="dialog"
            className={`max-w-full inline-flex items-center gap-2 h-9 px-4 rounded-full
                        bg-emerald-900/60 border border-emerald-400/30 text-emerald-100 hover:bg-emerald-800/80 hover:text-white hover:border-emerald-300/50
                        font-ui text-caption font-bold tracking-wide transition-all duration-state ease-standard shadow-xs ${focusRingOnDark}`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" aria-hidden="true" />
            <span className="truncate">{termLabel}</span>
            <ChevronDown className="w-4 h-4 shrink-0 text-emerald-300" aria-hidden="true" />
          </button>
        ) : (
          <span className="max-w-full inline-flex items-center gap-2 h-9 px-4 rounded-full bg-emerald-900/40 border border-emerald-400/20 font-ui text-caption font-bold tracking-wide text-emerald-100 truncate">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" aria-hidden="true" />
            <span className="truncate">{termLabel}</span>
          </span>
        )}
      </div>

      {/* Desktop right spacer to balance the layout */}
      <div className="hidden lg:block w-28 shrink-0" aria-hidden="true" />
    </header>
  );
}
