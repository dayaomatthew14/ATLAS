// Shared diagnostic validation helpers across ATLAS forms.
// Keep constants in sync with backend/app/schemas.py.
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_BYTES = 72;
export const NAME_PATTERN = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ\s.\-']*$/;
export const ALLOWED_DAY_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const ALLOWED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
export const ALLOWED_EXCEL_EXTENSIONS = ['xlsx', 'xlsm'];

function sampleInvalidChars(chars) {
  return [...new Set(chars)].slice(0, 5).join('');
}

export function formatTime12h(timeStr) {
  if (!timeStr) return '';
  const [hStr, mStr = '00'] = String(timeStr).split(':');
  const h = Number(hStr);
  if (Number.isNaN(h)) return String(timeStr);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${mStr.slice(0, 2)} ${ampm}`;
}

export function normalizeContactNumber(value) {
  return String(value ?? '').trim().replace(/[\s-]+/g, '');
}

/**
 * Diagnose why a human name is invalid (empty, digits, unsupported symbols, or punctuation-first).
 */
export function validatePersonName(
  value,
  label = 'Name',
  { required = true, requireFullName = false } = {}
) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return required ? `${label} is required.` : '';
  }

  const hasDigits = /\d/.test(trimmed);
  const invalidSyms = trimmed.match(/[^A-Za-zÀ-ÖØ-öø-ÿ0-9\s.\-']/g);
  const hasSymbols = Boolean(invalidSyms && invalidSyms.length > 0);

  if (hasDigits && hasSymbols) {
    return `${label} cannot contain numbers or symbols like "${sampleInvalidChars(invalidSyms)}". Use letters, spaces, hyphens (-), apostrophes ('), or periods (.) only.`;
  }
  if (hasDigits) {
    return `${label} cannot contain numbers (0–9). Use letters, spaces, hyphens (-), apostrophes ('), or periods (.) only.`;
  }
  if (hasSymbols) {
    return `${label} cannot contain symbols like "${sampleInvalidChars(invalidSyms)}". Use letters, spaces, hyphens (-), apostrophes ('), or periods (.) only.`;
  }
  if (!NAME_PATTERN.test(trimmed)) {
    return `${label} must start with a letter (e.g., Juan or O'Brien).`;
  }
  if (requireFullName && trimmed.split(/\s+/).length < 2) {
    return 'Include both first name and surname (e.g., Juan Dela Cruz).';
  }
  return '';
}

export function hasImmediateNameIssue(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return false;
  return (
    /\d/.test(trimmed) ||
    /[^A-Za-zÀ-ÖØ-öø-ÿ0-9\s.\-']/.test(trimmed) ||
    /^[.\-']/.test(trimmed)
  );
}

/**
 * Validate Philippine mobile numbers while allowing spaces or hyphens for readability.
 */
export function validateContactNumber(value, { required = true } = {}) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return required ? 'Contact Number is required.' : '';
  }

  const compact = normalizeContactNumber(raw);
  if (/[A-Za-z]/.test(compact)) {
    return 'Contact Number cannot contain letters. Enter digits only in 09XXXXXXXXX or +639XXXXXXXXX format.';
  }
  if (!/^\+?\d+$/.test(compact)) {
    return 'Contact Number can only contain digits (and optional leading +63), e.g., 0912 345 6789 or +639123456789.';
  }

  if (compact.startsWith('+')) {
    if (!compact.startsWith('+639')) {
      return 'Numbers with + must start with +639 (e.g., +639123456789).';
    }
    if (compact.length !== 13) {
      return `Invalid length: +63 numbers must have 10 digits after +63 starting with 9 (${compact.slice(3).length}/10 digits).`;
    }
    return '';
  }

  if (compact.startsWith('639')) {
    return 'Include the leading + for country code (+639XXXXXXXXX), or start with 09 (09XXXXXXXXX).';
  }
  if (!compact.startsWith('09')) {
    return 'Philippine mobile number must start with 09 or +639 (e.g., 09123456789).';
  }
  if (compact.length !== 11) {
    return `Invalid length: mobile numbers starting with 09 must have 11 digits (${compact.length}/11 digits).`;
  }
  return '';
}

