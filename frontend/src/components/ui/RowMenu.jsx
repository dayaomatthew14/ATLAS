import React from 'react';
import { MoreHorizontal } from 'lucide-react';
import { focusRing } from './tokens';

/**
 * Overflow menu for table rows. Phase 2 Screen 4.
 *
 * Replaces rows of always-visible 32px icon buttons. Three of those — one of
 * them destructive — sitting a few pixels apart is both a mis-tap hazard and a
 * failure of the 44px target guidance (A11Y-07). One 40px trigger, with the
 * actions named in text inside the menu.
 *
 * items: [{ label, onSelect, destructive?, disabled?, disabledReason? }]
 */
export default function RowMenu({ items = [], label = 'Row actions' }) {
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const wrapRef = React.useRef(null);
  const triggerRef = React.useRef(null);
  const itemRefs = React.useRef([]);

  const enabled = items.filter((i) => !i.disabled);

  React.useEffect(() => {
    if (!open) return;
    const onClickAway = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, [open]);

  React.useEffect(() => {
    if (open) itemRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const onKeyDown = (e) => {
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => (i + 1) % items.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => (i - 1 + items.length) % items.length); }
    else if (e.key === 'Home') { e.preventDefault(); setActiveIndex(0); }
    else if (e.key === 'End') { e.preventDefault(); setActiveIndex(items.length - 1); }
  };

  return (
    <div className="relative inline-block text-left" ref={wrapRef} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => { setActiveIndex(0); setOpen((v) => !v); }}
        className={`w-10 h-10 inline-flex items-center justify-center rounded-field text-atlas-slate
                    hover:bg-atlas-50 hover:text-atlas-ink transition-colors duration-state
                    ease-standard ${focusRing}`}
      >
        <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={label}
          className="absolute right-0 mt-1 min-w-48 rounded-panel bg-atlas-surface border
                     border-atlas-line shadow-overlay py-1 z-overlay"
        >
          {items.map((item, i) => (
            <button
              key={item.label}
              ref={(el) => { itemRefs.current[i] = el; }}
              type="button"
              role="menuitem"
              // Disabled items stay focusable so their reason is reachable,
              // matching the role-restricted button treatment.
              aria-disabled={item.disabled || undefined}
              title={item.disabled ? item.disabledReason : undefined}
              tabIndex={-1}
              onClick={() => {
                if (item.disabled) return;
                close(false);
                item.onSelect();
              }}
              className={[
                'w-full text-left px-3 h-10 font-ui text-body transition-colors duration-state ease-standard',
                'focus-visible:outline-none',
                item.disabled
                  ? 'text-atlas-disabled cursor-not-allowed'
                  : item.destructive
                    ? 'text-sem-conflict hover:bg-sem-conflict-bg focus-visible:bg-sem-conflict-bg'
                    : 'text-atlas-ink hover:bg-atlas-50 focus-visible:bg-atlas-50',
              ].join(' ')}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
