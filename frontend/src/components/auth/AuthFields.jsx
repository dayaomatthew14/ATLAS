import { useState, useEffect, useRef } from 'react';
import { Key, Eye, EyeOff, ChevronDown, Check } from 'lucide-react';
import { ValidationErrorBadge, ValidationPopup } from '../ui/ValidationPopup';
import { useValidationPopup } from '../ui/useValidationPopup';

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
export function AuthStaticField({ id, icon: Icon, label, value }) {
  const labelId = `${id}-label`;
  return (
    <div className="text-left select-none">
      <div className="flex items-center justify-between gap-2 mb-1.5 min-h-5">
        <span id={labelId} className="block text-caption font-semibold text-atlas-slate truncate">
          {label}
        </span>
      </div>
      <div
        id={id}
        aria-labelledby={labelId}
        className="relative flex items-center w-full pl-10 pr-3.5 py-2.5 bg-atlas-50/60 border border-atlas-control/80 rounded-field text-body font-medium text-atlas-ink cursor-default select-none pointer-events-none"
      >
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center">
          <Icon aria-hidden="true" className="h-4 w-4 text-atlas-700" />
        </div>
        <span className="truncate">{value}</span>
      </div>
    </div>
  );
}

/**
 * Accessible custom listbox selector used on the authentication/registration card.
 */
export function CustomSelectInput({ icon: Icon, value, setter, label, options, hasError }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const labelId = `auth-select-${label.replace(/\W+/g, '-').toLowerCase()}`;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
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
          type="button"
          onClick={() => {
            dismissErrorPopup();
            setIsOpen(!isOpen);
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
              : 'border-atlas-control hover:border-atlas-700/60'
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

        {isOpen && (
          <div
            role="listbox"
            aria-labelledby={labelId}
            className="auth-pop absolute top-full left-0 right-0 mt-1.5 bg-white border border-atlas-line shadow-overlay rounded-panel z-overlay overflow-hidden py-1 max-h-64 overflow-y-auto"
          >
            {options.map((opt) => {
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
                  className={`w-full px-3.5 py-2.5 text-left text-body transition-colors duration-state ease-standard flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-atlas-100 text-atlas-800 font-semibold'
                      : 'text-atlas-ink hover:bg-atlas-50'
                  }`}
                  title={opt.label}
                >
                  <span className="whitespace-normal leading-snug break-words flex-1">{opt.label}</span>
                  {isSelected && <Check aria-hidden="true" className="w-4 h-4 text-atlas-700 shrink-0" />}
                </button>
              );
            })}
          </div>
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