export function hasImmediateContactIssue(value) {
  const compact = normalizeContactNumber(value);
  if (!compact) return false;
  if (/[A-Za-z]/.test(compact) || /[^0-9+]/.test(compact) || compact.indexOf('+', 1) !== -1) {
    return true;
  }
  if (!compact.startsWith('0') && !compact.startsWith('+')) {
    return true;
  }
  if (compact.length >= 2 && compact.startsWith('0') && compact[1] !== '9') {
    return true;
  }
  if (compact.startsWith('+') && compact.length >= 2 && compact[1] !== '6') {
    return true;
  }
  if (compact.startsWith('+6') && compact.length >= 3 && compact[2] !== '3') {
    return true;
  }
  if (compact.startsWith('+63') && compact.length >= 4 && compact[3] !== '9') {
    return true;
  }
  return (compact.startsWith('09') && compact.length > 11) || (compact.startsWith('+639') && compact.length > 13);
}

/**
 * Diagnose why an email address is invalid (empty, spaces, missing @, invalid domain).
 */
export function validateEmailAddress(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return 'Email Address is required.';
  }
  if (/\s/.test(trimmed)) {
    return 'Email Address cannot contain spaces (e.g., name@dlsau.edu.ph).';
  }

  const parts = trimmed.split('@');
  if (parts.length === 1) {
    return "Email Address must include an '@' symbol (e.g., name@dlsau.edu.ph).";
  }
  if (parts.length > 2) {
    return "Email Address cannot contain more than one '@' symbol.";
  }

  const [localPart, domainPart] = parts;
  if (!localPart) {
    return "Enter your username before '@' (e.g., name@dlsau.edu.ph).";
  }
  if (
    !domainPart ||
    !domainPart.includes('.') ||
    domainPart.startsWith('.') ||
    domainPart.endsWith('.') ||
    domainPart.includes('..')
  ) {
    return "Enter a valid domain after '@' (e.g., name@dlsau.edu.ph).";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
    return 'Enter a valid email address (e.g., name@dlsau.edu.ph).';
  }
  return '';
}

export function hasImmediateEmailIssue(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return false;
  return /\s/.test(trimmed) || (trimmed.match(/@/g) || []).length > 1 || trimmed.startsWith('@');
}

/**
 * Validate password input. Policy checks (12–72 bytes) apply when creating/resetting passwords.
 */
export function validatePasswordValue(value, { enforcePolicy = true, label = 'Password' } = {}) {
  const str = String(value ?? '');
  if (!str) {
    return `${label} is required.`;
  }
  if (/^\s|\s$/.test(str)) {
    return `${label} cannot start or end with a space.`;
  }

  if (enforcePolicy) {
    if (str.length < MIN_PASSWORD_LENGTH) {
      return `${label} must be at least ${MIN_PASSWORD_LENGTH} characters (${str.length}/${MIN_PASSWORD_LENGTH}).`;
    }
    const byteLength = typeof TextEncoder !== 'undefined'
      ? new TextEncoder().encode(str).length
      : str.length;
    if (byteLength > MAX_PASSWORD_BYTES) {
      return `${label} must not exceed ${MAX_PASSWORD_BYTES} bytes (${byteLength}/${MAX_PASSWORD_BYTES} bytes).`;
    }
  }

  return '';
}

export function hasImmediatePasswordIssue(value) {
  const str = String(value ?? '');
  if (/^\s|\s$/.test(str)) return true;
  const byteLength = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(str).length : str.length;
  return byteLength > MAX_PASSWORD_BYTES;
}

export function validateConfirmPasswordValue(value, password) {
  const str = String(value ?? '');
  if (!str) {
    return 'Please confirm your password.';
  }
  if (str !== String(password ?? '')) {
    return 'Passwords do not match. Re-enter the same password.';
  }
  return '';
}

export function validateOtpCode(value) {
  const code = String(value ?? '').trim();
  if (!code) {
    return 'Verification code is required.';
  }
  if (/\D/.test(code)) {
    return 'Code must contain numbers (0–9) only, without letters or symbols.';
  }
  if (code.length !== 6) {
    return `Code must be 6 digits (${code.length}/6 digits).`;
  }
  return '';
}

export function validateDepartmentSelection(value) {
  return value ? '' : 'Please select a Department / College.';
}

/**
 * Return true when live typing introduces a character-level mistake that should be flagged right away.
 */
