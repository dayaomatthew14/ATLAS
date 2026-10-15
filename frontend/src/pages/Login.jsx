import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { LogIn, Key, User, UserPlus, Phone, Mail, ShieldCheck, Eye, EyeOff, AlertCircle, RefreshCw, Send, CheckCircle2, Building, ChevronDown, Check, ArrowLeft } from 'lucide-react';
import { api } from '../utils/api';
import { saveSession, getLandingView } from '../utils/session';

// Keep in sync with MIN_PASSWORD_LENGTH in backend/app/schemas.py
const MIN_PASSWORD_LENGTH = 12;

/**
 * Human names. Keep in sync with NAME_PATTERN in backend/app/schemas.py.
 *
 * This was `^[A-Za-z\s]+$` -- letters and spaces only -- which made the form
 * stricter than the server it posts to and refused several kinds of real name:
 * O'Brien, Dela Cruz-Santos and "Jr." were all rejected here while the API
 * would have accepted them. Worse, neither side allowed an accented letter, so
 * Peña and Muñoz -- among the most common surnames in the Philippines -- could
 * not be registered at all.
 *
 * Must begin with a letter, so a name cannot be punctuation on its own.
 */
const NAME_PATTERN = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ\s.\-']*$/;

/**
 * The college code out of a department option value.
 *
 * Options name a college and an area within it -- "CVMAS - Veterinary Clinical"
 * -- so a chair can say which post they hold. Registration stores and validates
 * the college code alone, so the code is what travels; the area is display.
 * Both separators the list uses are handled, and a value that is already a bare
 * code passes through unchanged.
 */
const collegeCodeOf = (value) =>
  String(value || '').split(/\s[-—]\s/)[0].trim().toUpperCase();

/**
 * The class blocks in the backdrop.
 *
 * Laid out in percentages down the two flanks and along the top and bottom,
 * so nothing ever sits behind the card on a wide screen -- the card is a fixed
 * 480px in the middle, and a block drifting under it would show through the
 * translucent surface as a coloured smear. Delays are spread across the 16s
 * cycle so the grid is always partly filled and never pulses as one.
 */
