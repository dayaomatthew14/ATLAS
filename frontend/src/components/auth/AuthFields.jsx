import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Key, Eye, EyeOff, ChevronDown, Check } from 'lucide-react';
import { ValidationErrorBadge, ValidationPopup } from '../ui/ValidationPopup';
import { useValidationPopup } from '../ui/useValidationPopup';
import { DEPARTMENTS } from '../ui/tokens';

/**
 * Icon-prefixed text input with accessible label, validation badge, and anchored popup.
 */
export function AuthTextField({
  id,
  name,
  icon: Icon,
  type = 'text',
  placeholder,
  value,
  onChange,
  onBlur,
  label,
  hasError,
  extraProps = {},
}) {
  const anchorRef = useRef(null);
  const { popupRef, isOpen, open, dismiss, toggle, anchorHandlers } = useValidationPopup({
    anchorRef,
    error: hasError,
  });

  return (
    <div ref={anchorRef} className="text-left" {...anchorHandlers}>
      <div className="flex items-center justify-between gap-2 mb-1.5 min-h-5">
        <label htmlFor={id} className="block text-caption font-semibold text-atlas-slate">
          {label}
        </label>
        <ValidationErrorBadge
          error={hasError}
          label={label}
          onOpen={() => open({ focusControl: false })}
          onToggle={toggle}
        />
      </div>
      <div className="relative group">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
          <Icon
            aria-hidden="true"
            className={`h-4 w-4 transition-colors duration-state ease-standard ${
              hasError ? 'text-sem-conflict' : 'text-atlas-disabled group-focus-within:text-atlas-700'
            }`}
          />
        </div>
        <input
          id={id}
          name={name}
          type={type}
          aria-required="true"
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          aria-invalid={hasError ? 'true' : undefined}
          aria-describedby={hasError ? `${id}-error` : undefined}
          {...extraProps}
          className={`block w-full pl-10 pr-3.5 py-2.5 bg-white/70 border rounded-field outline-none text-body text-atlas-ink
            placeholder:text-atlas-disabled placeholder:font-normal
            transition-[border-color,box-shadow,background-color] duration-state ease-standard
            ${hasError
              ? 'border-sem-conflict focus:border-sem-conflict focus:ring-4 focus:ring-sem-conflict/15 focus:bg-white'
              : 'border-atlas-control hover:border-atlas-700/60 focus:border-atlas-700 focus:ring-4 focus:ring-atlas-700/15 focus:bg-white'}
          `}
          placeholder={placeholder}
        />
      </div>
      {hasError && (
        <span id={`${id}-error`} className="sr-only">
          {hasError}
        </span>
      )}
      <ValidationPopup
        anchorRef={anchorRef}
        popupRef={popupRef}
        isOpen={isOpen}
        error={hasError}
        label={label}
        onDismiss={dismiss}
      />
    </div>
  );
}

/**
 * Password field with visibility toggle and anchored validation popup.
 */