export function hasImmediateCharacterIssue(name, value) {
  const str = String(value ?? '');
  const trimmed = str.trim();
  if (!trimmed && name !== 'password') return false;

  if (name === 'firstName' || name === 'lastName' || name === 'fullName') {
    return hasImmediateNameIssue(str);
  }
  if (name === 'contactNumber') {
    return hasImmediateContactIssue(str);
  }
  if (name === 'email') {
    return hasImmediateEmailIssue(str);
  }
  if (name === 'password') {
    return hasImmediatePasswordIssue(str);
  }
  if (name === 'otp') {
    return /\D/.test(trimmed) || trimmed.length > 6;
  }
  if (name === 'academicYear') {
    return hasImmediateAcademicYearIssue(str);
  }
  if (name === 'programCode') {
    return hasImmediateAlnumCodeIssue(str);
  }
  if (name === 'courseCode') {
    return hasImmediateCourseCodeIssue(str);
  }
  return false;
}

/**
 * Diagnose academic year format (YYYY-YYYY, consecutive years).
 */
export function validateAcademicYear(
  value,
  { label = 'Academic year', required = true, allowAyPrefix = false } = {}
) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return required ? `${label} is required (e.g., 2026-2027).` : '';
  }

  let working = raw;
  if (/^ay\b/i.test(working)) {
    if (!allowAyPrefix) {
      return 'Enter only the two years without the "AY" prefix (e.g., 2026-2027).';
    }
    working = working.replace(/^ay\s+/i, '').trim();
  }

  if (/[A-Za-z]/.test(working)) {
    return `${label} cannot contain letters. Use YYYY-YYYY format (e.g., 2026-2027).`;
  }
  if (/[^0-9-]/.test(working)) {
    const syms = working.match(/[^0-9-]/g) || [];
    return `${label} cannot contain "${sampleInvalidChars(syms)}". Use digits and one hyphen (-), e.g., 2026-2027.`;
  }
  if (!/^\d{4}-\d{4}$/.test(working)) {
    return `${label} must follow YYYY-YYYY format with two 4-digit years (e.g., 2026-2027).`;
  }

  const [from, to] = working.split('-').map(Number);
  if (from < 2000 || from > 2100) {
    return `Enter a valid start year between 2000 and 2100 (e.g., 2026-2027).`;
  }
  if (to !== from + 1) {
    return `The second year (${to}) must follow the first year (${from} + 1 = ${from + 1}, e.g., ${from}-${from + 1}).`;
  }
  return '';
}

export function hasImmediateAcademicYearIssue(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return false;
  return /[A-Za-z]/.test(trimmed) || /[^0-9-]/.test(trimmed) || (trimmed.match(/-/g) || []).length > 1;
}

/**
 * Validate degree program code (e.g., BSCS).
 */
export function validateProgramCode(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return 'Program code is required (e.g., BSCS).';
  }
  if (/\s/.test(trimmed)) {
    return 'Program code cannot contain spaces (e.g., use BSCS instead of BS CS).';
  }
  const syms = trimmed.match(/[^A-Za-z0-9]/g);
  if (syms) {
    return `Program code cannot contain symbols like "${sampleInvalidChars(syms)}". Use letters and numbers only (e.g., BSCS).`;
  }
  if (!/[A-Za-z]/.test(trimmed)) {
    return 'Program code must contain at least one letter (e.g., BSCS).';
  }
  if (trimmed.length < 2) {
    return `Program code must be at least 2 characters (${trimmed.length}/2, e.g., BSCS).`;
  }
  if (trimmed.length > 20) {
    return `Program code must be at most 20 characters (${trimmed.length}/20).`;
  }
  return '';
}

export function hasImmediateAlnumCodeIssue(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return false;
  return /\s/.test(trimmed) || /[^A-Za-z0-9]/.test(trimmed);
}

/**
 * Validate course / subject code (e.g., CC101A/B, IT-101, GEC 101).
 */
export function validateCourseCode(value, { label = 'Course code', required = true } = {}) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return required ? `${label} is required (e.g., CC101A/B).` : '';
  }
  const syms = trimmed.match(/[^A-Za-z0-9\s.\-_/]/g);
  if (syms) {
    return `${label} cannot contain symbols like "${sampleInvalidChars(syms)}". Use letters, numbers, spaces, '-', '_', '/', or '.' only.`;
  }
  if (!/^[A-Za-z]/.test(trimmed)) {
    return `${label} must start with a letter (e.g., CC101A/B or GEC 101).`;
  }
  if (trimmed.length < 2) {
    return `${label} must be at least 2 characters (e.g., IT1).`;
  }
  if (trimmed.length > 40) {
    return `${label} must be at most 40 characters (${trimmed.length}/40).`;
  }
  return '';
}

