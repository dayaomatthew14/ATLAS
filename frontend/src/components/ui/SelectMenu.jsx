import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Loader2, Search, X } from 'lucide-react';
import { focusRing, pluralize } from './tokens';

const BADGE_TONES = {
  assigned: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  gened: 'bg-slate-100 text-slate-700 border-slate-200',
  unassigned: 'bg-amber-50 text-amber-800 border-amber-200',
  neutral: 'bg-white text-slate-600 border-slate-200',
};

/**
 * Compute viewport-clamped portal coordinates so the dropdown never clips
 * inside modal scroll areas or runs off the bottom/edges of the screen.
 */
function computeMenuPosition(rect, { minMenuWidth = 0, searchable = false }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const gap = 6;
  const margin = 12;
  const chromeHeight = searchable ? 92 : 42;

  const width = Math.min(vw - margin * 2, Math.max(rect.width, minMenuWidth));
  const left = Math.max(margin, Math.min(rect.left, vw - width - margin));

  const spaceBelow = vh - rect.bottom - margin - gap;
  const spaceAbove = rect.top - margin - gap;
  const openUpward = spaceBelow < 220 && spaceAbove > spaceBelow;
  const available = Math.max(160, openUpward ? spaceAbove : spaceBelow);
  const maxListHeight = Math.max(120, Math.min(280, available - chromeHeight));

  return {
    left,
    width,
    maxListHeight,
    openUpward,
    top: openUpward ? undefined : rect.bottom + gap,
    bottom: openUpward ? vh - rect.top + gap : undefined,
  };
}

/**
 * Unified ATLAS portaled dropdown supporting grouped items and instant search.
 * Matches the ValidationPopup surface palette and safely coordinates Escape/Tab
 * with AtlasDialog's document-capture focus trap.
 */
