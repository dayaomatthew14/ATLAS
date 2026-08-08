import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { focusRing } from './tokens';

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
export function PageHeader({ title, meta, note, actions, className = '' }) {
  return (
    <header className={`flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8 ${className}`}>
      <div className="min-w-0">
        <h1 className="font-display text-page text-atlas-ink">{title}</h1>
        {meta && <p className="font-ui text-body text-atlas-slate mt-1.5">{meta}</p>}
        {note && <p className="font-ui text-caption text-atlas-slate mt-1">{note}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
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
      className={`glass sheen rounded-panel overflow-hidden ${accentClass}
                  ${interactive ? 'lift' : 'surface'} ${className}`}
    >
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-white/45">
          <div className="flex items-start gap-3 min-w-0">
            {Icon && (
              <span
                aria-hidden="true"
                className="w-8 h-8 rounded-field bg-atlas-100 text-atlas-700 flex items-center justify-center shrink-0"
              >
                <Icon className="w-4 h-4" />
              </span>
            )}
            <div className="min-w-0">
              {title && <h2 className="font-ui text-body font-semibold text-atlas-ink">{title}</h2>}
              {description && (
                <p className="font-ui text-caption text-atlas-slate mt-0.5">{description}</p>
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
 * The value uses the display face at page size with tabular figures, so a
 * row of tiles has its digits on a common baseline and grid. No trend arrows:
 * there is no history to compare against, and an arrow that always points the
 * same way is decoration claiming to be data.
 */
export function StatTile({ label, value, hint, tone = 'default', icon: Icon, to }) {
  const tones = {
    default: { value: 'text-atlas-ink', chip: 'bg-atlas-100 text-atlas-700', edge: 'accent-edge' },
    good: { value: 'text-atlas-700', chip: 'bg-atlas-100 text-atlas-700', edge: 'accent-edge' },
    warning: { value: 'text-sem-warning', chip: 'bg-sem-warning-bg text-sem-warning', edge: 'accent-edge-warning' },
    conflict: { value: 'text-sem-conflict', chip: 'bg-sem-conflict-bg text-sem-conflict', edge: 'accent-edge-conflict' },
  };
  const t = tones[tone] || tones.default;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="font-ui text-micro uppercase text-atlas-slate">{label}</span>
        {/* The icon sits in a tinted chip that carries the tile's tone, so a
            conflict tile reads as one at a glance rather than only in its
            number — and never by colour alone, since the number is toned too. */}
        {Icon && (
          <span
            aria-hidden="true"
            className={`w-9 h-9 rounded-field flex items-center justify-center shrink-0 travel-y ${t.chip}`}
          >
            <Icon className="w-[18px] h-[18px]" />
          </span>
        )}
      </div>
      <span className={`block font-display text-display mt-3 tabular-nums leading-none ${t.value}`}>
        {value}
      </span>
      {hint && <span className="block font-ui text-caption text-atlas-slate mt-2">{hint}</span>}
    </>
  );

  const base = `glass sheen rounded-panel px-5 py-5 block ${t.edge}`;
  return to ? (
    <Link to={to} className={`${base} lift ${focusRing}`}>
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
  return (
    <li>
      <Link
        to={to}
        className={`group flex items-center gap-3 px-5 py-3.5 transition-colors duration-state ease-standard
                    hover:bg-atlas-50 focus-visible:ring-inset ${focusRing}`}
      >
        {Icon && <Icon className={`w-4 h-4 shrink-0 ${iconClass}`} aria-hidden="true" />}
        <span className="min-w-0 flex-1">
          <span className="block font-ui text-body text-atlas-ink">{label}</span>
          {detail && (
            <span className="block font-ui text-caption text-atlas-slate truncate">{detail}</span>
          )}
        </span>
        {/* Travels right on hover — the direction the click takes you. */}
        <ChevronRight
          className="w-4 h-4 text-atlas-slate shrink-0 transition-transform duration-overlay
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
export function Page({ children, className = '' }) {
  return <div className={`p-6 lg:p-8 ${className}`}>{children}</div>;
}