export function hasImmediateCourseCodeIssue(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return false;
  return /[^A-Za-z0-9\s.\-_/]/.test(trimmed) || !/^[A-Za-z]/.test(trimmed);
}

/**
 * Validate entity names/titles (program name, room name, building, course title).
 */
export function validateEntityTitle(
  value,
  {
    label = 'Name',
    minLength = 2,
    maxLength = 255,
    requireLetter = true,
    allowDigitsOnly = false,
    example = '',
  } = {}
) {
  const trimmed = String(value ?? '').trim();
  const exampleText = example ? ` (e.g., ${example})` : '';

  if (!trimmed) {
    return `${label} is required${exampleText}.`;
  }

  const unsupported = trimmed.match(/[^A-Za-zÀ-ÖØ-öø-ÿ0-9\s.\-_/,&()'+#&:]/g);
  if (unsupported) {
    return `${label} cannot contain unsupported symbols like "${sampleInvalidChars(unsupported)}".`;
  }

  if (!/[A-Za-zÀ-ÖØ-öø-ÿ0-9]/.test(trimmed)) {
    return `${label} cannot contain punctuation or symbols only${exampleText}.`;
  }
  if (!allowDigitsOnly && requireLetter && !/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(trimmed)) {
    return `${label} must include letters, not only numbers or symbols${exampleText}.`;
  }
  if (trimmed.length < minLength) {
    return `${label} must be at least ${minLength} characters (${trimmed.length}/${minLength}${example ? `, e.g., ${example}` : ''}).`;
  }
  if (trimmed.length > maxLength) {
    return `${label} must be at most ${maxLength} characters (${trimmed.length}/${maxLength}).`;
  }
  return '';
}

/**
 * Validate optional or required class section label (e.g., 1A, CS-3A).
 */
export function validateSectionName(value, { required = false } = {}) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return required ? 'Section is required (e.g., 1A or CS-3A).' : '';
  }
  const syms = trimmed.match(/[^A-Za-z0-9\s.\-_]/g);
  if (syms) {
    return `Section cannot contain symbols like "${sampleInvalidChars(syms)}". Use letters, numbers, spaces, or hyphens (e.g., 1A, CS-3A).`;
  }
  if (!/[A-Za-z0-9]/.test(trimmed)) {
    return 'Section must include a letter or number (e.g., 1A, CS-3A).';
  }
  if (trimmed.length > 30) {
    return `Section must be at most 30 characters (${trimmed.length}/30).`;
  }
  return '';
}

/**
 * Validate an integer field with clear diagnosis for blanks, letters, decimals, and range violations.
 */
export function validateIntegerRange(
  value,
  { label = 'Value', min = 0, max = 100, required = true, blankHint = '' } = {}
) {
  const raw = value === null || value === undefined ? '' : String(value).trim();
  if (!raw) {
    if (!required) return '';
    return `${label} is required (enter a whole number from ${min} to ${max}).`;
  }

  if (/[A-Za-z]/.test(raw) || /[^0-9.\-+]/.test(raw)) {
    return `${label} must be a whole number from ${min} to ${max} (letters and symbols are not allowed)${blankHint}.`;
  }

  const n = Number(raw);
  if (Number.isNaN(n)) {
    return `${label} must be a whole number from ${min} to ${max}${blankHint}.`;
  }
  if (!Number.isInteger(n)) {
    return `${label} must be a whole number (decimals like ${raw} are not allowed).`;
  }
  if (n < min) {
    return `${label} cannot be less than ${min}. Enter a whole number between ${min} and ${max}${blankHint}.`;
  }
  if (n > max) {
    return `${label} cannot exceed ${max}. Enter a whole number between ${min} and ${max}${blankHint}.`;
  }
  return '';
}

/**
 * Validate start/end time strings ("HH:MM") so end time strictly follows start time.
 */