export default function SelectMenu({
  id,
  describedBy,
  invalid = false,
  value,
  onChange,
  onBlur,
  options = [],
  placeholder = 'Select an option',
  menuTitle = 'Select Option',
  emptyMessage = 'No options available.',
  emptySearchMessage = 'No matching options found.',
  searchable = false,
  searchPlaceholder = 'Search…',
  loading = false,
  disabled = false,
  icon: Icon,
  minMenuWidth = 0,
  itemNoun = 'option',
}) {
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const searchInputRef = useRef(null);
  const optionRefs = useRef([]);
  const listboxId = useId();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const [layout, setLayout] = useState(null);

  const selectedOption = useMemo(
    () => options.find((opt) => String(opt.value) === String(value)) || null,
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!searchable || !q) return options;
    return options.filter((opt) => {
      const haystack = [
        opt.code,
        opt.label,
        opt.secondary,
        opt.group,
        opt.badge,
        opt.searchText,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [options, query, searchable]);

  const sections = useMemo(() => {
    const map = new Map();
    filteredOptions.forEach((opt, flatIndex) => {
      const key = opt.group || '';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ opt, flatIndex });
    });
    return [...map.entries()];
  }, [filteredOptions]);

  const closeMenu = useCallback(
    ({ restoreFocus = false, fireBlur = false } = {}) => {
      setOpen(false);
      setQuery('');
      setHighlightedIdx(-1);
      if (restoreFocus) {
        requestAnimationFrame(() => triggerRef.current?.focus());
      }
      if (fireBlur) {
        onBlur?.();
      }
    },
    [onBlur]
  );

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setLayout(computeMenuPosition(rect, { minMenuWidth, searchable }));
  }, [minMenuWidth, searchable]);

  const openMenu = useCallback(() => {
    if (disabled || loading) return;
    updatePosition();
    setOpen(true);
    const currentIdx = options.findIndex((o) => String(o.value) === String(value));
    setHighlightedIdx(currentIdx >= 0 ? currentIdx : 0);
  }, [disabled, loading, options, updatePosition, value]);

  const selectOption = useCallback(
    (opt) => {
      if (!opt || opt.disabled) return;
      onChange?.(String(opt.value));
      closeMenu({ restoreFocus: true });
    },
    [closeMenu, onChange]
  );

  // Focus search bar on open when searchable, and scroll selected item into view.
  useEffect(() => {
    if (!open) return;
    if (searchable) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [open, searchable]);

  useEffect(() => {
    if (!open || highlightedIdx < 0) return;
    const el = optionRefs.current[highlightedIdx];
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, highlightedIdx]);

  // Reposition on viewport resize/scroll; close on click outside.
  useEffect(() => {
    if (!open) return undefined;
    updatePosition();

    const handleScroll = (e) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) {
        return;
      }
      updatePosition();
    };
    const handleOutside = (e) => {
      const target = e.target;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      closeMenu({ fireBlur: true });
    };

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', handleScroll, true);
    document.addEventListener('mousedown', handleOutside, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', handleScroll, true);
      document.removeEventListener('mousedown', handleOutside, true);
    };
  }, [open, updatePosition, closeMenu]);

  // Run on window capture BEFORE AtlasDialog's document-capture useFocusTrap so
  // Escape closes only the dropdown instead of dismissing the entire dialog.
  useEffect(() => {
    if (!open) return undefined;

    const onKeyCapture = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeMenu({ restoreFocus: true });
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        closeMenu({ restoreFocus: true, fireBlur: true });
        return;
      }
      if (!filteredOptions.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIdx((prev) => (prev + 1) % filteredOptions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIdx((prev) =>
          prev <= 0 ? filteredOptions.length - 1 : prev - 1
        );
      } else if (e.key === 'Home') {
        e.preventDefault();
        setHighlightedIdx(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setHighlightedIdx(filteredOptions.length - 1);
      } else if (e.key === 'Enter') {
        if (highlightedIdx >= 0 && filteredOptions[highlightedIdx]) {
          e.preventDefault();
          e.stopPropagation();
          selectOption(filteredOptions[highlightedIdx]);
        }
      }
    };

    window.addEventListener('keydown', onKeyCapture, true);
    return () => window.removeEventListener('keydown', onKeyCapture, true);
  }, [open, filteredOptions, highlightedIdx, closeMenu, selectOption]);

  const borderClass = invalid
    ? 'border-sem-conflict ring-2 ring-sem-conflict/20'
    : open
      ? 'border-emerald-800 ring-4 ring-emerald-700/15'
      : 'border-slate-300 hover:border-slate-400';

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === ' ' || e.key === 'Enter')) {
            e.preventDefault();
            openMenu();
          }
        }}
        onBlur={(e) => {
          const next = e.relatedTarget;
          if (open && menuRef.current && next instanceof Node && menuRef.current.contains(next)) {
            return;
          }
          if (!open) onBlur?.();
        }}
        className={`w-full h-11 px-3.5 rounded-field font-ui text-body bg-white border shadow-xs flex items-center justify-between gap-2 text-left transition-colors duration-state ease-standard disabled:bg-slate-100 disabled:text-atlas-disabled disabled:cursor-not-allowed ${borderClass} ${focusRing}`}
      >
        <span className="flex items-center gap-2.5 min-w-0 flex-1">
          {loading ? (
            <Loader2 className="w-4 h-4 text-emerald-700 shrink-0 animate-spin" aria-hidden="true" />
          ) : (
            Icon && (
              <Icon
                className={`w-4 h-4 shrink-0 ${selectedOption ? 'text-emerald-800' : 'text-slate-400'}`}
                aria-hidden="true"
              />
            )
          )}
          {loading ? (
            <span className="text-slate-500 truncate">Loading…</span>
          ) : selectedOption ? (
            <span className="flex items-center gap-2 min-w-0 truncate">
              {selectedOption.code && (
                <span className="font-data text-table font-bold text-emerald-950 shrink-0">
                  {selectedOption.code}
                </span>
              )}
              <span className="text-atlas-ink font-medium truncate">
                {selectedOption.label}
              </span>
            </span>
          ) : (
            <span className="text-slate-400 truncate">{placeholder}</span>
          )}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-150 ${
            open ? 'rotate-180 text-emerald-800' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {open && layout &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[230] rounded-xl border border-atlas-700/20 bg-white/95 backdrop-blur-md overflow-hidden atlas-validation-pop"
            style={{
              left: `${layout.left}px`,
              width: `${layout.width}px`,
              top: layout.top !== undefined ? `${layout.top}px` : undefined,
              bottom: layout.bottom !== undefined ? `${layout.bottom}px` : undefined,
              boxShadow:
                '0 20px 44px -10px rgba(15, 42, 29, 0.24), 0 8px 18px -6px rgba(15, 42, 29, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
            }}
          >
            <div className="px-3.5 py-2 border-b border-emerald-900/10 bg-emerald-50/75 flex items-center justify-between gap-2">
              <span className="font-ui text-[11px] font-bold uppercase tracking-[0.06em] text-emerald-900">
                {menuTitle}
              </span>
              <span className="font-ui text-[11px] font-semibold text-emerald-800 bg-white/80 border border-emerald-900/10 px-2 py-0.5 rounded-full tabular-nums">
                {pluralize(filteredOptions.length, itemNoun)}
              </span>
            </div>

            {searchable && (
              <div className="px-3 py-2 border-b border-slate-100 bg-white/90">
                <div className="relative flex items-center">
                  <Search className="w-4 h-4 text-slate-400 absolute left-2.5 pointer-events-none" aria-hidden="true" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setHighlightedIdx(0);
                    }}
                    placeholder={searchPlaceholder}
                    className="w-full h-9 pl-8 pr-8 rounded-lg border border-slate-200 bg-slate-50/70 font-ui text-caption text-atlas-ink placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery('');
                        setHighlightedIdx(0);
                        searchInputRef.current?.focus();
                      }}
                      aria-label="Clear search"
                      className="absolute right-2 p-0.5 rounded text-slate-400 hover:text-slate-700"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            )}

            <div
              id={listboxId}
              role="listbox"
              aria-label={menuTitle}
              className="overflow-y-auto atlas-scroll divide-y divide-slate-100/70"
              style={{ maxHeight: `${layout.maxListHeight}px` }}
            >
              {filteredOptions.length === 0 ? (
                <div className="px-4 py-6 text-center font-ui text-caption text-atlas-slate">
                  {options.length === 0 ? emptyMessage : emptySearchMessage}
                </div>
              ) : (
                sections.map(([groupName, entries]) => (
                  <div key={groupName || '__default__'}>
                    {groupName && (
                      <div className="sticky top-0 z-10 px-3.5 py-1.5 bg-slate-50/95 backdrop-blur-sm border-b border-slate-100 font-ui text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        {groupName}
                      </div>
                    )}
                    <div className="py-1">
                      {entries.map(({ opt, flatIndex }) => {
                        const isSelected = String(opt.value) === String(value);
                        const isHighlighted = flatIndex === highlightedIdx;
                        const badgeClass = BADGE_TONES[opt.badgeTone] || BADGE_TONES.neutral;

                        return (
                          <button
                            key={opt.value}
                            ref={(el) => {
                              optionRefs.current[flatIndex] = el;
                            }}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            disabled={opt.disabled}
                            onMouseEnter={() => setHighlightedIdx(flatIndex)}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => selectOption(opt)}
                            className={`w-full px-3.5 py-2.5 text-left flex items-start justify-between gap-3 transition-colors duration-100 ${
                              isSelected
                                ? 'bg-emerald-50/90 text-emerald-950'
                                : isHighlighted
                                  ? 'bg-slate-100/80 text-atlas-ink'
                                  : 'text-atlas-ink hover:bg-slate-50'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="flex items-baseline gap-2 min-w-0">
                                {opt.code && (
                                  <span className="font-data text-caption font-bold text-emerald-900 shrink-0">
                                    {opt.code}
                                  </span>
                                )}
                                <span
                                  className={`font-ui text-caption sm:text-table leading-snug ${
                                    isSelected ? 'font-bold text-emerald-950' : 'font-semibold text-atlas-ink'
                                  }`}
                                >
                                  {opt.label}
                                </span>
                              </span>
                              {(opt.secondary || opt.badge) && (
                                <span className="mt-1 flex flex-wrap items-center gap-1.5">
                                  {opt.secondary && (
                                    <span className="font-ui text-[12px] text-atlas-slate">
                                      {opt.secondary}
                                    </span>
                                  )}
                                  {opt.badge && (
                                    <span
                                      className={`inline-flex items-center px-2 py-0.5 rounded-full border font-ui text-[11px] font-semibold ${badgeClass}`}
                                    >
                                      {opt.badge}
                                    </span>
                                  )}
                                </span>
                              )}
                            </span>
                            {isSelected && (
                              <Check className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