const SCENE_BLOCKS = [
  { left: '3%',  top: '12%', w: '10%', h: '5%',  tone: 'var(--dept-cast)',  delay: '0s'    },
  { left: '14%', top: '24%', w: '8%',  h: '7%',  tone: 'var(--dept-cvmas)', delay: '2.1s'  },
  { left: '5%',  top: '38%', w: '11%', h: '6%',  tone: 'var(--dept-coed)',  delay: '5.4s'  },
  { left: '17%', top: '53%', w: '7%',  h: '8%',  tone: 'var(--dept-cbma)',  delay: '8.2s'  },
  { left: '2%',  top: '66%', w: '9%',  h: '5%',  tone: 'var(--dept-cast)',  delay: '3.6s'  },
  { left: '12%', top: '79%', w: '10%', h: '6%',  tone: 'var(--dept-cvmas)', delay: '10.5s' },
  { left: '80%', top: '10%', w: '9%',  h: '6%',  tone: 'var(--dept-cbma)',  delay: '1.2s'  },
  { left: '88%', top: '25%', w: '8%',  h: '8%',  tone: 'var(--dept-cast)',  delay: '6.8s'  },
  { left: '76%', top: '41%', w: '11%', h: '5%',  tone: 'var(--dept-coed)',  delay: '4.3s'  },
  { left: '86%', top: '56%', w: '9%',  h: '7%',  tone: 'var(--dept-cvmas)', delay: '9.1s'  },
  { left: '78%', top: '71%', w: '8%',  h: '6%',  tone: 'var(--dept-cbma)',  delay: '12.4s' },
  { left: '90%', top: '84%', w: '7%',  h: '5%',  tone: 'var(--dept-coed)',  delay: '7.5s'  },
];

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
  const [role, setRole] = useState('program_chair');
  const [department, setDepartment] = useState('');
  const [otp, setOtp] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  // Validation Errors
  const [fieldErrors, setFieldErrors] = useState({});
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

  // Validation Rules
  const validateField = (name, value) => {
    let err = '';
    if (name === 'firstName' || name === 'lastName') {
      if (!NAME_PATTERN.test(value)) {
        err = "Enter a name using letters, spaces, hyphens, apostrophes or periods.";
      }
    } else if (name === 'confirmPassword') {
      // Checked as a field, like every other one. This used to surface only as
      // a banner at the top of the form on submit, which is the one place the
      // user is not looking when they mistype the second password box.
      if (value !== password) err = "Both passwords must match.";
    } else if (name === 'contactNumber') {
      if (!/^(09\d{9}|\+639\d{9})$/.test(value)) err = "Enter a valid PH number: 09XXXXXXXXX or +639XXXXXXXXX.";
    } else if (name === 'email') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) err = "Enter a valid email address.";
    } else if (name === 'password') {
      if (/^\s|\s$/.test(value)) err = "Password cannot start or end with spaces.";
      // The length rule applies only where a password is being SET. Enforcing
      // it on the sign-in form told every existing user whose password predates
      // the policy that their correct password was invalid.
      else if (mode !== 'login' && value.length < MIN_PASSWORD_LENGTH) {
        err = `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`;
      }
    } else if (name === 'department') {
      if (!value) err = "Please select a department.";
    }

    setFieldErrors(prev => ({ ...prev, [name]: err }));
    return err === '';
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    if (value) validateField(name, value);
  };

  const validateAll = () => {
    const isFirstNameValid = validateField('firstName', firstName);
    const isLastNameValid = validateField('lastName', lastName);
    const isContactValid = validateField('contactNumber', contactNumber);
    const isEmailValid = validateField('email', email);
    const isPasswordValid = validateField('password', password);
    const isConfirmValid = validateField('confirmPassword', confirmPassword);
    const isDepartmentValid = validateField('department', department);

    return isFirstNameValid && isLastNameValid && isContactValid && isEmailValid
      && isPasswordValid && isConfirmValid && isDepartmentValid;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (mode === 'login') {
        setFieldErrors({});
        if (!email || !email.trim()) {
          setError('Please enter your email address.');
          setFieldErrors(prev => ({ ...prev, email: 'Email address is required' }));
          setLoading(false);
          return;
        }
        if (!password) {
          setError('Please enter your password.');
          setFieldErrors(prev => ({ ...prev, password: 'Password is required' }));
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
        if (!validateAll()) {
          setLoading(false);
          return;
        }

        // Format contact number to E.164 for Twilio
        let formattedContact = contactNumber;
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
        setMode('verify');
      }
      else if (mode === 'verify') {
        await api.post('/auth/verify-email', { email, otp });

        // Verification confirms the address; it is not a sign-in. Signing the
        // user straight in used to mean the password they had just chosen was
        // never once typed to get in, so a typo in it stayed hidden until the
        // session ended -- and anyone finishing a verification link on a shared
        // machine landed in an authenticated session without meaning to.
        setPassword('');
        setConfirmPassword('');
        setOtp('');
        setMode('login');
        setSuccess('Your account is verified. Sign in to continue.');
      }
      else if (mode === 'forgot_email') {
        const response = await api.post('/auth/forgot-password', { email: email.trim().toLowerCase() });
        setSuccess(response.msg);
        setMode('forgot_otp');
      }
      else if (mode === 'forgot_otp') {
        // HEU-10: this step used to advance on any input at all, so a wrong
        // code was only discovered after the user had chosen and re-typed a new
        // password. There is no endpoint that checks a reset code on its own,
        // so validate the shape here and let the reset call be the authority —
        // but at least stop accepting obviously wrong input.
        const code = (otp || '').trim();
        if (!/^\d{6}$/.test(code)) {
          setError('Enter the 6-digit code from your email.');
          setFieldErrors((prev) => ({ ...prev, otp: 'The code is 6 digits.' }));
          setLoading(false);
          return;
        }
        setError('');
        setMode('forgot_reset');
      }
      else if (mode === 'forgot_reset') {
        if (!validateField('password', password)) {
          setLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          setError('Passwords do not match.');
          setLoading(false);
          return;
        }
        await api.post('/auth/reset-password', { email: email.trim().toLowerCase(), otp, new_password: password });
        setSuccess('Password reset successfully! You can now log in.');
        setMode('login');
      }
    } catch (err) {
      let detailMsg = '';
      const rawDetail = err.response?.data?.detail;
      if (typeof rawDetail === 'string') {
        detailMsg = rawDetail;
      } else if (Array.isArray(rawDetail)) {
        detailMsg = rawDetail.map(d => (typeof d === 'string' ? d : d.msg || d.detail || JSON.stringify(d))).join(', ');
      } else if (rawDetail && typeof rawDetail === 'object') {
        detailMsg = rawDetail.message || rawDetail.detail || JSON.stringify(rawDetail);
      } else {
        detailMsg = err.message || 'An error occurred. Please try again.';
      }

      if (mode === 'login' && err.response?.status === 401) {
        setError('Incorrect password. Please double-check your password and try again.');
        setFieldErrors(prev => ({ ...prev, password: 'Incorrect password' }));
      } else if (mode === 'login' && err.response?.status === 403) {
        if (detailMsg.toLowerCase().includes('verified') || detailMsg.toLowerCase().includes('otp')) {
          setError('Account not verified. Please check your email for the verification OTP.');
          setMode('verify');
        } else {
          setError(detailMsg || 'Access denied. You are not authorized to log in.');
        }
      } else if (mode === 'login' && err.response?.status === 404) {
        setError(
          <div className="flex flex-col space-y-2">
            <span>No account found for this email address.</span>
            <button type="button" onClick={() => { setError(''); setMode('register'); }} className="text-sem-conflict font-bold underline underline-offset-4 decoration-sem-conflict/40 hover:decoration-sem-conflict text-left">
              Create a new account instead?
            </button>
          </div>
        );
      } else {
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
    if (!email) {
      setError('Please enter your email first.');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await api.post('/auth/resend-verification', { email, channel });
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

  const renderField = (name, icon, type, placeholder, value, setter, label, extraProps = {}) => {
    const Icon = icon;
    const hasError = fieldErrors[name];
    return (
      <div className="text-left">
        <label htmlFor={`auth-${name}`} className="block text-caption font-semibold text-atlas-slate mb-1.5">
          {label}
        </label>
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Icon
              aria-hidden="true"
              className={`h-4 w-4 transition-colors duration-state ease-standard ${
                hasError ? 'text-sem-conflict' : 'text-atlas-disabled group-focus-within:text-atlas-700'
              }`}
            />
          </div>
          <input
            id={`auth-${name}`}
            name={name}
            type={type}
            required
            value={value}
            onChange={(e) => setter(e.target.value)}
            onBlur={handleBlur}
            aria-invalid={hasError ? 'true' : undefined}
            aria-describedby={hasError ? `auth-${name}-error` : undefined}
            {...extraProps}
            className={`block w-full pl-10 pr-3.5 py-2.5 bg-white/70 border rounded-field outline-none text-body text-atlas-ink
              placeholder:text-atlas-disabled placeholder:font-normal
              transition-[border-color,box-shadow,background-color] duration-state ease-standard
              ${hasError
                ? 'border-sem-conflict focus:border-sem-conflict focus:ring-4 focus:ring-sem-conflict/15 focus:bg-white'
                : 'border-atlas-control hover:border-atlas-700/60 focus:border-atlas-700 focus:ring-4 focus:ring-atlas-700/15 focus:bg-white'}
            `}
            placeholder={placeholder}
          />
        </div>
        {hasError && (
          <p id={`auth-${name}-error`} className="text-caption text-sem-conflict font-medium mt-1.5">
            {hasError}
          </p>
        )}
      </div>
    );
  };

function CustomSelectInput({ icon: Icon, value, setter, label, options, hasError }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  // A <label> cannot be associated with a <button>, so the trigger carries the
  // field name itself. Without this a screen reader announces only the chosen
  // value -- "Program Chair" -- and never says which field it belongs to.
  const labelId = `auth-select-${label.replace(/\W+/g, '-').toLowerCase()}`;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Escape closes the menu. Without it the only way out of an accidentally
  // opened list is a click elsewhere, which a keyboard user does not have.
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className="text-left relative" ref={dropdownRef}>
      <label id={labelId} className="block text-caption font-semibold text-atlas-slate mb-1.5">{label}</label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-labelledby={labelId}
          className={`w-full pl-10 pr-9 py-2.5 bg-white/70 border rounded-field outline-none text-left flex items-center justify-between
            transition-[border-color,box-shadow,background-color] duration-state ease-standard ${
            hasError
              ? 'border-sem-conflict ring-4 ring-sem-conflict/15'
              : isOpen
              ? 'border-atlas-700 ring-4 ring-atlas-700/15 bg-white'
              : 'border-atlas-control hover:border-atlas-700/60'
          }`}
        >
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Icon
              aria-hidden="true"
              className={`h-4 w-4 transition-colors duration-state ease-standard ${
                hasError ? 'text-sem-conflict' : isOpen ? 'text-atlas-700' : 'text-atlas-disabled'
              }`}
            />
          </div>
          <span className={`truncate text-body ${selectedOption ? 'text-atlas-ink font-medium' : 'text-atlas-disabled'}`}>
            {selectedOption ? selectedOption.label : `Select ${label}...`}
          </span>
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <ChevronDown
              aria-hidden="true"
              className={`h-4 w-4 transition-transform duration-overlay ease-emphasis ${
                isOpen ? 'rotate-180 text-atlas-700' : 'text-atlas-disabled'
              }`}
            />
          </div>
        </button>

        {isOpen && (
          <div
            role="listbox"
            aria-labelledby={labelId}
            className="auth-pop absolute top-full left-0 right-0 mt-1.5 bg-white border border-atlas-line shadow-overlay rounded-panel z-overlay overflow-hidden py-1 max-h-64 overflow-y-auto"
          >
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    setter(opt.value);
                    setIsOpen(false);
                  }}
                  className={`w-full px-3.5 py-2.5 text-left text-body transition-colors duration-state ease-standard flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-atlas-100 text-atlas-800 font-semibold'
                      : 'text-atlas-ink hover:bg-atlas-50'
                  }`}
                  title={opt.label}
                >
                  <span className="whitespace-normal leading-snug break-words flex-1">{opt.label}</span>
                  {isSelected && <Check aria-hidden="true" className="w-4 h-4 text-atlas-700 shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {hasError && <p className="text-caption text-sem-conflict font-medium mt-1.5">{hasError}</p>}
    </div>
  );
}

  const renderSelectField = (name, icon, value, setter, label, options) => {
    return (
      <CustomSelectInput
        key={name}
        icon={icon}
        value={value}
        setter={setter}
        label={label}
        options={options}
        hasError={fieldErrors[name]}
      />
    );
  };

  const renderPasswordField = (name, value, setter, label, placeholder = "••••••••") => {
    const hasError = fieldErrors[name];
    return (
      <div className="text-left">
        <label htmlFor={`auth-${name}`} className="block text-caption font-semibold text-atlas-slate mb-1.5">
          {label}
        </label>
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Key
              aria-hidden="true"
              className={`h-4 w-4 transition-colors duration-state ease-standard ${
                hasError ? 'text-sem-conflict' : 'text-atlas-disabled group-focus-within:text-atlas-700'
              }`}
            />
          </div>
          <input
            id={`auth-${name}`}
            name={name}
            type={showPassword ? "text" : "password"}
            required
            value={value}
            onChange={(e) => setter(e.target.value)}
            onBlur={handleBlur}
            onKeyUp={handleKeyUp}
            aria-invalid={hasError ? 'true' : undefined}
            aria-describedby={hasError ? `auth-${name}-error` : undefined}
            className={`block w-full pl-10 pr-10 py-2.5 bg-white/70 border rounded-field outline-none text-body text-atlas-ink
              placeholder:text-atlas-disabled placeholder:font-normal
              transition-[border-color,box-shadow,background-color] duration-state ease-standard
              ${hasError
                ? 'border-sem-conflict focus:border-sem-conflict focus:ring-4 focus:ring-sem-conflict/15 focus:bg-white'
                : 'border-atlas-control hover:border-atlas-700/60 focus:border-atlas-700 focus:ring-4 focus:ring-atlas-700/15 focus:bg-white'}
            `}
            placeholder={placeholder}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-atlas-disabled hover:text-atlas-700 transition-colors duration-state ease-standard focus:outline-none focus-visible:text-atlas-700"
          >
            {showPassword ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
          </button>
        </div>
        {hasError && (
          <p id={`auth-${name}-error`} className="text-caption text-sem-conflict font-medium mt-1.5">
            {hasError}
          </p>
        )}
      </div>
    );
  };

  const title =
    mode === 'login' ? 'ATLAS' :
    mode === 'register' ? 'Join ATLAS' :
    mode === 'verify' ? 'Verify Account' :
    'Reset Password';

  const subtitle =
    mode === 'login' ? 'DLSAU Tertiary Education Portal' :
    mode === 'register' ? 'Register a chair or coordinator account' :
    mode === 'verify' ? 'Confirm the code we sent you' :
    mode === 'forgot_email' ? 'We will send a reset code to your address' :
    mode === 'forgot_otp' ? 'Enter the 6-digit code' :
    'Choose a new password';

  return (
    <div
      style={{ fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', Arial, sans-serif" }}
      className="min-h-screen relative flex items-center justify-center font-ui p-4 sm:p-6"
    >
      {/* ---------------------------------------------------------------
          The backdrop: a timetable assembling itself. The grid is drawn on
          --tt-daycol-min / --tt-hour, the same metrics the real schedule
          grid uses, and the blocks carry the department colours. It is
          decorative in the accessibility sense -- nothing here is content --
          so the whole scene is hidden from assistive tech.
         --------------------------------------------------------------- */}
      <div className="auth-scene" aria-hidden="true">
        <div className="auth-photo" style={{ backgroundImage: `url('/dlsau_bg.jpg')` }} />
        <div className="auth-blob auth-blob-1" />
        <div className="auth-blob auth-blob-2" />
        <div className="auth-blob auth-blob-3" />
        <div className="auth-grid" />
        {SCENE_BLOCKS.map((b, i) => (
          <div
            key={i}
            className="auth-block"
            style={{
              left: b.left,
              top: b.top,
              width: b.w,
              height: b.h,
              color: b.tone,
              animationDelay: b.delay,
            }}
          />
        ))}
        <div className="auth-vignette" />
      </div>

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
              <form key={mode} onSubmit={handleSubmit} className="auth-stagger space-y-4">
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
                        onClick={() => setMode('forgot_email')}
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
                      {renderSelectField('role', ShieldCheck, role, setRole, 'User Role', [
                        { value: 'program_chair', label: 'Program Chair' },
                        { value: 'coordinator', label: 'Coordinator' }
                      ])}
                      {renderSelectField('department', Building, department, setDepartment, 'Department / Position', role === 'coordinator' ? [
                        { value: 'CAST - Language and Literature Courses', label: 'CAST — Language & Literature Courses' },
                        { value: 'CAST - Math and Science Courses', label: 'CAST — Math & Science Courses' },
                        { value: 'CAST - Human and Societal Formation Courses', label: 'CAST — Human & Societal Formation Courses' },
                        { value: 'CAST - NSTP', label: 'CAST — NSTP' },
                      ] : [
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
                      ])}
                    </div>
                    {renderField('contactNumber', Phone, 'tel', '0912 345 6789', contactNumber, setContactNumber, 'Contact Number')}
                    {renderField('email', Mail, 'email', 'name@dlsau.edu.ph', email, setEmail, 'Email Address')}
                    <div className="grid grid-cols-2 gap-4">
                      {renderPasswordField('password', password, setPassword, 'Password')}
                      {renderPasswordField('confirmPassword', confirmPassword, setConfirmPassword, 'Confirm Password')}
                    </div>
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
                    onClick={() => {
                      if (mode === 'login') {
                        setMode('register');
                      } else {
                        setMode('login');
                        setError('');
                        setSuccess('');
                      }
                    }}
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
