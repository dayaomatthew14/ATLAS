import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LogIn, Key, User, UserPlus, Phone, Mail, ShieldCheck, Eye, EyeOff, AlertCircle, RefreshCw, Send, CheckCircle2, Building, ChevronDown, Check } from 'lucide-react';
import { api } from '../utils/api';
import { saveSession, getLandingView } from '../utils/session';

// Keep in sync with MIN_PASSWORD_LENGTH in backend/app/schemas.py
const MIN_PASSWORD_LENGTH = 12;

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
      if (!/^[A-Za-z\s]+$/.test(value)) err = "Name must contain letters only. No numbers or symbols allowed.";
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
    const isDepartmentValid = validateField('department', department);

    return isFirstNameValid && isLastNameValid && isContactValid && isEmailValid && isPasswordValid && isDepartmentValid;
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
        if (password !== confirmPassword) {
          setError('Passwords do not match.');
          setLoading(false);
          return;
        }

        // Format contact number to E.164 for Twilio
        let formattedContact = contactNumber;
        if (formattedContact.startsWith('09')) {
          formattedContact = '+63' + formattedContact.substring(1);
        }

        const payload = {
          email, password, first_name: firstName, last_name: lastName,
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
            <button type="button" onClick={() => { setError(''); setMode('register'); }} className="text-yellow-600 font-bold hover:underline text-left">
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
      <div className="mb-4 text-left">
        <label className="block text-sm font-semibold text-gray-700 mb-2 ml-1">{label}</label>
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Icon className={`h-4 w-4 transition-colors ${hasError ? 'text-rose-400' : 'text-gray-400 group-focus-within:text-green-600'}`} />
          </div>
          <input
            name={name}
            type={type}
            required
            value={value}
            onChange={(e) => setter(e.target.value)}
            onBlur={handleBlur}
            {...extraProps}
            className={`block w-full pl-11 pr-4 py-3 bg-white border rounded-xl outline-none transition-all text-gray-700 font-medium placeholder:text-gray-300 shadow-sm
              ${hasError ? 'border-rose-300 focus:border-rose-500 bg-rose-50/30' : 'border-gray-200 focus:bg-white focus:border-green-600 focus:ring-1 focus:ring-green-600/20'}
            `}
            placeholder={placeholder}
          />
        </div>
        {hasError && <p className="text-xs text-rose-500 font-medium mt-1.5 ml-1">{hasError}</p>}
      </div>
    );
  };

