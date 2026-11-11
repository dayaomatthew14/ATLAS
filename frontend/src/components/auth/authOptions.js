/**
 * College/role choices and normalization helpers for the Login/Registration page.
 */

export const ROLE_OPTIONS = [
  { value: 'program_chair', label: 'Program Chair' },
];

export const DEPARTMENT_OPTIONS = [
  { value: 'CAST - Computer Engineering & Computer Science', label: 'CAST — Computer Eng & Computer Science' },
  { value: 'CAST - Psychology', label: 'CAST — Psychology' },
  { value: 'COED - Education Programs', label: 'COED — Education Programs' },
  { value: 'CBMA - Accountancy', label: 'CBMA — Accountancy' },
  { value: 'CBMA - Business Administration', label: 'CBMA — Business Administration' },
  { value: 'CBMA - Hospitality & Tourism Management', label: 'CBMA — Hospitality & Tourism Management' },
  { value: 'CVMAS - Agriculture', label: 'CVMAS — Agriculture' },
  { value: 'CVMAS - Food Technology', label: 'CVMAS — Food Technology' },
  { value: 'CVMAS - Basic Veterinary Science', label: 'CVMAS — Basic Veterinary Science' },
  { value: 'CVMAS - Veterinary Paraclinical', label: 'CVMAS — Veterinary Paraclinical' },
  { value: 'CVMAS - Veterinary Clinical', label: 'CVMAS — Veterinary Clinical' },
];

export const AUTH_TITLES = {
  login: 'ATLAS',
  register: 'Join ATLAS',
  verify: 'Verify Account',
  forgot_email: 'Reset Password',
  forgot_otp: 'Reset Password',
  forgot_reset: 'Reset Password',
};

export const AUTH_SUBTITLES = {
  login: 'DLSAU Tertiary Education Portal',
  register: 'Register a program chair account',
  verify: 'Confirm the code we sent you',
  forgot_email: 'We will send a reset code to your address',
  forgot_otp: 'Enter the 6-digit code',
  forgot_reset: 'Choose a new password',
};

/**
 * Extract the leading college code from display values like "CVMAS - Veterinary Clinical".
 */
export const collegeCodeOf = (value) =>
  String(value || '').split(/\s[-—]\s/)[0].trim().toUpperCase();

