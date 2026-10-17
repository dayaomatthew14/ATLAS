import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { focusRing } from './tokens';
import useCountUp from './useCountUp';

/**
 * Page-level primitives.
 *
 * Every screen was building its own header, its own card and its own metric
 * tile, so "the design system" existed in tokens.js and nowhere else: one page
 * headed itself with `text-4xl font-black tracking-tight`, the next with
 * `text-3xl font-black tracking-tighter`, a third with `font-display text-page`.
 * These three components are the shapes those screens were all approximating,
 * written once.
 *
 * Nothing here is new. `PageHeader` is the header Curriculum and Rooms already
 * had; `Panel` and `StatTile` are the ones Overview already had. Pulling them
 * out is what makes them enforceable.
 */

/**
 * The top of a screen: what it is, what it holds, what you can do to it.
 *
 * `title` is the only required part. `meta` is the one line of context under
 * it — counts, scope, the term — and `actions` is the button cluster, which
 * wraps beneath the title on narrow viewports rather than crushing it.
 */
export function PageHeader({ title, eyebrow, meta, note, actions, className = '' }) {
  return (
    <header className={`flex flex-wrap items-end justify-between gap-x-6 gap-y-4 mb-8 ${className}`}>
      <div className="min-w-0 basis-[min(100%,20rem)] grow">
        {eyebrow && (
          <div className="mb-2.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-bold tracking-wider uppercase text-emerald-900 bg-emerald-900/10 border border-emerald-800/20 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-700" />
              {eyebrow}
            </span>
          </div>
        )}
        <h1 className="text-3xl sm:text-4xl text-emerald-950 font-extrabold tracking-tight leading-tight">{title}</h1>
        {meta && <p className="font-ui text-base text-slate-700 font-medium mt-2 max-w-3xl leading-relaxed">{meta}</p>}
        {note && <p className="font-ui text-caption text-slate-600 mt-1.5">{note}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3 shrink-0">{actions}</div>}
    </header>
  );
}

/**
 * A titled region of a page.
 *
 * `interactive` opts into the hover lift — pass it only when the whole panel
 * is a link or a button, because a surface that rises under the pointer is a
 * promise that clicking it does something.
 */
export function Panel({
  title,
  description,
  action,
  icon: Icon,
  accent,
  interactive = false,
  className = '',
  bodyClassName = '',
  style,
  children,
}) {
  const accentClass =
    accent === 'warning' ? 'accent-edge-warning'
    : accent === 'conflict' ? 'accent-edge-conflict'
    : accent ? 'accent-edge'
    : '';

  return (
    <section
      style={style}
      className={`glass sheen rounded-panel overflow-hidden border border-emerald-900/10 ${accentClass}
                  ${interactive ? 'lift' : 'surface'} ${className}`}
    >
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 px-6 py-5 border-b border-emerald-900/10">
          <div className="flex items-start gap-3.5 min-w-0">
            {Icon && (
              <span
                aria-hidden="true"
                className="w-10 h-10 rounded-xl bg-emerald-800/10 text-emerald-800 border border-emerald-800/15 flex items-center justify-center shrink-0 shadow-xs"
              >
                <Icon className="w-5 h-5 stroke-[2.2]" />
              </span>
            )}
            <div className="min-w-0">
              {title && <h2 className="text-lg sm:text-xl font-bold text-emerald-950 leading-snug tracking-tight">{title}</h2>}
              {description && (
                <p className="font-ui text-caption sm:text-body text-slate-700 mt-1 leading-relaxed font-medium">{description}</p>
              )}
            </div>
          </div>
          {action}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/**
 * One number and what it counts.
 *
 * Tabular display numbers on linen porcelain surfaces with medallion chips.
 */
export function StatTile({ label, value, hint, tone = 'default', icon: Icon, to }) {
  const tones = {
    default: { value: 'text-emerald-950', chip: 'bg-emerald-800/10 text-emerald-800 border border-emerald-800/15', edge: 'accent-edge' },
    good: { value: 'text-emerald-800', chip: 'bg-emerald-800/15 text-emerald-800 border border-emerald-800/20', edge: 'accent-edge' },
    warning: { value: 'text-amber-800', chip: 'bg-amber-500/15 text-amber-800 border border-amber-500/25', edge: 'accent-edge-warning' },
    conflict: { value: 'text-rose-800', chip: 'bg-rose-500/15 text-rose-800 border border-rose-500/25', edge: 'accent-edge-conflict' },
  };
  const t = tones[tone] || tones.default;

  const shown = useCountUp(value);

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="font-ui text-caption font-bold text-slate-700 tracking-wider uppercase">{label}</span>
        {Icon && (
          <span
            aria-hidden="true"
            className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-xs transition-transform group-hover:scale-105 duration-overlay ${t.chip}`}
          >
            <Icon className="w-5 h-5 stroke-[2.2]" />
          </span>
        )}
      </div>
      <span className={`block text-3xl sm:text-4xl font-extrabold mt-4 tabular-nums tracking-tight leading-none ${t.value}`}>
        {shown}
      </span>
      {hint && <span className="block font-ui text-caption text-slate-700 mt-2 leading-relaxed font-medium">{hint}</span>}
      {to && (
        <span className="mt-3.5 inline-flex items-center gap-1 font-ui text-caption font-bold text-emerald-800 group-hover:text-emerald-950 transition-colors">
          View details
          <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      )}
    </>
  );

  const base = `glass sheen rounded-panel px-6 py-6 block border border-emerald-900/10 ${t.edge}`;
  return to ? (
    <Link to={to} className={`group ${base} lift hover:border-emerald-700/30 transition-all ${focusRing}`}>
      {body}
    </Link>
  ) : (
    <div className={`${base} surface`}>{body}</div>
  );
}

/**
 * A row that leads somewhere. Used for "needs attention" style lists, where
 * every item is both a statement and a way to go fix it.
 */
export function LinkRow({ to, icon: Icon, iconClass = 'text-atlas-slate', label, detail }) {
  const body = (
    <>
      {Icon && <Icon className={`w-[18px] h-[18px] shrink-0 mt-0.5 ${iconClass}`} aria-hidden="true" />}
      <span className="min-w-0 flex-1">
        <span className="block font-ui text-body font-medium text-atlas-ink">{label}</span>
        {/* Wraps. It used to truncate, which meant the sentence explaining what
            was wrong ended in an ellipsis at exactly the width where it
            mattered — the detail is the reason the row exists. */}
        {detail && (
          <span className="block font-ui text-caption text-atlas-slate mt-1 leading-relaxed">{detail}</span>
        )}
      </span>
    </>
  );

  /* Some rows report something the reader cannot act on — a state only another
     role can change. Those get no `to`, and must not render as a link: a
     <Link> with no destination is a control that goes nowhere, and the chevron
     would promise a screen this user cannot open. */
  if (!to) {
    return (
      <li className="flex items-start gap-3.5 px-6 py-4">
        {body}
      </li>
    );
  }

  return (
    <li>
      <Link
        to={to}
        className={`group flex items-start gap-3.5 px-6 py-4 transition-colors duration-state ease-standard
                    hover:bg-atlas-50 focus-visible:ring-inset ${focusRing}`}
      >
        {body}
        {/* Travels right on hover — the direction the click takes you. */}
        <ChevronRight
          className="w-4 h-4 text-atlas-slate shrink-0 mt-0.5 transition-transform duration-overlay
                     ease-emphasis group-hover:translate-x-1 group-hover:text-atlas-700"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}

/**
 * The empty state. One shape for "there is nothing here", instead of each
 * screen inventing its own dashed box.
 */
export function EmptyState({ icon: Icon, title, body, action, tone = 'default' }) {
  const border =
    tone === 'warning' ? '!border-sem-warning/40'
    : tone === 'conflict' ? '!border-sem-conflict/40'
    : '';
  return (
    <div className={`glass rounded-panel p-12 text-center ${border}`}>
      {Icon && (
        <div className="w-14 h-14 rounded-full bg-atlas-canvas flex items-center justify-center mx-auto mb-4">
          <Icon className="w-7 h-7 text-atlas-slate" aria-hidden="true" />
        </div>
      )}
      <h2 className="font-display text-section text-atlas-ink">{title}</h2>
      {body && (
        <p className="mt-2 font-ui text-body text-atlas-slate max-w-lg mx-auto">{body}</p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/** The page shell: consistent padding and max width on every screen. */
export function Page({ children, className = '', style = {} }) {
  return (
    <div
      className={`p-6 lg:p-8 font-sans ${className}`}
      style={{ fontFamily: '"Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif', ...style }}
    >
      {children}
    </div>
  );
}
