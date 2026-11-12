import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { LogIn, Key, User, UserPlus, Phone, Mail, ShieldCheck, AlertCircle, RefreshCw, Send, CheckCircle2, Building, ArrowLeft } from 'lucide-react';
import { api } from '../utils/api';
import { saveSession, getLandingView } from '../utils/session';
import {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_BYTES,
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
} from '../utils/authValidation';
import AuthBackdrop from '../components/auth/AuthBackdrop';
import {
  SELF_REGISTRATION_ROLE,
  DEPARTMENT_OPTIONS,
  AUTH_TITLES,
  AUTH_SUBTITLES,
  collegeCodeOf,
} from '../components/auth/authOptions';
import {
  AuthTextField,
  AuthPasswordField,
  AuthStaticField,
  CustomSelectInput,
} from '../components/auth/AuthFields';

export default function Login() {
  const location = useLocation();
  const navigate = useNavigate();

  // State Machine for flows
  // 'login', 'register', 'verify', 'forgot_email', 'forgot_otp', 'forgot_reset'
  const [mode, setMode] = useState(location.state?.mode === 'register' ? 'register' : 'login');

  // Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const role = SELF_REGISTRATION_ROLE.value;
  const [department, setDepartment] = useState('');
  const [otp, setOtp] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  // Validation Errors
  const [fieldErrors, setFieldErrors] = useState({});
  const [touchedFields, setTouchedFields] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // UI States
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);

  const handleKeyUp = (e) => {
    if (e.getModifierState && e.getModifierState('CapsLock')) {
      setCapsLockOn(true);
    } else {
      setCapsLockOn(false);
    }
  };

  const switchMode = (nextMode, { keepAlerts = false } = {}) => {
    setMode(nextMode);
    setFieldErrors({});
    setTouchedFields({});
    if (!keepAlerts) {
      setError('');
      setSuccess('');
    }
  };

  // Validation Rules
  const getFieldError = (name, value, overrides = {}) => {
    if (name === 'firstName') return validatePersonName(value, 'First Name');
    if (name === 'lastName') return validatePersonName(value, 'Last Name');
    if (name === 'contactNumber') return validateContactNumber(value);
    if (name === 'email') return validateEmailAddress(value);
    if (name === 'password') {
      return validatePasswordValue(value, { enforcePolicy: mode !== 'login' });
    }
    if (name === 'confirmPassword') {
      const targetPassword = overrides.password !== undefined ? overrides.password : password;
      return validateConfirmPasswordValue(value, targetPassword);
    }
    if (name === 'department') return validateDepartmentSelection(value);
    if (name === 'otp') return validateOtpCode(value);
    return '';
  };

  const validateField = (name, value, overrides = {}) => {
    const err = getFieldError(name, value, overrides);
    setFieldErrors(prev => ({ ...prev, [name]: err }));
    return err === '';
  };

  const validateFields = (entries) => {
    const nextErrors = {};
    const nextTouched = {};
    let allValid = true;
    for (const [name, value] of entries) {
      nextTouched[name] = true;
      const err = getFieldError(name, value);
      if (err) allValid = false;
      nextErrors[name] = err;
    }
    setTouchedFields(prev => ({ ...prev, ...nextTouched }));
    setFieldErrors(prev => ({ ...prev, ...nextErrors }));
    return allValid;
  };

  const handleFieldChange = (name, setter) => (nextValue) => {
    setter(nextValue);
    if (error && typeof error === 'string') {
      setError('');
    }

    if (touchedFields[name] || fieldErrors[name] || hasImmediateCharacterIssue(name, nextValue)) {
      validateField(name, nextValue);
    }

    if (
      name === 'password' &&
      mode !== 'login' &&
      (confirmPassword || touchedFields.confirmPassword || fieldErrors.confirmPassword)
    ) {
      validateField('confirmPassword', confirmPassword, { password: nextValue });
    }
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    setTouchedFields(prev => ({ ...prev, [name]: true }));
    validateField(name, value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (mode === 'login') {
        if (!validateFields([['email', email], ['password', password]])) {
          setLoading(false);
          return;
        }

        const formData = new FormData();
        formData.append('username', email.trim().toLowerCase());
        formData.append('password', password);
        formData.append('remember_me', rememberMe);

        const response = await api.postForm('/auth/login', formData);

        if (response && response.role) {
          saveSession(response);
          navigate(getLandingView());
        }
      }
      else if (mode === 'register') {
        if (
          !validateFields([
            ['firstName', firstName],
            ['lastName', lastName],
            ['department', department],
            ['contactNumber', contactNumber],
            ['email', email],
            ['password', password],
            ['confirmPassword', confirmPassword],
          ])
        ) {
          setLoading(false);
          return;
        }

        // Normalize spaces/hyphens and format contact number to E.164 for Twilio
        let formattedContact = normalizeContactNumber(contactNumber);
        if (formattedContact.startsWith('09')) {
          formattedContact = '+63' + formattedContact.substring(1);
        }

        const payload = {
          email: email.trim().toLowerCase(),
          password,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          contact_number: formattedContact, role,
          // The dropdown identifies a college *and* an area within it -- "CAST -
          // Psychology" -- because that is how a chair describes their post.
          // `users.department` holds the college code alone, and registration
          // rejects anything that is not one, so the whole option value used to
          // be sent and every registration failed with "Select a college."
          //
          // The area is dropped rather than stored: nothing in the schema holds
          // it, and the codes are what every scoped query compares against.
          department: collegeCodeOf(department),
        };

        const created = await api.post('/auth/register', payload);
        // The account exists either way, so the verify step is still where the
        // user goes. What changes is whether they should sit waiting for a
        // message: the API now reports what it actually managed to send.
        if (created && created.verification_sent === false) {
          setError(
            'Your account was created, but the verification code could not be sent. '
            + 'Ask an administrator to verify it, or use Resend once delivery is working.'
          );
        } else {
          const ch = (created && created.verification_channels) || {};
          const where = ch.email && ch.sms ? 'email and phone'
            : ch.sms ? 'phone'
              : 'email';
          setSuccess(`A verification code has been sent to your ${where}. Please confirm before logging in.`);
        }
        switchMode('verify', { keepAlerts: true });
      }
      else if (mode === 'verify') {
        if (!validateFields([['email', email], ['otp', otp]])) {
          setLoading(false);
          return;
        }
        await api.post('/auth/verify-email', { email: email.trim().toLowerCase(), otp: otp.trim() });

        // Verification confirms the address; it is not a sign-in. Signing the
        // user straight in used to mean the password they had just chosen was
        // never once typed to get in, so a typo in it stayed hidden until the
        // session ended -- and anyone finishing a verification link on a shared
        // machine landed in an authenticated session without meaning to.
        setPassword('');
        setConfirmPassword('');
        setOtp('');
        setSuccess('Your account is verified. Sign in to continue.');
        switchMode('login', { keepAlerts: true });
      }
      else if (mode === 'forgot_email') {
        if (!validateFields([['email', email]])) {
          setLoading(false);
          return;
        }
        const response = await api.post('/auth/forgot-password', { email: email.trim().toLowerCase() });
        setSuccess(response.msg);
        switchMode('forgot_otp', { keepAlerts: true });
      }
      else if (mode === 'forgot_otp') {
        if (!validateFields([['otp', otp]])) {
          setLoading(false);
          return;
        }
        setError('');
        switchMode('forgot_reset', { keepAlerts: true });
      }
      else if (mode === 'forgot_reset') {
        if (!validateFields([['password', password], ['confirmPassword', confirmPassword]])) {
          setLoading(false);
          return;
        }
        await api.post('/auth/reset-password', {
          email: email.trim().toLowerCase(),
          otp: otp.trim(),
          new_password: password,
        });
        setPassword('');
        setConfirmPassword('');
        setOtp('');
        setSuccess('Password reset successfully! You can now log in.');
        switchMode('login', { keepAlerts: true });
      }
    } catch (err) {
      const parsed = parseApiValidationError(
        err.response?.data?.detail,
        err.message || 'An error occurred. Please try again.'
      );
      const detailMsg = parsed.message;
      if (Object.keys(parsed.fields).length > 0) {
        setFieldErrors(prev => ({ ...prev, ...parsed.fields }));
      }

      if (mode === 'login' && err.response?.status === 401) {
        setFieldErrors(prev => ({
          ...prev,
          password: 'Incorrect password. Check Caps Lock or reset your password.',
        }));
      } else if (mode === 'login' && err.response?.status === 403) {
        if (detailMsg.toLowerCase().includes('verified') || detailMsg.toLowerCase().includes('otp')) {
          setError('Account not verified. Please check your email for the verification OTP.');
          switchMode('verify', { keepAlerts: true });
        } else {
          setError(detailMsg || 'Access denied. You are not authorized to log in.');
        }
      } else if (mode === 'login' && err.response?.status === 404) {
        setError(
          <div className="flex flex-col space-y-2">
            <span>No account found for this email address.</span>
            <button type="button" onClick={() => switchMode('register')} className="text-sem-conflict font-bold underline underline-offset-4 decoration-sem-conflict/40 hover:decoration-sem-conflict text-left">
              Create a new account instead?
            </button>
          </div>
        );
      } else if (Object.keys(parsed.fields).length === 0) {
        setError(detailMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  /**
   * Ask for another code, optionally down a chosen channel.
   *
   * `channel: 'sms'` exists because the person at this screen knows something
   * the server does not: the server only learns that a relay accepted the
   * email, while they know it never arrived. Resending down the same failing
   * route is the one thing that cannot help, so they get to pick the other one.
   */
  const handleResend = async (channel = 'auto') => {
    setError('');
    setSuccess('');
    if (!validateFields([['email', email]])) {
      return;
    }
    setLoading(true);
    try {
      const response = await api.post('/auth/resend-verification', { email: email.trim().toLowerCase(), channel });
      const ch = response.channels || {};
      setSuccess(
        ch.sms && !ch.email ? 'A code has been sent by text message.'
          : ch.email && ch.sms ? 'A code has been sent to your email and phone.'
            : ch.email ? 'A code has been sent to your email.'
              : response.msg
      );
    } catch (err) {
      setError(err.message || 'Failed to resend code.');
    } finally {
      setLoading(false);
    }
  };

  const renderField = (name, icon, type, placeholder, value, setter, label, extraProps = {}) => (
    <AuthTextField
      id={`auth-${name}`}
      name={name}
      icon={icon}
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={(e) => handleFieldChange(name, setter)(e.target.value)}
      onBlur={handleBlur}
      label={label}
      hasError={fieldErrors[name]}
      extraProps={extraProps}
    />
  );

  const renderSelectField = (name, icon, value, setter, label, options) => {
    const handleSelect = (nextValue) => {
      setTouchedFields(prev => ({ ...prev, [name]: true }));
      setter(nextValue);
      validateField(name, nextValue);
      if (error && typeof error === 'string') setError('');
    };
    return (
      <CustomSelectInput
        key={name}
        icon={icon}
        value={value}
        setter={handleSelect}
        label={label}
        options={options}
        hasError={fieldErrors[name]}
      />
    );
  };

  const renderPasswordField = (name, value, setter, label, placeholder = "••••••••") => (
    <AuthPasswordField
      id={`auth-${name}`}
      name={name}
      value={value}
      onChange={(e) => handleFieldChange(name, setter)(e.target.value)}
      onBlur={handleBlur}
      onKeyUp={handleKeyUp}
      label={label}
      placeholder={placeholder}
      showPassword={showPassword}
      onToggleShowPassword={() => setShowPassword(!showPassword)}
      hasError={fieldErrors[name]}
    />
  );

  const title = AUTH_TITLES[mode] || 'Reset Password';
  const subtitle = AUTH_SUBTITLES[mode] || 'Choose a new password';

  return (
    <div
      style={{ fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', Arial, sans-serif" }}
      className="min-h-screen relative flex items-center justify-center font-ui p-4 sm:p-6"
    >
      <AuthBackdrop />

      <div className="relative z-10 w-full max-w-[480px]">
        <div className="relative auth-card-in">
          <div className="auth-rim" aria-hidden="true" />

          <div className="auth-card">
            <div className="auth-shine" aria-hidden="true" />

            {/* Back button to return to landing page */}
            <Link
              to="/"
              aria-label="Return to landing page"
              title="Return to landing page"
              className="absolute top-5 left-5 z-20 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-atlas-800/80 hover:text-atlas-900 bg-black/5 hover:bg-black/10 active:scale-95 transition-all group"
            >
              <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
              <span>Back</span>
            </Link>

            <div className="relative pt-10 pb-5 px-8 sm:px-10 text-center">
              <Link
                to="/"
                aria-label="Return to landing page"
                title="Return to landing page"
                className="auth-mark w-24 h-24 mx-auto mb-5 block transition-transform hover:scale-105 active:scale-95 cursor-pointer"
              >
                <img src="/atlas_logo.png" alt="ATLAS Logo - Return to landing page" className="w-full h-full object-contain drop-shadow-xl" />
              </Link>
              <h1 className="font-display text-[2.25rem] leading-none text-atlas-800 tracking-tight">
                {title}
              </h1>
              <p className="text-caption text-atlas-slate mt-2">{subtitle}</p>
            </div>

            <div className="relative px-6 sm:px-10 pb-9">
              {/* Re-keyed on mode, so switching between sign in and register
                  replays the entrance instead of swapping the fields in
                  place. It is the cheapest honest signal that the form
                  became a different form. */}
              <form key={mode} onSubmit={handleSubmit} noValidate className="auth-stagger space-y-4">
                {/* Sign-out could not reach the server. The session cookie is
                    HttpOnly, so nothing in the browser can clear it -- saying
                    so is the only honest option on a shared machine, where the
                    user would otherwise walk away believing they had signed
                    out. */}
                {location.state?.signOutIncomplete && (
                  <div
                    role="alert"
                    className="auth-alert bg-sem-warning-bg text-sem-warning p-3.5 rounded-panel text-caption border border-sem-warning/25 flex items-start"
                  >
                    <AlertCircle className="w-4 h-4 mr-2 mt-0.5 shrink-0" aria-hidden="true" />
                    <span className="font-medium leading-relaxed">
                      You were signed out on this device, but the server could not be
                      reached to end the session. Close the browser to be sure it has ended.
                    </span>
                  </div>
                )}
                {error && (
                  <div role="alert" className="auth-alert bg-sem-conflict-bg text-sem-conflict p-3.5 rounded-panel text-caption border border-sem-conflict/25 flex items-start">
                    <AlertCircle className="w-4 h-4 mr-2 mt-0.5 shrink-0" aria-hidden="true" />
                    {/* A div, not a span: `error` is sometimes a JSX node with
                        block children rather than a string. */}
                    <div className="font-medium leading-relaxed min-w-0">{error}</div>
                  </div>
                )}
                {success && (
                  <div role="status" className="auth-alert bg-atlas-50 text-atlas-800 p-3.5 rounded-panel text-caption border border-atlas-700/25 flex items-start">
                    <CheckCircle2 className="w-4 h-4 mr-2 mt-0.5 shrink-0" aria-hidden="true" />
                    <span className="font-medium leading-relaxed">{success}</span>
                  </div>
                )}

                {/* Login Mode */}
                {mode === 'login' && (
                  <>
                    {renderField('email', Mail, 'email', 'name@dlsau.edu.ph', email, setEmail, 'Email Address')}
                    {renderPasswordField('password', password, setPassword, 'Password')}

                    {capsLockOn && (
                      <div className="flex items-center text-sem-warning text-micro uppercase">
                        <AlertCircle className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Caps Lock is ON
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <label className="flex items-center cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="rounded-marker text-atlas-700 focus:ring-atlas-700 h-4 w-4 border-atlas-control cursor-pointer"
                        />
                        <span className="ml-2 text-caption font-medium text-atlas-slate group-hover:text-atlas-ink transition-colors duration-state ease-standard">
                          Remember me
                        </span>
                      </label>
                      <button
                        type="button"
                        onClick={() => switchMode('forgot_email')}
                        className="text-caption font-semibold text-atlas-700 hover:text-atlas-800 underline-offset-4 hover:underline transition-colors duration-state ease-standard"
                      >
                        Forgot password?
                      </button>
                    </div>
                  </>
                )}

                {/* Register Mode */}
                {mode === 'register' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      {renderField('firstName', User, 'text', 'Juan', firstName, setFirstName, 'First Name')}
                      {renderField('lastName', User, 'text', 'Dela Cruz', lastName, setLastName, 'Last Name')}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <AuthStaticField
                        id="auth-role"
                        icon={ShieldCheck}
                        label="User Role"
                        value={SELF_REGISTRATION_ROLE.label}
                      />
                      {renderSelectField('department', Building, department, setDepartment, 'Department / College', DEPARTMENT_OPTIONS)}
                    </div>
                    {renderField('contactNumber', Phone, 'tel', '0912 345 6789', contactNumber, setContactNumber, 'Contact Number')}
                    {renderField('email', Mail, 'email', 'name@dlsau.edu.ph', email, setEmail, 'Email Address')}
                    <div className="grid grid-cols-2 gap-4">
                      {renderPasswordField('password', password, setPassword, 'Password')}
                      {renderPasswordField('confirmPassword', confirmPassword, setConfirmPassword, 'Confirm Password')}
                    </div>
                    <p className="text-[11px] text-atlas-slate text-left -mt-1.5">
                      Use {MIN_PASSWORD_LENGTH}–{MAX_PASSWORD_BYTES} characters with no spaces at the start or end.
                    </p>
                  </>
                )}

                {/* Verify OTP Mode */}
                {mode === 'verify' && (
                  <>
                    {renderField('email', Mail, 'email', 'name@dlsau.edu.ph', email, setEmail, 'Email Address')}
                    {renderField('otp', Key, 'text', '123456', otp, setOtp, 'Verification OTP (6 digits)')}
                    {/* Two routes, named. Offering only "resend" when email is
                        the thing that is failing sends the user round the same
                        loop; the second button is the way out of it. */}
                    <div className="flex flex-col items-center gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={() => handleResend('auto')}
                        disabled={loading}
                        className="text-caption font-bold text-atlas-700 hover:text-atlas-800 uppercase tracking-wide disabled:opacity-50 transition-colors duration-state ease-standard"
                      >
                        Resend Verification Code
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResend('sms')}
                        disabled={loading}
                        className="inline-flex items-center gap-1.5 text-caption font-medium text-atlas-slate hover:text-atlas-700 disabled:opacity-50 transition-colors duration-state ease-standard"
                      >
                        <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                        Didn’t get the email? Send the code by SMS
                      </button>
                    </div>
                  </>
                )}

                {/* Forgot Password - Step 1: Email */}
                {mode === 'forgot_email' && renderField('email', Mail, 'email', 'name@dlsau.edu.ph', email, setEmail, 'Email Address')}

                {/* Forgot Password - Step 2: OTP */}
                {mode === 'forgot_otp' && renderField('otp', Key, 'text', '123456', otp, setOtp, 'Reset OTP (6 digits)')}

                {/* Forgot Password - Step 3: Reset */}
                {mode === 'forgot_reset' && (
                  <>
                    {renderPasswordField('password', password, setPassword, 'New Password')}
                    {renderPasswordField('confirmPassword', confirmPassword, setConfirmPassword, 'Confirm Password')}
                    <p className="text-[11px] text-atlas-slate text-left -mt-1.5">
                      Use {MIN_PASSWORD_LENGTH}–{MAX_PASSWORD_BYTES} characters with no spaces at the start or end.
                    </p>
                  </>
                )}

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="auth-sweep w-full flex justify-center items-center gap-2 py-3.5 px-6 rounded-control text-body font-semibold text-white bg-atlas-800 hover:bg-atlas-700 shadow-overlay hover:shadow-float focus:outline-none focus-visible:ring-4 focus-visible:ring-atlas-700/30 active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100 transition-[background-color,box-shadow,transform] duration-state ease-standard"
                  >
                    {loading ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-hidden="true" />
                        <span>Working…</span>
                      </>
                    ) : mode === 'login' ? (
                      <><LogIn className="w-4 h-4" aria-hidden="true" /> Log in to Atlas</>
                    ) : mode === 'register' ? (
                      <><UserPlus className="w-4 h-4" aria-hidden="true" /> Complete Registration</>
                    ) : mode === 'verify' ? (
                      <><CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Verify Account</>
                    ) : mode === 'forgot_email' ? (
                      <><Send className="w-4 h-4" aria-hidden="true" /> Send Reset Code</>
                    ) : mode === 'forgot_otp' ? (
                      <><Key className="w-4 h-4" aria-hidden="true" /> Verify OTP</>
                    ) : (
                      <><RefreshCw className="w-4 h-4" aria-hidden="true" /> Reset Password</>
                    )}
                  </button>
                </div>
              </form>

              <div className="mt-7 pt-5 border-t border-atlas-line text-center">
                <p className="text-caption text-atlas-slate">
                  {mode === 'login' ? "First time using ATLAS? " : "Already have an account? "}
                  <button
                    type="button"
                    onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
                    className="font-semibold text-atlas-700 hover:text-atlas-800 underline underline-offset-4 decoration-atlas-700/30 hover:decoration-atlas-800 transition-colors duration-state ease-standard"
                  >
                    {mode === 'login' ? 'Create an account' : 'Return to login'}
                  </button>
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-7 text-center text-micro uppercase text-white/45">
          &copy; 2026 ATLAS Academic Timetabling System
        </p>
      </div>
    </div>
  );
}
