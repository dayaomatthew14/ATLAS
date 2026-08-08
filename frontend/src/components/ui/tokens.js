/**
 * ATLAS shared UI primitives — token helpers.
 *
 * Phase 1 §1.1. Kept as plain data so it can be imported by components and by
 * tests without pulling in React.
 */

/* --------------------------------------------------------------------------
 * Focus. One ring, everywhere, no exceptions (Phase 1 §1.2).
 * Green-700 clears 3:1 on both surface (6.72) and canvas (6.31). On green-900
 * chrome it is invisible, so dark surfaces use green-300 (7.02).
 * ----------------------------------------------------------------------- */
export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atlas-700 ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-atlas-surface';

export const focusRingOnDark =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atlas-300 ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-atlas-900';

/* --------------------------------------------------------------------------
 * Department registry.
 *
 * Departments are currently created per user as DEPT_{id} rather than as
 * institutional records (audit finding INV-00), so a fixed four-code map would
 * match almost nothing in the live database. Unregistered codes therefore fall
 * back to neutral slate and render their raw code, which makes orphaned
 * workspaces visible instead of disguising them as a real department.
 *
 * HARD RULE: the hue never appears without its department code as adjacent
 * visible text. The four hues clear 3:1 against white individually, but their
 * mutual contrast is only 1.02–1.26 — they differ in hue, not luminance, so
 * they are unreliable in greyscale and under deuteranopia.
 * ----------------------------------------------------------------------- */
/**
 * Names are kept in step with backend/app/academics.py, which is the authority.
 * These four are now seeded institutional records rather than the per-user
 * `DEPT_{id}` workspaces this map was originally written to paper over.
 */
export const DEPARTMENTS = {
  CAST: { code: 'CAST', name: 'College of Arts, Sciences & Technology', hue: 'var(--dept-cast)' },
  CBMA: { code: 'CBMA', name: 'College of Business, Management & Accountancy', hue: 'var(--dept-cbma)' },
  CVMAS: { code: 'CVMAS', name: 'College of Veterinary Medicine & Agricultural Sciences', hue: 'var(--dept-cvmas)' },
  COED: { code: 'COED', name: 'College of Education', hue: 'var(--dept-coed)' },
};

/**
 * Resolve any department string to a display descriptor.
 * Never throws, never returns null — an unknown code is a valid state.
 */
export function resolveDepartment(code) {
  if (!code) {
    return { code: '—', name: 'No department', hue: 'var(--dept-unregistered)', registered: false };
  }
  const key = String(code).trim().toUpperCase();
  const known = DEPARTMENTS[key];
  if (known) return { ...known, registered: true };

  return {
    code: String(code).trim(),
    name: 'Unassigned workspace',
    hue: 'var(--dept-unregistered)',
    registered: false,
  };
}

/* --------------------------------------------------------------------------
 * Role labels. Three roles exist (schemas.VALID_ROLES); the UI must not invent
 * more. If a Dean role is added later this is the only map that changes.
 * ----------------------------------------------------------------------- */
export const ROLE_LABELS = {
  admin: 'System Administrator',
  program_chair: 'Program Chair',
  coordinator: 'Coordinator',
};

export const ROLE_PLURALS = {
  admin: 'administrators',
  program_chair: 'program chairs',
  coordinator: 'coordinators',
};

/**
 * "1 results" is the kind of thing a registrar's system should not say, and it
 * is read aloud verbatim from the table caption.
 */
export function pluralize(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural || `${singular}s`}`;
}

/**
 * Copy for the role-restricted control state.
 * Names who *can* act rather than telling the user what they cannot do, so
 * they know whom to ask (Phase 1 §1.3).
 */
export function restrictionReason(allowedRole, action) {
  const who = ROLE_PLURALS[allowedRole] || 'other roles';
  return `Only ${who} can ${action}.`;
}
