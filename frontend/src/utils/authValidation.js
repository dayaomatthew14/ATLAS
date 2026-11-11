// Re-export shared validation utilities while keeping Login.jsx and auth tests decoupled.
export {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_BYTES,
  NAME_PATTERN,
  normalizeContactNumber,
  validatePersonName,
  validateContactNumber,
  validateEmailAddress,
  validatePasswordValue,
  validateConfirmPasswordValue,
  validateOtpCode,
  validateDepartmentSelection,
  hasImmediateCharacterIssue,
  parseApiValidationError,
} from './validation.js';