export function AuthPasswordField({
  id,
  name,
  value,
  onChange,
  onBlur,
  onKeyUp,
  label,
  placeholder = '••••••••',
  showPassword,
  onToggleShowPassword,
  hasError,
}) {
  const anchorRef = useRef(null);
  const { popupRef, isOpen, open, dismiss, toggle, anchorHandlers } = useValidationPopup({
    anchorRef,
    error: hasError,
  });

  return (
    <div ref={anchorRef} className="text-left" {...anchorHandlers}>
      <div className="flex items-center justify-between gap-2 mb-1.5 min-h-5">
        <label htmlFor={id} className="block text-caption font-semibold text-atlas-slate">
          {label}
        </label>
        <ValidationErrorBadge
          error={hasError}
          label={label}
          onOpen={() => open({ focusControl: false })}
          onToggle={toggle}
        />
      </div>
      <div className="relative group">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
          <Key
            aria-hidden="true"
            className={`h-4 w-4 transition-colors duration-state ease-standard ${
              hasError ? 'text-sem-conflict' : 'text-atlas-disabled group-focus-within:text-atlas-700'
            }`}
          />
        </div>
        <input
          id={id}
          name={name}
          type={showPassword ? 'text' : 'password'}
          aria-required="true"
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          onKeyUp={onKeyUp}
          aria-invalid={hasError ? 'true' : undefined}
          aria-describedby={hasError ? `${id}-error` : undefined}
          className={`block w-full pl-10 pr-10 py-2.5 bg-white/70 border rounded-field outline-none text-body text-atlas-ink
            placeholder:text-atlas-disabled placeholder:font-normal
            transition-[border-color,box-shadow,background-color] duration-state ease-standard
            ${hasError
              ? 'border-sem-conflict focus:border-sem-conflict focus:ring-4 focus:ring-sem-conflict/15 focus:bg-white'
              : 'border-atlas-control hover:border-atlas-700/60 focus:border-atlas-700 focus:ring-4 focus:ring-atlas-700/15 focus:bg-white'}
          `}
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={onToggleShowPassword}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-atlas-disabled hover:text-atlas-700 transition-colors duration-state ease-standard focus:outline-none focus-visible:text-atlas-700"
        >
          {showPassword ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
        </button>
      </div>
      {hasError && (
        <span id={`${id}-error`} className="sr-only">
          {hasError}
        </span>
      )}
      <ValidationPopup
        anchorRef={anchorRef}
        popupRef={popupRef}
        isOpen={isOpen}
        error={hasError}
        label={label}
        onDismiss={dismiss}
      />
    </div>
  );
}

/**
 * Fixed non-interactive display field matching AuthTextField/CustomSelectInput dimensions.
 */
export function AuthStaticField({ id, icon: Icon, label, value, badge }) {
  const labelId = `${id}-label`;
  return (
    <div className="text-left select-none cursor-default">
      <div className="flex items-center justify-between gap-2 mb-1.5 min-h-5">
        <span id={labelId} className="block text-caption font-semibold text-atlas-slate truncate">
          {label}
        </span>
      </div>
      <div
        id={id}
        aria-labelledby={labelId}
        className="relative flex items-center justify-between gap-2 w-full pl-10 pr-3.5 py-2.5 bg-atlas-50/60 border border-atlas-control/80 rounded-field text-body font-medium text-atlas-ink cursor-default select-none pointer-events-none"
      >
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center">
          <Icon aria-hidden="true" className="h-4 w-4 text-atlas-700" />
        </div>
        <span className="truncate">{value}</span>
        {badge && (
          <span className="shrink-0 px-2 py-0.5 rounded-marker bg-atlas-100 text-atlas-800 text-[11px] font-bold uppercase tracking-wider">
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Accessible custom listbox selector used on the authentication/registration card.
 * Portals its menu into document.body with unified preview-panel styling so options
 * stay cleanly aligned and never clip behind card boundaries.
 */
export function CustomSelectInput({ icon: Icon, value, setter, label, options, hasError }) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const dropdownRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const labelId = `auth-select-${label.replace(/\W+/g, '-').toLowerCase()}`;

  const placeMenu = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 12;
    const gap = 6;
    const width = Math.min(Math.max(rect.width, 320), vw - margin * 2);
    const left = Math.max(margin, Math.min(rect.left, vw - width - margin));

    const menuHeight = menuRef.current?.offsetHeight || 320;
    const spaceBelow = vh - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const flip = spaceBelow < Math.min(menuHeight, 260) && spaceAbove > spaceBelow;

    const maxBodyHeight = Math.max(160, Math.min(320, (flip ? spaceAbove : spaceBelow) - 48));
    const top = flip
      ? Math.max(margin, rect.top - Math.min(menuHeight, maxBodyHeight + 48) - gap)
      : Math.min(vh - margin - 120, rect.bottom + gap);

    setCoords({ top, left, width, maxBodyHeight, flip });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      setCoords(null);
      return undefined;
    }
    placeMenu();
    const onViewportChange = (event) => {
      if (event?.type === 'scroll' && menuRef.current?.contains(event.target)) {
        return;
      }
      placeMenu();
    };
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [isOpen, placeMenu]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleClickOutside = (event) => {
      const inTrigger = dropdownRef.current?.contains(event.target);
      const inMenu = menuRef.current?.contains(event.target);
      if (!inTrigger && !inMenu) {
        setIsOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const {
    popupRef,
    isOpen: isErrorOpen,
    open: openErrorPopup,
    dismiss: dismissErrorPopup,
    toggle: toggleErrorPopup,
    anchorHandlers,
  } = useValidationPopup({
    anchorRef: dropdownRef,
    error: isOpen ? '' : hasError,
  });

  const groupedOptions = useMemo(() => {
    const hasGroups = options.some((opt) => Boolean(opt.college));
    if (!hasGroups) {
      return [{ college: null, items: options }];
    }
    const groups = [];
    const indexByCollege = new Map();
    for (const opt of options) {
      const key = opt.college || 'OTHER';
      if (!indexByCollege.has(key)) {
        indexByCollege.set(key, groups.length);
        groups.push({ college: key, meta: DEPARTMENTS[key], items: [] });
      }
      groups[indexByCollege.get(key)].items.push(opt);
    }
    return groups;
  }, [options]);

  const selectedOption = options.find((opt) => opt.value === value);
  const errorId = `${labelId}-error`;

  return (
    <div className="text-left relative" ref={dropdownRef} {...anchorHandlers}>
      <div className="flex items-center justify-between gap-2 mb-1.5 min-h-5">
        <label id={labelId} className="block text-caption font-semibold text-atlas-slate truncate">{label}</label>
        <ValidationErrorBadge
          error={hasError}
          label={label}
          onOpen={() => openErrorPopup({ focusControl: false })}
          onToggle={toggleErrorPopup}
        />
      </div>
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => {
            dismissErrorPopup();
            setIsOpen((prev) => !prev);
          }}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-labelledby={labelId}
          aria-describedby={hasError ? errorId : undefined}
          className={`w-full pl-10 pr-9 py-2.5 bg-white/70 border rounded-field outline-none text-left flex items-center justify-between
            transition-[border-color,box-shadow,background-color] duration-state ease-standard ${
            hasError
              ? 'border-sem-conflict ring-4 ring-sem-conflict/15'
              : isOpen
              ? 'border-atlas-700 ring-4 ring-atlas-700/15 bg-white'
              : 'border-atlas-control hover:border-atlas-700/60 focus-visible:border-atlas-700 focus-visible:ring-4 focus-visible:ring-atlas-700/15'
          }`}
        >
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Icon
              aria-hidden="true"
              className={`h-4 w-4 transition-colors duration-state ease-standard ${
                hasError ? 'text-sem-conflict' : isOpen ? 'text-atlas-700' : 'text-atlas-disabled'
              }`}
            />
          </div>
          <span className={`truncate text-body ${selectedOption ? 'text-atlas-ink font-medium' : 'text-atlas-disabled'}`}>
            {selectedOption ? selectedOption.label : `Select ${label}...`}
          </span>
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <ChevronDown
              aria-hidden="true"
              className={`h-4 w-4 transition-transform duration-overlay ease-emphasis ${
                isOpen ? 'rotate-180 text-atlas-700' : 'text-atlas-disabled'
              }`}
            />
          </div>
        </button>

        {isOpen && typeof document !== 'undefined' && createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-labelledby={labelId}
            style={
              coords
                ? { top: `${coords.top}px`, left: `${coords.left}px`, width: `${coords.width}px` }
                : { top: '-9999px', left: '-9999px', visibility: 'hidden' }
            }
            className={`fixed z-[9999] rounded-xl bg-white/95 backdrop-blur-md border border-atlas-700/20 overflow-hidden
                        shadow-[0_14px_34px_-8px_rgba(5,48,31,0.18),0_4px_14px_-2px_rgba(5,48,31,0.10)]
                        ${coords ? 'auth-pop' : ''}`}
          >
            <div className="flex items-center justify-between gap-2 px-3.5 py-2 bg-atlas-50/90 border-b border-atlas-line">
              <span className="inline-flex items-center gap-1.5 font-ui text-[11px] font-bold uppercase tracking-wider text-atlas-800">
                <Icon aria-hidden="true" className="w-3.5 h-3.5 text-atlas-700 shrink-0" />
                <span>Select {label}</span>
              </span>
            </div>
            <div
              style={coords ? { maxHeight: `${coords.maxBodyHeight}px` } : { maxHeight: '300px' }}
              className="overflow-y-auto overscroll-contain atlas-scroll py-1.5 px-1.5 space-y-1"
            >
              {groupedOptions.map((group) => (
                <div key={group.college || 'flat'} className="space-y-0.5">
                  {group.college && (
                    <div className="flex items-center gap-2 px-2.5 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-atlas-slate">
                      <span
                        aria-hidden="true"
                        className="inline-block w-[3px] h-3.5 rounded-sm shrink-0"
                        style={{ backgroundColor: group.meta?.hue || 'var(--dept-unregistered)' }}
                      />
                      <span className="text-atlas-900 font-bold shrink-0">{group.college}</span>
                      {group.meta?.name && (
                        <span className="font-semibold normal-case tracking-normal text-atlas-disabled truncate">
                          · {group.meta.name}
                        </span>
                      )}
                    </div>
                  )}
                  {group.items.map((opt) => {
                    const isSelected = opt.value === value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          setter(opt.value);
                          setIsOpen(false);
                        }}
                        className={`w-full px-3 py-2 rounded-lg text-left text-caption sm:text-table transition-colors duration-state ease-standard flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'bg-atlas-100 text-atlas-800 font-semibold'
                            : 'text-atlas-ink hover:bg-atlas-50 font-medium'
                        }`}
                        title={opt.label}
                      >
                        <span className="leading-snug flex-1">{opt.program || opt.label}</span>
                        {isSelected && <Check aria-hidden="true" className="w-4 h-4 text-atlas-700 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>,
          document.body
        )}
      </div>
      {hasError && <span id={errorId} className="sr-only">{hasError}</span>}
      <ValidationPopup
        anchorRef={dropdownRef}
        popupRef={popupRef}
        isOpen={isErrorOpen && !isOpen}
        error={hasError}
        label={label}
        onDismiss={dismissErrorPopup}
      />
    </div>
  );
}