function CustomSelectInput({ icon: Icon, value, setter, label, options, hasError }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className="mb-4 text-left relative" ref={dropdownRef}>
      <label className="block text-sm font-semibold text-gray-700 mb-2 ml-1">{label}</label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full pl-11 pr-10 py-3 bg-white border rounded-xl outline-none transition-all font-medium text-left shadow-sm flex items-center justify-between ${
            hasError
              ? 'border-rose-300 focus:border-rose-500 bg-rose-50/30'
              : isOpen
              ? 'border-green-600 ring-2 ring-green-600/20 bg-white'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Icon className={`h-4 w-4 transition-colors ${hasError ? 'text-rose-400' : isOpen ? 'text-green-600' : 'text-gray-400'}`} />
          </div>
          <span className={`truncate text-xs sm:text-sm font-semibold ${selectedOption ? 'text-slate-900' : 'text-gray-400'}`}>
            {selectedOption ? selectedOption.label : `Select ${label}...`}
          </span>
          <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-gray-400">
            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180 text-green-600' : ''}`} />
          </div>
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white/95 backdrop-blur-2xl border border-slate-200 shadow-2xl rounded-2xl z-50 overflow-hidden py-1.5 max-h-64 overflow-y-auto animate-in fade-in zoom-in-95 duration-150 ring-1 ring-black/5">
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setter(opt.value);
                    setIsOpen(false);
                  }}
                  className={`w-full px-4 py-3 text-left text-xs sm:text-sm font-bold transition-all flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-green-50 text-green-800 border-l-4 border-l-green-600'
                      : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                  title={opt.label}
                >
                  <span className="whitespace-normal leading-snug break-words flex-1">{opt.label}</span>
                  {isSelected && <Check className="w-4 h-4 text-green-600 shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {hasError && <p className="text-xs text-rose-500 font-medium mt-1.5 ml-1">{hasError}</p>}
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
      <div className="mb-4 text-left">
        <label className="block text-sm font-semibold text-gray-700 mb-2 ml-1">{label}</label>
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Key className={`h-4 w-4 transition-colors ${hasError ? 'text-rose-400' : 'text-gray-400 group-focus-within:text-green-600'}`} />
          </div>
          <input
            name={name}
            type={showPassword ? "text" : "password"}
            required
            value={value}
            onChange={(e) => setter(e.target.value)}
            onBlur={handleBlur}
            onKeyUp={handleKeyUp}
            className={`block w-full pl-11 pr-10 py-3 bg-white border rounded-xl outline-none transition-all text-gray-700 font-medium placeholder:text-gray-300 shadow-sm
              ${hasError ? 'border-rose-300 focus:border-rose-500 bg-rose-50/30' : 'border-gray-200 focus:bg-white focus:border-green-600 focus:ring-1 focus:ring-green-600/20'}
            `}
            placeholder={placeholder}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-green-600 transition-colors focus:outline-none"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {hasError && <p className="text-xs text-rose-500 font-medium mt-1.5 ml-1">{hasError}</p>}
      </div>
    );
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center font-sans p-4">
      <div className="absolute inset-0 z-0 bg-cover bg-center" style={{ backgroundImage: `url('/dlsau_bg.jpg')`, backgroundColor: '#052e16' }}>
        <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"></div>
      </div>

      <div className="relative z-10 w-full max-w-lg">
        <div className="bg-white/60 backdrop-blur-xl rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-white/20 relative z-20">
          <div className="pt-12 pb-6 px-10 text-center">
            <div className="w-28 h-28 flex items-center justify-center mx-auto mb-6 transform hover:scale-105 transition-transform">
              <img src="/atlas_logo.png" alt="Atlas Logo" className="w-full h-full object-contain drop-shadow-xl" />
            </div>
            <h2 className="text-4xl font-bold text-green-800 tracking-tight mb-1">
              {mode === 'login' ? 'ATLAS' :
                mode === 'register' ? 'Join ATLAS' :
                  mode === 'verify' ? 'Verify Account' :
                    'Reset Password'}
            </h2>
            <p className="text-gray-500 text-sm font-medium">DLSAU Tertiary Education Portal</p>
          </div>

          <div className="px-8 pb-10 pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Sign-out could not reach the server. The session cookie is
                  HttpOnly, so nothing in the browser can clear it -- saying so
                  is the only honest option on a shared machine, where the user
                  would otherwise walk away believing they had signed out. */}
              {location.state?.signOutIncomplete && (
                <div
                  role="alert"
                  className="bg-amber-50 text-amber-700 p-4 rounded-2xl text-sm border border-amber-100 flex items-start"
                >
                  <AlertCircle className="w-4 h-4 mr-2 mt-0.5 shrink-0" aria-hidden="true" />
                  <span className="font-medium">
                    You were signed out on this device, but the server could not be
                    reached to end the session. Close the browser to be sure it has ended.
                  </span>
                </div>
              )}
              {error && (
                <div className="bg-rose-50 text-rose-600 p-4 rounded-2xl text-sm border border-rose-100 flex items-start animate-in fade-in slide-in-from-top-2">
                  <span className="font-medium">{error}</span>
                </div>
              )}
              {success && (
                <div className="bg-emerald-50 text-emerald-600 p-4 rounded-2xl text-sm border border-emerald-100 flex items-start animate-in fade-in slide-in-from-top-2">
                  <span className="font-medium">{success}</span>
                </div>
              )}

              {/* Login Mode */}
              {mode === 'login' && (
                <>
                  {renderField('email', Mail, 'email', 'name@dlsau.edu.ph', email, setEmail, 'Email Address')}
                  {renderPasswordField('password', password, setPassword, 'Password')}

                  {capsLockOn && (
                    <div className="flex items-center text-yellow-600 text-[10px] font-bold uppercase tracking-widest mt-1 ml-1">
                      <AlertCircle className="w-3 h-3 mr-1.5" /> Caps Lock is ON
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 border-gray-300 cursor-pointer transition-all"
                      />
                      <span className="ml-2 text-sm font-medium text-gray-600 group-hover:text-gray-900 transition-colors">Remember me</span>
                    </label>
                    <button type="button" onClick={() => setMode('forgot_email')} className="text-sm font-semibold text-green-700 hover:text-green-800">Forgot password?</button>
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
                  <div className="flex flex-col items-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => handleResend('auto')}
                      disabled={loading}
                      className="text-xs font-black text-green-700 hover:text-green-600 uppercase tracking-widest disabled:opacity-50"
                    >
                      Resend Verification Code
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResend('sms')}
                      disabled={loading}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:text-green-700 disabled:opacity-50"
                    >
                      <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                      Didn’t get the email? Send the code by SMS
                    </button>
                  </div>
                </>
              )}

              {/* Forgot Password - Step 1: Email */}
              {mode === 'forgot_email' && (
                <>
                  <p className="text-sm text-gray-500 mb-4 font-medium">Enter your registered email address to receive a password reset code.</p>
                  {renderField('email', Mail, 'email', 'name@dlsau.edu.ph', email, setEmail, 'Email Address')}
                </>
              )}

              {/* Forgot Password - Step 2: OTP */}
              {mode === 'forgot_otp' && (
                <>
                  <p className="text-sm text-gray-500 mb-4 font-medium">Enter the 6-digit code sent to your email or phone.</p>
                  {renderField('otp', Key, 'text', '123456', otp, setOtp, 'Reset OTP (6 digits)')}
                </>
              )}

              {/* Forgot Password - Step 3: Reset */}
              {mode === 'forgot_reset' && (
                <>
                  <p className="text-sm text-gray-500 mb-4 font-medium">Enter your new password below.</p>
                  {renderPasswordField('password', password, setPassword, 'New Password')}
                  {renderPasswordField('confirmPassword', confirmPassword, setConfirmPassword, 'Confirm Password')}
                </>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center py-3.5 px-6 rounded-xl shadow-lg text-sm font-bold text-white bg-green-700 hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-600 transition-all transform active:scale-[0.98] disabled:opacity-70 mt-6"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : mode === 'login' ? (
                  <><LogIn className="w-4 h-4 mr-2" /> Log in to Atlas</>
                ) : mode === 'register' ? (
                  <><UserPlus className="w-4 h-4 mr-2" /> Complete Registration</>
                ) : mode === 'verify' ? (
                  <><CheckCircle2 className="w-4 h-4 mr-2" /> Verify Account</>
                ) : mode === 'forgot_email' ? (
                  <><Send className="w-4 h-4 mr-2" /> Send Reset Link</>
                ) : mode === 'forgot_otp' ? (
                  <><Key className="w-4 h-4 mr-2" /> Verify OTP</>
                ) : (
                  <><RefreshCw className="w-4 h-4 mr-2" /> Reset Password</>
                )}
              </button>
            </form>

            <div className="mt-10 text-center">
              <p className="text-sm font-semibold text-gray-500 mb-4">
                {mode === 'login' ? "First time using ATLAS?" : "Already have an account?"}
              </p>
              {mode === 'login' ? (
                <button
                  type="button"
                  onClick={() => setMode('register')}
                  className="w-full py-3 px-6 rounded-xl border border-gray-200 font-bold text-sm text-gray-700 hover:bg-gray-50/50 transition-all"
                >
                  Create Account
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
                  className="w-full py-3 px-6 rounded-xl border border-green-100 font-bold text-sm text-green-700 hover:bg-green-50/50 transition-all"
                >
                  Return to Login
                </button>
              )}
            </div>
          </div>
        </div>

        <p className="mt-8 text-center text-white/40 text-[10px] font-bold uppercase tracking-[0.3em]">
          &copy; 2026 ATLAS Academic Timetabling System
        </p>
      </div>
    </div>
  );
}