export function validateTimeOrder(startTime, endTime, { contextLabel = 'Schedule' } = {}) {
  const start = String(startTime ?? '').trim();
  const end = String(endTime ?? '').trim();
  if (!start) return 'Select a start time.';
  if (!end) return 'Select an end time.';
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(start) || !/^\d{2}:\d{2}(:\d{2})?$/.test(end)) {
    return 'Enter valid start and end times (HH:MM).';
  }
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if (eh * 60 + em <= sh * 60 + sm) {
    return `${contextLabel} end time (${formatTime12h(end)}) must be after start time (${formatTime12h(start)}).`;
  }
  return '';
}

/**
 * Validate optional date of birth (YYYY-MM-DD, not in the future, >= 1900).
 */
export function validateDateOfBirth(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return 'Enter a valid date of birth (YYYY-MM-DD).';
  }
  const [y, m, d] = raw.split('-').map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== y ||
    parsed.getUTCMonth() !== m - 1 ||
    parsed.getUTCDate() !== d
  ) {
    return 'Enter a valid calendar date for Date of birth.';
  }
  if (y < 1900) {
    return 'Year of birth must be 1900 or later.';
  }
  const todayStr = new Date().toISOString().slice(0, 10);
  if (raw > todayStr) {
    return 'Date of birth cannot be in the future.';
  }
  return '';
}

/**
 * Validate uploaded file extension and size before posting to API.
 */
export function validateFileUpload(
  file,
  { allowedExtensions = [], maxMb = 10, label = 'File' } = {}
) {
  if (!file) return `Select a ${label.toLowerCase()} to upload.`;
  const fileName = String(file.name || '');
  if (allowedExtensions.length > 0) {
    const ext = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
    if (!allowedExtensions.includes(ext)) {
      const accepted = allowedExtensions.map((e) => `.${e}`).join(', ');
      return `Unsupported ${label.toLowerCase()} type${ext ? ` (.${ext})` : ''}. Upload ${accepted} only.`;
    }
  }
  if (typeof file.size === 'number') {
    if (file.size <= 0) {
      return `The selected ${label.toLowerCase()} is empty (0 bytes). Choose a non-empty file.`;
    }
    const maxBytes = maxMb * 1024 * 1024;
    if (file.size > maxBytes) {
      return `${label} is too large. Maximum allowed size is ${maxMb} MB.`;
    }
  }
  return '';
}

const SERVER_FIELD_MAP = {
  first_name: 'firstName',
  last_name: 'lastName',
  contact_number: 'contactNumber',
  email: 'email',
  password: 'password',
  new_password: 'password',
  department: 'department',
  otp: 'otp',
};

/**
 * Convert FastAPI/Pydantic 422 details into clean banner text and per-field error messages.
 */
export function parseApiValidationError(rawDetail, fallbackMessage, customMap = null) {
  const cleanText = (val) =>
    String(val ?? '')
      .replace(/^Value error,\s*/i, '')
      .replace(/^Assertion failed,\s*/i, '');

  if (typeof rawDetail === 'string') {
    return { message: cleanText(rawDetail), fields: {} };
  }
  if (Array.isArray(rawDetail)) {
    const fields = {};
    const messages = rawDetail.map((item) => {
      if (typeof item === 'string') return cleanText(item);
      const cleanMsg = cleanText(item?.msg || item?.detail || JSON.stringify(item));
      const locField = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : null;
      let mapped = null;
      if (locField) {
        if (customMap === 'identity') {
          mapped = locField;
        } else if (customMap && typeof customMap === 'object') {
          mapped = customMap[locField] ?? locField;
        } else {
          mapped = SERVER_FIELD_MAP[locField] ?? null;
        }
      }
      if (mapped && !fields[mapped]) {
        fields[mapped] = cleanMsg;
      }
      return cleanMsg;
    });
    return { message: messages.join(' '), fields };
  }
  if (rawDetail && typeof rawDetail === 'object') {
    const clean = cleanText(rawDetail.message || rawDetail.detail || JSON.stringify(rawDetail));
    return { message: clean, fields: {} };
  }
  return { message: fallbackMessage || 'An error occurred. Please try again.', fields: {} };
}

/**
 * Convenience wrapper around `api.js` thrown Error objects (`err.response.data.detail`).
 */
export function parseErrorResponse(err, fallbackMessage, customMap = 'identity') {
  const rawDetail = err?.response?.data?.detail ?? err?.message;
  return parseApiValidationError(rawDetail, fallbackMessage, customMap);
}

