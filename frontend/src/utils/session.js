/**
 * Session and role helpers.
 *
 * ATLAS has exactly three roles (backend schemas.VALID_ROLES). They were being
 * read straight out of localStorage in 14 places, each normalising differently
 * — `.toLowerCase()` here, `.toLowerCase().trim()` there, a bare read somewhere
 * else — and the router additionally granted 'faculty' and 'student', neither
 * of which the backend can issue. One reader, one normalisation, one place to
 * change when the role list changes.
 */

export const ROLES = {
  ADMIN: 'admin',
  PROGRAM_CHAIR: 'program_chair',
  COORDINATOR: 'coordinator',
};

/** Every role that may sign in. Use this for router guards. */
export const ALL_ROLES = [ROLES.ADMIN, ROLES.PROGRAM_CHAIR, ROLES.COORDINATOR];

/**
 * Roles that plan and edit timetables.
 *
 * The administrator is deliberately absent. The boundary is institutional
 * reference data versus departmental operations, and the schema already draws
 * it: `Room` has no `department_id` and is shared campus infrastructure, while
 * `Faculty` has one and belongs to a college. An admin sets the frame — who may
 * act, what may be taught, when, and where — and chairs work inside it.
 */
export const SCHEDULING_ROLES = [ROLES.PROGRAM_CHAIR, ROLES.COORDINATOR];

/**
 * Every localStorage key the app owns. Logout and the 401 handler each kept
 * their own copy of this list, so a key added to one was left behind by the
 * other on sign-out.
 */
export const SESSION_KEYS = [
  'atlas_token',
  'atlas_role',
  'atlas_user_name',
  'atlas_department',
  'atlas_profile_picture',
];

/** The signed-in role, normalised. Returns '' when signed out. */
export function getRole() {
  if (typeof window === 'undefined') return '';
  return (localStorage.getItem('atlas_role') || '').toLowerCase().trim();
}

export function isAdmin() {
  return getRole() === ROLES.ADMIN;
}

/* --------------------------------------------------------------------------
 * Capabilities.
 *
 * Named per capability rather than as one `canManage()`, because the roles no
 * longer split cleanly in two: the administrator gains curriculum and rooms at
 * exactly the point they lose schedules and faculty. A single boolean forced
 * every screen to mean the same thing by "manage", which is what let the admin
 * reach faculty and schedule generation in the first place.
 * ----------------------------------------------------------------------- */

/** Generate, create, edit or delete classes. Chairs and coordinators only. */
export function canEditSchedules() {
  return SCHEDULING_ROLES.includes(getRole());
}

/** Add, edit or remove faculty and their availability. Departmental. */
export function canManageFaculty() {
  return SCHEDULING_ROLES.includes(getRole());
}

/** Curriculum is the institutional catalog: the admin owns it, chairs maintain their own. */
export function canManageCurriculum() {
  return ALL_ROLES.includes(getRole());
}

/** Rooms are shared campus infrastructure — anyone may add, only the admin may alter. */
export function canAddRooms() {
  return ALL_ROLES.includes(getRole());
}

export function canEditRooms() {
  return isAdmin();
}

/** Publishing is what makes a timetable official, and is a governance act. */
export function canPublishSchedule() {
  return isAdmin();
}

export function getDepartment() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('atlas_department') || '';
}

export function getUserName() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('atlas_user_name') || '';
}

/** Drop every session key. Shared by logout and the api client's 401 handler. */
export function clearSession() {
  if (typeof window === 'undefined') return;
  SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
}

/**
 * Persist a successful /auth/login response.
 *
 * Login had two byte-identical copies of this block — one for signing in, one
 * for the auto-login after email verification. They had already drifted once:
 * the verification path was missing the token write, so every call after
 * verifying 401'd wherever the cookie is blocked as cross-site.
 */
export function saveSession(response) {
  if (typeof window === 'undefined' || !response) return;
  if (response.access_token) localStorage.setItem('atlas_token', response.access_token);
  localStorage.setItem('atlas_role', response.role);
  localStorage.setItem('atlas_user_name', response.name || '');

  if (response.department) localStorage.setItem('atlas_department', response.department);
  else localStorage.removeItem('atlas_department');

  if (response.profile_picture) localStorage.setItem('atlas_profile_picture', response.profile_picture);
  else localStorage.removeItem('atlas_profile_picture');
}

/* --------------------------------------------------------------------------
 * Startup destination.
 *
 * The Settings screen offered "Timetables" and "Flowcharts", pointing at
 * /dashboard/timetable and /dashboard/flowcharts. Neither route exists, so the
 * catch-all sent anyone who picked one back to the public landing page. The
 * choice is validated against real routes here so an unknown or stale value
 * degrades to Overview instead of signing the user out of their own dashboard.
 * ----------------------------------------------------------------------- */
export const LANDING_VIEWS = [
  { value: '/dashboard', label: 'Overview' },
  { value: '/dashboard/schedules', label: 'Schedule' },
  { value: '/dashboard/curriculum', label: 'Curriculum' },
];

export const DEFAULT_LANDING_VIEW = '/dashboard';

export function getLandingView() {
  if (typeof window === 'undefined') return DEFAULT_LANDING_VIEW;
  const stored = localStorage.getItem('atlas_pref_landing_view');
  return LANDING_VIEWS.some((v) => v.value === stored) ? stored : DEFAULT_LANDING_VIEW;
}
