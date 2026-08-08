import React from 'react';
import { AlertTriangle, Lock } from 'lucide-react';
import { focusRing } from './tokens';

/**
 * ATLAS form field. Phase 1 §1.2.
 *
 * Exists primarily to make audit finding A11Y-01 unrepeatable: the label is
 * bound to the control with htmlFor/id generated here, so a caller cannot
 * forget it. 71 of the 73 existing labels in the app are unassociated.
 *
 * Border uses --atlas-line-input (3.68:1), not --atlas-line (1.27:1).
 * WCAG 1.4.11 requires 3:1 for a boundary that identifies a UI component, and
 * a text field's edge is exactly that.
 */

const controlBase =
  'w-full h-10 px-3 rounded-field font-ui text-body text-atlas-ink bg-white/70 backdrop-blur-sm ' +
  'border border-atlas-control transition-colors duration-state ease-standard ' +
  'placeholder:text-atlas-disabled hover:border-atlas-slate ' +
  'focus:bg-white/95 disabled:bg-atlas-canvas/70 disabled:border-atlas-line disabled:text-atlas-disabled ' +
  'disabled:cursor-not-allowed';

const errorRing = 'border-sem-conflict bg-sem-conflict-bg';

export function Field({
  label,
  hint,
  error,
  required = false,
  readOnlyReason,
  className = '',
  children,
  id: providedId,
}) {
  const autoId = React.useId();
  const id = providedId || autoId;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const describedBy = [hint ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(' ') || undefined;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label
        htmlFor={id}
        className="font-ui text-micro uppercase text-atlas-slate flex items-center gap-2"
      >
        {label}
        {/* The word, not an asterisk — an asterisk is not announced usefully. */}
        {required && <span className="text-atlas-disabled normal-case">Required</span>}
        {readOnlyReason && <Lock className="w-3 h-3" aria-hidden="true" />}
      </label>

      {children({ id, describedBy, invalid: Boolean(error) })}

      {hint && !error && (
        <p id={hintId} className="font-ui text-caption text-atlas-slate">
          {hint}
        </p>
      )}

      {error && (
        <p id={errorId} className="font-ui text-caption text-sem-conflict flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

export function TextInput({ label, hint, error, required, className, id, ...rest }) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className} id={id}>
      {({ id: fieldId, describedBy, invalid }) => (
        <input
          id={fieldId}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          required={required}
          className={`${controlBase} ${focusRing} ${invalid ? errorRing : ''}`}
          {...rest}
        />
      )}
    </Field>
  );
}

export function NumberInput({ label, hint, error, required, suffix, className, id, ...rest }) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className} id={id}>
      {({ id: fieldId, describedBy, invalid }) => (
        <div className="relative">
          <input
            id={fieldId}
            type="number"
            inputMode="numeric"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            required={required}
            // Mono + tabular so numeric columns align when echoed into tables.
            className={`${controlBase} ${focusRing} font-data tabular-nums ${
              suffix ? 'pr-16' : ''
            } ${invalid ? errorRing : ''}`}
            {...rest}
          />
          {suffix && (
            <span
              className="absolute inset-y-0 right-3 flex items-center font-ui text-caption text-atlas-slate pointer-events-none"
              aria-hidden="true"
            >
              {suffix}
            </span>
          )}
        </div>
      )}
    </Field>
  );
}

export function SelectInput({ label, hint, error, required, options = [], className, id, ...rest }) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className} id={id}>
      {({ id: fieldId, describedBy, invalid }) => (
        <select
          id={fieldId}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          required={required}
          className={`${controlBase} ${focusRing} pr-8 cursor-pointer ${invalid ? errorRing : ''}`}
          {...rest}
        >
          {options.map((o) =>
            o.group ? (
              <optgroup key={o.group} label={o.group}>
                {o.options.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </optgroup>
            ) : (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            )
          )}
        </select>
      )}
    </Field>
  );
}

/**
 * Radio group. Used where a select would hide consequential options — the
 * missing "Lecture" room type (audit finding HEU-02) was invisible precisely
 * because it was a <select>. A missing radio is obvious; a missing option is not.
 */
export function RadioGroup({ label, hint, error, required, name, value, onChange, options = [], className = '' }) {
  const groupId = React.useId();
  const hintId = `${groupId}-hint`;
  const errorId = `${groupId}-error`;

  return (
    <fieldset
      className={`flex flex-col gap-1.5 ${className}`}
      aria-describedby={[hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined}
      aria-invalid={Boolean(error) || undefined}
    >
      <legend className="font-ui text-micro uppercase text-atlas-slate flex items-center gap-2 mb-1.5">
        {label}
        {required && <span className="text-atlas-disabled normal-case">Required</span>}
      </legend>

      <div className="flex flex-col gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex items-start gap-2.5 cursor-pointer font-ui text-body text-atlas-ink"
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className={`mt-0.5 w-4 h-4 shrink-0 accent-[var(--atlas-green-700)] ${focusRing}`}
            />
            <span>
              {o.label}
              {o.hint && (
                <span className="block text-caption text-atlas-slate">{o.hint}</span>
              )}
            </span>
          </label>
        ))}
      </div>

      {hint && !error && (
        <p id={hintId} className="font-ui text-caption text-atlas-slate">{hint}</p>
      )}
      {error && (
        <p id={errorId} className="font-ui text-caption text-sem-conflict flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </fieldset>
  );
}
