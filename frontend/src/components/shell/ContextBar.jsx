import { resolveDepartment, ROLE_LABELS } from '../ui/tokens';

/**
 * ATLAS context bar. 36px, green-900, present on every screen. Phase 2 Screen 1.
 *
 * Non-negotiable per the design direction, and the audit supports it: scheduling
 * errors come from acting in the wrong term or the wrong department (IA-01).
 * Before this, the active term appeared only as a card on Overview and the
 * department only as truncated 11px text under the user's name.
 *
 * It survives every breakpoint — it is the one element never sacrificed to width.
 */
export default function ContextBar({ department, role, termLabel, isPublished = false }) {
  const dept = resolveDepartment(department);
  const roleLabel = ROLE_LABELS[role] || 'Signed in';

  // An administrator is not scoped to a college — they govern all four. Showing
  // them a college chip was noise at best, and actively misleading while the
  // seeded admin still carried the leftover "TD1 / Test Dept" workspace.
  const showCollege = role !== 'admin';

  return (
    <div
      // Announced when scope changes so the change is not silent for AT users.
      role="status"
      aria-live="polite"
      className="h-9 shrink-0 glass-dark border-x-0 border-b-0 flex items-center
                 gap-4 px-4 z-contextbar"
    >
      {/* Department. The registry hue never appears without its code — the four
          hues differ in luminance by only 1.02–1.26 and are unreliable alone.
          An unregistered DEPT_n renders neutral so orphaned workspaces stay
          visible rather than passing as a real department (INV-00). */}
      {showCollege && (
        <>
          <span className="flex items-center gap-2 min-w-0">
            <span
              aria-hidden="true"
              className="inline-block w-[3px] h-4 rounded-sm shrink-0"
              style={{ backgroundColor: dept.hue }}
            />
            <span className="font-ui text-body text-white truncate">{dept.code}</span>
            <span className="hidden lg:inline font-ui text-caption text-atlas-300 truncate">
              {dept.name}
            </span>
          </span>

          <span className="hidden sm:inline w-px h-4 bg-white/15 shrink-0" aria-hidden="true" />
        </>
      )}

      <span className="font-ui text-caption text-atlas-100 truncate">{roleLabel}</span>

      {/* Below the rail breakpoint the top bar's term control is cramped, so the
          term repeats here — the context bar must always carry both facts. */}
      <span className="lg:hidden font-ui text-caption text-atlas-300 truncate ml-auto">
        {termLabel === null ? '' : termLabel}
      </span>

      {/* Gold ribbon: the ambient answer to "is this official?", and the only
          ambient use of gold in the system. Gold is legal on green-900 (5.97)
          and nowhere else. Stays dormant until DEP-1 lands a publish endpoint. */}
      <span className="hidden lg:flex items-center gap-2 ml-auto shrink-0">
        {isPublished && (
          <>
            <span className="font-ui text-caption text-atlas-gold">Published</span>
            <span className="block w-10 h-[3px] rounded-sm bg-atlas-gold" aria-hidden="true" />
            <span className="sr-only">This term&apos;s schedule is published.</span>
          </>
        )}
      </span>
    </div>
  );
}
