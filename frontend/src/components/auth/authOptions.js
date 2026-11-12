/**
 * College choices and normalization helpers for the Login/Registration page.
 */

export const SELF_REGISTRATION_ROLE = {
  value: 'program_chair',
  label: 'Program Chair',
};

export const DEPARTMENT_OPTIONS = [
  {
    value: 'CAST - Computer Engineering & Computer Science',
    college: 'CAST',
    program: 'Computer Engineering & Computer Science',
    label: 'CAST — Computer Eng & Computer Science',
  },
  {
    value: 'CAST - Psychology',
    college: 'CAST',
    program: 'Psychology',
    label: 'CAST — Psychology',
  },
  {
    value: 'CBMA - Accountancy',
    college: 'CBMA',
    program: 'Accountancy',
    label: 'CBMA — Accountancy',
  },
  {
    value: 'CBMA - Business Administration',
    college: 'CBMA',
    program: 'Business Administration',
    label: 'CBMA — Business Administration',
  },
  {
    value: 'CBMA - Hospitality & Tourism Management',
    college: 'CBMA',
    program: 'Hospitality & Tourism Management',
    label: 'CBMA — Hospitality & Tourism Management',
  },
  {
    value: 'COED - Education Programs',
    college: 'COED',
    program: 'Education Programs',
    label: 'COED — Education Programs',
  },
  {
    value: 'CVMAS - Agriculture',
    college: 'CVMAS',
    program: 'Agriculture',
    label: 'CVMAS — Agriculture',
  },
  {
    value: 'CVMAS - Food Technology',
    college: 'CVMAS',
    program: 'Food Technology',
    label: 'CVMAS — Food Technology',
  },
  {
    value: 'CVMAS - Basic Veterinary Science',
    college: 'CVMAS',
    program: 'Basic Veterinary Science',
    label: 'CVMAS — Basic Veterinary Science',
  },
  {
    value: 'CVMAS - Veterinary Paraclinical',
    college: 'CVMAS',
    program: 'Veterinary Paraclinical',
    label: 'CVMAS — Veterinary Paraclinical',
  },
  {
    value: 'CVMAS - Veterinary Clinical',
    college: 'CVMAS',
    program: 'Veterinary Clinical',
    label: 'CVMAS — Veterinary Clinical',
  },
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

