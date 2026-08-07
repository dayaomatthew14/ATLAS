import React from 'react';
import { createPortal } from 'react-dom';
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
 * The menu renders through a portal, anchored to the trigger with fixed
 * positioning. It has to: DataTable wraps its table in `overflow-x-auto` so
 * wide tables can scroll, and per CSS an element with one axis set to `auto`
 * resolves the other to `auto` as well. That box therefore clips vertically,
 * and an absolutely-positioned menu inside it was cut off at the table's edge —
 * 84px of it on the Terms screen, which put two of the three actions out of
 * reach entirely.
 *
 * items: [{ label, onSelect, destructive?, disabled?, disabledReason? }]
 */
export default function RowMenu({ items = [], label = 'Row actions' }) {
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const wrapRef = React.useRef(null);
  const triggerRef = React.useRef(null);
  const menuRef = React.useRef(null);
  const itemRefs = React.useRef([]);
  const [coords, setCoords] = React.useState(null);

  const MENU_WIDTH = 192;   // matches min-w-48

  /** Anchor to the trigger, flipping above it when the viewport is tight. */
  const place = React.useCallback(() => {
    const t = triggerRef.current?.getBoundingClientRect();
    if (!t) return;
    const height = menuRef.current?.offsetHeight || items.length * 40 + 8;
    const spaceBelow = window.innerHeight - t.bottom;
    const flip = spaceBelow < height + 8 && t.top > height + 8;
    setCoords({
      top: flip ? Math.max(8, t.top - height - 4) : t.bottom + 4,
      // Right-aligned to the trigger, but never off the left edge.
      left: Math.max(8, Math.min(t.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
    });
  }, [items.length]);

  React.useLayoutEffect(() => {
    if (!open) { setCoords(null); return; }
    place();
    // Anything that moves the row moves the menu with it.
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  React.useEffect(() => {
    if (!open) return;
    const onClickAway = (e) => {
      const inTrigger = wrapRef.current?.contains(e.target);
      const inMenu = menuRef.current?.contains(e.target);
      if (!inTrigger && !inMenu) setOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => itemRefs.current[activeIndex]?.focus());
    return () => cancelAnimationFrame(id);
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
                    hover:bg-white/85 hover:text-atlas-ink transition-colors duration-state
                    ease-standard ${focusRing}`}
      >
        <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
      </button>

      {open && coords && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          style={{ position: 'fixed', top: coords.top, left: coords.left, width: MENU_WIDTH }}
          // `flex flex-col`, not a stack of block children. The items are
          // <button>s, so they are inline-block by default, and the actions
          // cell they came from carries `whitespace-nowrap` — which inherits.
          // Together those kept every item on one line box, rendering the menu
          // as a horizontal strip.
          className="flex flex-col rounded-panel glass-strong py-1 z-overlay whitespace-normal"
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
                'w-full text-left px-3 h-10 shrink-0 font-ui text-body transition-colors duration-state ease-standard',
                'focus-visible:outline-none',
                item.disabled
                  ? 'text-atlas-disabled cursor-not-allowed'
                  : item.destructive
                    ? 'text-sem-conflict hover:bg-sem-conflict-bg focus-visible:bg-sem-conflict-bg'
                    : 'text-atlas-ink hover:bg-white/85 focus-visible:bg-atlas-50',
              ].join(' ')}
            >
              {item.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
