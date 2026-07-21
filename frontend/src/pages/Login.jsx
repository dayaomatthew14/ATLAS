import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { api } from '../utils/api';
import { LogIn, Key, User, ArrowLeft, UserPlus, Phone, Mail, ShieldCheck, Eye, EyeOff, AlertCircle, RefreshCw, Send, CheckCircle2, Building } from 'lucide-react';


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
        const formData = new FormData();
        formData.append('username', email);
        formData.append('password', password);
        formData.append('remember_me', rememberMe);

        const response = await api.postForm('/auth/login', formData);

        localStorage.setItem('atlas_role', response.role);
        localStorage.setItem('atlas_user_name', response.name);
        if (response.department) {
          localStorage.setItem('atlas_department', response.department);
        }
        if (response.profile_picture) {
          localStorage.setItem('atlas_profile_picture', response.profile_picture);
        } else {
          localStorage.removeItem('atlas_profile_picture');
        }
        navigate('/dashboard');
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
          email, password, first_name: firstName, last_name: lastName, contact_number: formattedContact, role: 'program_chair', department
        };

        await api.post('/auth/register', payload);
        setSuccess('A verification code has been sent to your email and phone. Please confirm before logging in.');
        setMode('verify');
      }
      else if (mode === 'verify') {
        await api.post('/auth/verify-email', { email, otp });

        // Auto-login after successful verification
        const formData = new FormData();
        formData.append('username', email);
        formData.append('password', password);
        formData.append('remember_me', rememberMe);

        const response = await api.postForm('/auth/login', formData);

        localStorage.setItem('atlas_role', response.role);
        localStorage.setItem('atlas_user_name', response.name);
        if (response.department) {
          localStorage.setItem('atlas_department', response.department);
        }
        if (response.profile_picture) {
          localStorage.setItem('atlas_profile_picture', response.profile_picture);
        } else {
          localStorage.removeItem('atlas_profile_picture');
        }
        navigate('/dashboard');
      }
      else if (mode === 'forgot_email') {
        const response = await api.post('/auth/forgot-password', { email });
        setSuccess(response.msg);
        setMode('forgot_otp');
      }
      else if (mode === 'forgot_otp') {
        // No explicit verification endpoint for OTP alone, but we'll assume it's valid to move to reset
        setMode('forgot_reset');
      }
      else if (mode === 'forgot_reset') {
        if (password !== confirmPassword) {
          setError('Passwords do not match.');
          setLoading(false);
          return;
        }
        await api.post('/auth/reset-password', { email, otp, new_password: password });
        setSuccess('Password reset successfully! You can now log in.');
        setMode('login');
      }
    } catch (err) {
      if (mode === 'login' && err.response?.status === 403) {
        setError('Account not verified. Please check your email or phone for the verification OTP.');
        setMode('verify');
      } else if (mode === 'login' && err.response?.status === 404) {
        setError(
          <div className="flex flex-col space-y-2">
            <span>No account found for this email.</span>
            <button type="button" onClick={() => setMode('register')} className="text-yellow-600 font-bold hover:underline text-left">
              Create a new account instead?
            </button>
          </div>
        );
      } else {
        setError(err.response?.data?.detail || err.message || 'An error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) {
      setError('Please enter your email first.');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await api.post('/auth/resend-verification', { email });
      setSuccess(response.msg);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to resend code.');
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

  const renderSelectField = (name, icon, value, setter, label, options) => {
    const Icon = icon;
    const hasError = fieldErrors[name];
    return (
      <div className="mb-4 text-left">
        <label className="block text-sm font-semibold text-gray-700 mb-2 ml-1">{label}</label>
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Icon className={`h-4 w-4 transition-colors ${hasError ? 'text-rose-400' : 'text-gray-400 group-focus-within:text-green-600'}`} />
          </div>
          <select
            name={name}
            required
            value={value}
            onChange={(e) => setter(e.target.value)}
            onBlur={handleBlur}
            className={`block w-full pl-11 pr-4 py-3 bg-white border rounded-xl outline-none transition-all text-gray-700 font-medium appearance-none shadow-sm
              ${hasError ? 'border-rose-300 focus:border-rose-500 bg-rose-50/30' : 'border-gray-200 focus:bg-white focus:border-green-600 focus:ring-1 focus:ring-green-600/20'}
              ${!value ? 'text-gray-300' : ''}
            `}
          >
            <option value="" disabled hidden>Select Department</option>
            {options.map(opt => (
              <option key={opt.value} value={opt.value} className="text-gray-700">{opt.label}</option>
            ))}
          </select>
          <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        {hasError && <p className="text-xs text-rose-500 font-medium mt-1.5 ml-1">{hasError}</p>}
      </div>
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
        <div className="bg-white/60 backdrop-blur-xl rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.15)] overflow-hidden border border-white/20">
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
                  {renderSelectField('department', Building, department, setDepartment, 'Department', [
                    { value: 'CAST', label: 'CAST' },
                    { value: 'CVMAS', label: 'CVMAS' },
                    { value: 'COED', label: 'COED' },
                    { value: 'CBMA', label: 'CBMA' }
                  ])}
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
                  <div className="text-center mt-2">
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={loading}
                      className="text-xs font-black text-green-700 hover:text-green-600 uppercase tracking-widest disabled:opacity-50"
                    >
                      Resend Verification Code
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
