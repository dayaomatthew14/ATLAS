import React, { useState, useEffect, useRef } from 'react';
import { 
  Bell, Lock, Palette, ChevronLeft, Save, Shield, Eye, EyeOff, 
  Check, AlertCircle, ArrowLeft, Loader2, Sliders, KeyRound,
  Home, Calendar, Layers, LayoutDashboard
} from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';
import { ConfirmDialog } from '../../components/ui/Dialog';

// Keep in sync with MIN_PASSWORD_LENGTH in backend/app/schemas.py
const MIN_PASSWORD_LENGTH = 12;

export default function Settings() {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState('list'); // 'list', 'notifications', 'security', 'appearance', 'preferences'
  const [isLoading, setIsLoading] = useState(false);
  const [isLogoutAllOpen, setIsLogoutAllOpen] = useState(false);

  // --- Notifications Preferences State ---
  const [notifPreferences, setNotifPreferences] = useState({
    emailSchedules: localStorage.getItem('atlas_notif_email_schedules') !== 'false',
    emailMaintenance: localStorage.getItem('atlas_notif_email_maintenance') === 'true',
    emailConflicts: localStorage.getItem('atlas_notif_email_conflicts') !== 'false',
    smsUrgent: localStorage.getItem('atlas_notif_sms_urgent') !== 'false',
    smsOtp: localStorage.getItem('atlas_notif_sms_otp') !== 'false',
  });

  // --- Security & Password State ---
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [securityQuestion, setSecurityQuestion] = useState(
    localStorage.getItem('atlas_security_question') || 'What was the name of your first school?'
  );
  const [securityAnswer, setSecurityAnswer] = useState(
    localStorage.getItem('atlas_security_answer') || ''
  );

  // --- Appearance State ---
  const [theme, setTheme] = useState(localStorage.getItem('atlas_settings_theme') || 'green');
  const [fontSize, setFontSize] = useState(localStorage.getItem('atlas_settings_font_size') || 'normal');

  // Keep track of whether settings have been saved permanently
  const isSavedRef = useRef(false);

  // --- Workspace Preferences State (Usable and Easy to Understand) ---
  const [landingPage, setLandingPage] = useState(
    localStorage.getItem('atlas_pref_landing_view') || '/dashboard'
  );
  const [safetyConfirmations, setSafetyConfirmations] = useState(
    localStorage.getItem('atlas_pref_safety_confirm') !== 'false'
  );
  const [sessionTimeout, setSessionTimeout] = useState(
    localStorage.getItem('atlas_pref_session_timeout') || '8h'
  );
  const [defaultScheduleLayout, setDefaultScheduleLayout] = useState(
    localStorage.getItem('atlas_pref_schedule_layout') || 'week'
  );
  const [layoutDensity, setLayoutDensity] = useState(
    localStorage.getItem('atlas_pref_layout_density') || 'comfortable'
  );
  const [startDayOfWeek, setStartDayOfWeek] = useState(
    localStorage.getItem('atlas_pref_start_day') || 'monday'
  );

  // Apply Appearance Theme & Font Size locally (Live Interactive Preview)
  useEffect(() => {
    // 1. Theme handler (Apply data-theme attribute on root html)
    document.documentElement.setAttribute('data-theme', theme);

    // 2. Font size handler
    const root = document.documentElement;
    if (fontSize === 'small') {
      root.style.fontSize = '14px';
    } else if (fontSize === 'large') {
      root.style.fontSize = '18px';
    } else {
      root.style.fontSize = '16px'; // normal
    }
  }, [theme, fontSize]);

  // Revert unsaved settings on unmount if user navigates away without saving
  useEffect(() => {
    return () => {
      if (!isSavedRef.current) {
        const savedTheme = localStorage.getItem('atlas_settings_theme') || 'green';
        const savedFontSize = localStorage.getItem('atlas_settings_font_size') || 'normal';
        
        document.documentElement.setAttribute('data-theme', savedTheme);
        const root = document.documentElement;
        if (savedFontSize === 'small') {
          root.style.fontSize = '14px';
        } else if (savedFontSize === 'large') {
          root.style.fontSize = '18px';
        } else {
          root.style.fontSize = '16px';
        }
      }
    };
  }, []);

  // Handle Appearance Permanent Save (Keep Appearance)
  const handleSaveAppearance = () => {
    setIsLoading(true);
    setTimeout(() => {
      localStorage.setItem('atlas_settings_theme', theme);
      localStorage.setItem('atlas_settings_font_size', fontSize);
      isSavedRef.current = true;
      
      // Dispatch custom event to notify other parts of the React hierarchy
      window.dispatchEvent(new Event('atlas_theme_changed'));
      
      setIsLoading(false);
      addToast('Appearance saved and active!', 'success');
    }, 400);
  };

  // Handle Notifications Preferences Save
  const handleSaveNotifications = () => {
    setIsLoading(true);
    setTimeout(() => {
      Object.entries(notifPreferences).forEach(([key, val]) => {
        // Map keys to local storage names
        const dbKey = `atlas_notif_${key.replace(/([A-Z])/g, '_$1').toLowerCase()}`;
        localStorage.setItem(dbKey, String(val));
      });
      setIsLoading(false);
      addToast('Notification preferences updated successfully', 'success');
    }, 600);
  };

  // Handle Change Password API Call
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!oldPassword || !newPassword || !confirmPassword) {
      addToast('Please fill in all password fields', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      addToast('New passwords do not match', 'error');
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      addToast(`New password must be at least ${MIN_PASSWORD_LENGTH} characters long`, 'error');
      return;
    }
    if (newPassword !== newPassword.trim()) {
      addToast('New password cannot start or end with a space', 'error');
      return;
    }

    setIsLoading(true);
    try {
      await api.post('/users/change-password', {
        old_password: oldPassword,
        new_password: newPassword
      });
      addToast('Password updated successfully', 'success');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      const errMsg = err.response?.data?.detail || 'Incorrect current password or failed to update password';
      addToast(errMsg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Save Security Questions
  const handleSaveSecurityQuestion = () => {
    if (!securityAnswer.trim()) {
      addToast('Please provide an answer to your security question', 'error');
      return;
    }
    localStorage.setItem('atlas_security_question', securityQuestion);
    localStorage.setItem('atlas_security_answer', securityAnswer.trim());
    addToast('Security recovery question saved successfully', 'success');
  };

  // Session Logout of All Devices
  const handleLogoutAllDevices = () => setIsLogoutAllOpen(true);

  const confirmLogoutAllDevices = async () => {
    setIsLoading(true);
    try {
      await api.post('/auth/logout-all', {});
      addToast('Signed out on all other devices.', 'success');
      setIsLogoutAllOpen(false);
    } catch (err) {
      addToast(err.message || 'Could not end the other sessions.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Save Workspace Preferences
  const handleSaveWorkspacePrefs = () => {
    setIsLoading(true);
    setTimeout(() => {
      localStorage.setItem('atlas_pref_landing_view', landingPage);
      localStorage.setItem('atlas_pref_safety_confirm', String(safetyConfirmations));
      localStorage.setItem('atlas_pref_session_timeout', sessionTimeout);
      localStorage.setItem('atlas_pref_schedule_layout', defaultScheduleLayout);
      localStorage.setItem('atlas_pref_layout_density', layoutDensity);
      localStorage.setItem('atlas_pref_start_day', startDayOfWeek);
      setIsLoading(false);
      addToast('Workspace preferences saved successfully!', 'success');
    }, 500);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* HEADER SECTION */}
      <div className="flex items-center gap-4 mb-8">
        {activeTab !== 'list' && (
          <button 
            type="button"
            onClick={() => setActiveTab('list')}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl active:scale-95 transition-all shadow-sm shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div>
          <h1 className="text-3xl font-black text-green-900 tracking-tighter">
            {activeTab === 'list' && 'Settings'}
            {activeTab === 'notifications' && 'Notification Settings'}
            {activeTab === 'security' && 'Security & Password'}
            {activeTab === 'appearance' && 'Appearance Customization'}
            {activeTab === 'preferences' && 'Workspace Preferences'}
          </h1>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">
            {activeTab === 'list' && 'Configure and personalize your scheduler workspace'}
            {activeTab === 'notifications' && 'Manage your email and SMS notification alerts'}
            {activeTab === 'security' && 'Manage credentials, security recovery, and sessions'}
            {activeTab === 'appearance' && 'Customize theme modes, contrast, and font styling'}
            {activeTab === 'preferences' && 'Configure landing views, safety confirmations, and session timeouts'}
          </p>
        </div>
      </div>

      {/* 1. MAIN LIST VIEW */}
      {activeTab === 'list' && (
        <div className="grid grid-cols-1 gap-6">
          <div className="bg-white rounded-[2rem] shadow-xl border border-gray-100 overflow-hidden divide-y divide-gray-100">
            
            {/* Notifications Tab Row */}
            <div 
              onClick={() => setActiveTab('notifications')}
              className="p-6 sm:p-8 flex items-center justify-between hover:bg-slate-50/50 transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-5">
                <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl group-hover:scale-110 transition-transform duration-300">
                  <Bell className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-black text-gray-800 text-lg">Notifications</h3>
                  <p className="text-sm text-gray-500 font-medium mt-0.5">Manage email and push notification preferences</p>
                </div>
              </div>
              <ChevronLeft className="w-5 h-5 text-gray-400 rotate-180 group-hover:translate-x-1 transition-transform" />
            </div>
            
            {/* Security Tab Row */}
            <div 
              onClick={() => setActiveTab('security')}
              className="p-6 sm:p-8 flex items-center justify-between hover:bg-slate-50/50 transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-5">
                <div className="p-4 bg-rose-50 text-rose-600 rounded-2xl group-hover:scale-110 transition-transform duration-300">
                  <Lock className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-black text-gray-800 text-lg">Security & Password</h3>
                  <p className="text-sm text-gray-500 font-medium mt-0.5">Update your password, security questions, and sessions</p>
                </div>
              </div>
              <ChevronLeft className="w-5 h-5 text-gray-400 rotate-180 group-hover:translate-x-1 transition-transform" />
            </div>

            {/* Appearance Tab Row */}
            <div 
              onClick={() => setActiveTab('appearance')}
              className="p-6 sm:p-8 flex items-center justify-between hover:bg-slate-50/50 transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-5">
                <div className="p-4 bg-purple-50 text-purple-600 rounded-2xl group-hover:scale-110 transition-transform duration-300">
                  <Palette className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-black text-gray-800 text-lg">Appearance</h3>
                  <p className="text-sm text-gray-500 font-medium mt-0.5">Customize dashboard theme colors and font sizing</p>
                </div>
              </div>
              <ChevronLeft className="w-5 h-5 text-gray-400 rotate-180 group-hover:translate-x-1 transition-transform" />
            </div>

            {/* Workspace Preferences Tab Row */}
            <div 
              onClick={() => setActiveTab('preferences')}
              className="p-6 sm:p-8 flex items-center justify-between hover:bg-slate-50/50 transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-5">
                <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:scale-110 transition-transform duration-300">
                  <Sliders className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-black text-gray-800 text-lg">Workspace Preferences</h3>
                  <p className="text-sm text-gray-500 font-medium mt-0.5">Customize default views, session timeouts, and safety warnings</p>
                </div>
              </div>
              <ChevronLeft className="w-5 h-5 text-gray-400 rotate-180 group-hover:translate-x-1 transition-transform" />
            </div>

          </div>
        </div>
      )}

      {/* 2. NOTIFICATIONS DETAIL VIEW */}
      {activeTab === 'notifications' && (
        <div className="bg-white rounded-[2rem] shadow-xl border border-gray-100 p-8 space-y-8 animate-in fade-in duration-300">
          <div>
            <h2 className="text-xl font-black text-gray-800 mb-2">Notification Options</h2>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Configure exactly when and how you want to be contacted.</p>
          </div>

          <div className="space-y-6">
            <h3 className="text-xs font-black text-blue-600 uppercase tracking-widest border-b border-gray-100 pb-2">Email Notifications</h3>
            
            <label className="flex items-center justify-between p-4 bg-slate-50/30 hover:bg-slate-50/70 border border-slate-100 rounded-2xl cursor-pointer transition-colors">
              <div>
                <p className="font-bold text-gray-800 text-sm">Schedules Published</p>
                <p className="text-xs text-gray-500 mt-0.5">Receive email when new semester curriculum flowcharts are active</p>
              </div>
              <input 
                type="checkbox" 
                checked={notifPreferences.emailSchedules}
                onChange={e => setNotifPreferences({...notifPreferences, emailSchedules: e.target.checked})}
                className="w-5 h-5 rounded text-green-700 focus:ring-green-500 border-gray-300 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between p-4 bg-slate-50/30 hover:bg-slate-50/70 border border-slate-100 rounded-2xl cursor-pointer transition-colors">
              <div>
                <p className="font-bold text-gray-800 text-sm">Conflict Warnings</p>
                <p className="text-xs text-gray-500 mt-0.5">Get notified about overlapping rooms or double-booked instructors</p>
              </div>
              <input 
                type="checkbox" 
                checked={notifPreferences.emailConflicts}
                onChange={e => setNotifPreferences({...notifPreferences, emailConflicts: e.target.checked})}
                className="w-5 h-5 rounded text-green-700 focus:ring-green-500 border-gray-300 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between p-4 bg-slate-50/30 hover:bg-slate-50/70 border border-slate-100 rounded-2xl cursor-pointer transition-colors">
              <div>
                <p className="font-bold text-gray-800 text-sm">System Maintenance Alerts</p>
                <p className="text-xs text-gray-500 mt-0.5">Receive warnings about planned scheduling server updates</p>
              </div>
              <input 
                type="checkbox" 
                checked={notifPreferences.emailMaintenance}
                onChange={e => setNotifPreferences({...notifPreferences, emailMaintenance: e.target.checked})}
                className="w-5 h-5 rounded text-green-700 focus:ring-green-500 border-gray-300 cursor-pointer"
              />
            </label>
          </div>

          <div className="space-y-6 pt-4">
            <h3 className="text-xs font-black text-rose-600 uppercase tracking-widest border-b border-gray-100 pb-2">SMS & Alert Notifications</h3>
            
            <label className="flex items-center justify-between p-4 bg-slate-50/30 hover:bg-slate-50/70 border border-slate-100 rounded-2xl cursor-pointer transition-colors">
              <div>
                <p className="font-bold text-gray-800 text-sm">Urgent Schedule Alerts</p>
                <p className="text-xs text-gray-500 mt-0.5">Send urgent change text messages to my registered mobile phone</p>
              </div>
              <input 
                type="checkbox" 
                checked={notifPreferences.smsUrgent}
                onChange={e => setNotifPreferences({...notifPreferences, smsUrgent: e.target.checked})}
                className="w-5 h-5 rounded text-green-700 focus:ring-green-500 border-gray-300 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between p-4 bg-slate-50/30 hover:bg-slate-50/70 border border-slate-100 rounded-2xl cursor-pointer transition-colors">
              <div>
                <p className="font-bold text-gray-800 text-sm">OTP Security Verification</p>
                <p className="text-xs text-gray-500 mt-0.5">Receive verification login PIN codes via text message</p>
              </div>
              <input 
                type="checkbox" 
                checked={notifPreferences.smsOtp}
                onChange={e => setNotifPreferences({...notifPreferences, smsOtp: e.target.checked})}
                className="w-5 h-5 rounded text-green-700 focus:ring-green-500 border-gray-300 cursor-pointer"
              />
            </label>
          </div>

          <div className="flex justify-end pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={handleSaveNotifications}
              disabled={isLoading}
              className="flex items-center px-6 py-3 bg-green-700 hover:bg-green-800 text-white font-bold rounded-2xl shadow-md active:scale-95 transition-all disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
              Save Notification Preferences
            </button>
          </div>
        </div>
      )}

      {/* 3. SECURITY & PASSWORD DETAIL VIEW */}
      {activeTab === 'security' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          
          {/* PASSWORD RESET FORM */}
          <form onSubmit={handleChangePassword} className="bg-white rounded-[2rem] shadow-xl border border-gray-100 p-8 space-y-6">
            <div>
              <h2 className="text-xl font-black text-gray-800 mb-2">Change Password</h2>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Update and secure your login password details.</p>
            </div>

            <div className="grid grid-cols-1 gap-5">
              
              {/* Old Password */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Current Password</label>
                <div className="relative">
                  <input 
                    type={showOldPassword ? "text" : "password"} 
                    value={oldPassword} 
                    onChange={e => setOldPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full p-4 bg-gray-50/50 border border-gray-200 rounded-2xl font-bold text-gray-800 focus:bg-white focus:ring-2 focus:ring-green-500/25 focus:border-green-600 transition-all outline-none"
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowOldPassword(!showOldPassword)}
                    className="absolute inset-y-0 right-4 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    {showOldPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">New Password</label>
                <div className="relative">
                  <input 
                    type={showNewPassword ? "text" : "password"} 
                    value={newPassword} 
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Enter new password (min. 6 chars)"
                    className="w-full p-4 bg-gray-50/50 border border-gray-200 rounded-2xl font-bold text-gray-800 focus:bg-white focus:ring-2 focus:ring-green-500/25 focus:border-green-600 transition-all outline-none"
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute inset-y-0 right-4 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Confirm New Password</label>
                <div className="relative">
                  <input 
                    type={showConfirmPassword ? "text" : "password"} 
                    value={confirmPassword} 
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your new password"
                    className="w-full p-4 bg-gray-50/50 border border-gray-200 rounded-2xl font-bold text-gray-800 focus:bg-white focus:ring-2 focus:ring-green-500/25 focus:border-green-600 transition-all outline-none"
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-4 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

            </div>

            <div className="flex justify-end pt-4 border-t border-gray-100">
              <button
                type="submit"
                disabled={isLoading}
                className="flex items-center px-6 py-3 bg-green-700 hover:bg-green-800 text-white font-bold rounded-2xl shadow-md active:scale-95 transition-all disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
                Change Password
              </button>
            </div>
          </form>

          {/* SECURITY RECOVERY QUESTIONS */}
          <div className="bg-white rounded-[2rem] shadow-xl border border-gray-100 p-8 space-y-6">
            <div>
              <h2 className="text-xl font-black text-gray-800 mb-2">Security Questions</h2>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Set a challenge question to recover password access securely.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Select Security Question</label>
                <select 
                  value={securityQuestion}
                  onChange={e => setSecurityQuestion(e.target.value)}
                  className="w-full p-4 bg-gray-50/50 border border-gray-200 rounded-2xl font-bold text-gray-800 focus:bg-white focus:ring-2 focus:ring-green-500/25 focus:border-green-600 transition-all outline-none cursor-pointer"
                >
                  <option value="What was the name of your first school?">What was the name of your first school?</option>
                  <option value="In what city did your parents meet?">In what city did your parents meet?</option>
                  <option value="What was the model of your first car?">What was the model of your first car?</option>
                  <option value="What is the middle name of your oldest sibling?">What is the middle name of your oldest sibling?</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Security Question Answer</label>
                <input 
                  type="text"
                  value={securityAnswer}
                  onChange={e => setSecurityAnswer(e.target.value)}
                  placeholder="Provide answer details"
                  className="w-full p-4 bg-gray-50/50 border border-gray-200 rounded-2xl font-bold text-gray-800 focus:bg-white focus:ring-2 focus:ring-green-500/25 focus:border-green-600 transition-all outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={handleSaveSecurityQuestion}
                className="flex items-center px-6 py-3 bg-green-700 hover:bg-green-800 text-white font-bold rounded-2xl shadow-md active:scale-95 transition-all"
              >
                <Save className="w-5 h-5 mr-2" />
                Save Security Question
              </button>
            </div>
          </div>

          {/* ACTIVE SESSIONS / LOGOUT ALL */}
          <div className="bg-rose-50/50 rounded-[2rem] border border-rose-100 p-8 space-y-6">
            <div>
              <h2 className="text-xl font-black text-rose-900 mb-2">Emergency Device Access</h2>
              <p className="text-xs text-rose-800/60 font-bold uppercase tracking-wider">Log out of all other active sessions and reset authentication keys.</p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="flex items-start gap-4">
                <div className="p-3.5 bg-white text-rose-600 rounded-2xl shadow-sm border border-rose-100 shrink-0">
                  <Shield className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800">Log Out of Other Sessions</h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-md">This terminates all active login cookies on other laptops, browsers, or mobile devices instantly. Highly recommended if your account was accessed on a public machine.</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleLogoutAllDevices}
                disabled={isLoading}
                className="flex items-center justify-center px-6 py-3.5 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-2xl active:scale-95 transition-all shadow-md shrink-0 animate-pulse hover:animate-none"
              >
                <KeyRound className="w-5 h-5 mr-2" />
                Logout All Other Devices
              </button>
            </div>
          </div>

        </div>
      )}

      {/* 4. APPEARANCE DETAIL VIEW */}
      {activeTab === 'appearance' && (
        <div className="bg-white rounded-[2rem] shadow-xl border border-gray-100 p-8 space-y-8 animate-in fade-in duration-300">
          <div>
            <h2 className="text-xl font-black text-gray-800 mb-2">Workspace Theme Customizer</h2>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Tweak color configurations and scaling to fit your preferences.</p>
          </div>

          {/* COLOR THEME SELECTOR */}
          <div className="space-y-4">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Color Theme</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              
              {/* Green Theme */}
              <button 
                type="button"
                onClick={() => setTheme('green')}
                className={`p-5 rounded-2xl border text-left flex flex-col justify-between h-28 active:scale-95 transition-all ${theme === 'green' ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-500/25' : 'border-gray-200 hover:bg-gray-50'}`}
              >
                <div className="w-6 h-6 rounded-full bg-emerald-700 flex items-center justify-center">
                  {theme === 'green' && <Check className="w-3.5 h-3.5 text-white" />}
                </div>
                <span className="font-bold text-gray-800 text-sm">DLSAU Green</span>
              </button>

              {/* Dark Theme */}
              <button 
                type="button"
                onClick={() => setTheme('dark')}
                className={`p-5 rounded-2xl border text-left flex flex-col justify-between h-28 active:scale-95 transition-all ${theme === 'dark' ? 'border-slate-800 bg-slate-50 ring-2 ring-slate-500/25' : 'border-gray-200 hover:bg-gray-50'}`}
              >
                <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center">
                  {theme === 'dark' && <Check className="w-3.5 h-3.5 text-white" />}
                </div>
                <span className="font-bold text-gray-800 text-sm">Sleek Slate</span>
              </button>

              {/* Ocean Blue */}
              <button 
                type="button"
                onClick={() => setTheme('blue')}
                className={`p-5 rounded-2xl border text-left flex flex-col justify-between h-28 active:scale-95 transition-all ${theme === 'blue' ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-500/25' : 'border-gray-200 hover:bg-gray-50'}`}
              >
                <div className="w-6 h-6 rounded-full bg-blue-700 flex items-center justify-center">
                  {theme === 'blue' && <Check className="w-3.5 h-3.5 text-white" />}
                </div>
                <span className="font-bold text-gray-800 text-sm">Ocean Blue</span>
              </button>

              {/* Purple Amethyst */}
              <button 
                type="button"
                onClick={() => setTheme('purple')}
                className={`p-5 rounded-2xl border text-left flex flex-col justify-between h-28 active:scale-95 transition-all ${theme === 'purple' ? 'border-purple-600 bg-purple-50/50 ring-2 ring-purple-500/25' : 'border-gray-200 hover:bg-gray-50'}`}
              >
                <div className="w-6 h-6 rounded-full bg-purple-700 flex items-center justify-center">
                  {theme === 'purple' && <Check className="w-3.5 h-3.5 text-white" />}
                </div>
                <span className="font-bold text-gray-800 text-sm">Amethyst</span>
              </button>

            </div>
          </div>

          {/* FONT SCALE */}
          <div className="space-y-4">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Scaling & Font Size</label>
            <div className="grid grid-cols-3 gap-4">
              
              <button 
                type="button"
                onClick={() => setFontSize('small')}
                className={`p-4 rounded-2xl border font-bold text-sm active:scale-95 transition-all ${fontSize === 'small' ? 'border-green-600 bg-green-50/40 text-green-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
              >
                Small (14px)
              </button>

              <button 
                type="button"
                onClick={() => setFontSize('normal')}
                className={`p-4 rounded-2xl border font-bold text-sm active:scale-95 transition-all ${fontSize === 'normal' ? 'border-green-600 bg-green-50/40 text-green-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
              >
                Normal (16px)
              </button>

              <button 
                type="button"
                onClick={() => setFontSize('large')}
                className={`p-4 rounded-2xl border font-bold text-sm active:scale-95 transition-all ${fontSize === 'large' ? 'border-green-600 bg-green-50/40 text-green-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
              >
                Large (18px)
              </button>

            </div>
          </div>

          {/* VISUAL THEME PREVIEW */}
          <div className="space-y-4 pt-4 border-t border-gray-100">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Preview</label>
            
            <div className="p-6 bg-slate-50 rounded-3xl border border-gray-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Card Interface Preview</p>
                <h4 className="text-lg font-black text-slate-800 mt-1">ATLAS Premium Dashboard</h4>
                <p className="text-xs text-slate-500 font-medium">This shows a quick preview of your layout font scaling and configuration.</p>
              </div>

              <div className="flex gap-2">
                <span className={`px-4 py-2 text-xs font-bold rounded-xl text-white shadow-sm ${theme === 'green' ? 'bg-green-700 shadow-green-700/20' : theme === 'dark' ? 'bg-slate-800 shadow-slate-800/20' : theme === 'blue' ? 'bg-blue-700 shadow-blue-700/20' : 'bg-purple-700 shadow-purple-700/20'}`}>
                  Primary Button
                </span>
                <span className="px-4 py-2 text-xs font-bold rounded-xl bg-white border border-gray-200 text-gray-700 shadow-sm">
                  Secondary
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={handleSaveAppearance}
              className="flex items-center px-6 py-3 bg-green-700 hover:bg-green-800 text-white font-bold rounded-2xl shadow-md active:scale-95 transition-all"
            >
              {isLoading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Check className="w-5 h-5 mr-2" />}
              Keep Appearance
            </button>
          </div>
        </div>
      )}

      {/* 5. WORKSPACE PREFERENCES VIEW */}
      {activeTab === 'preferences' && (
        <div className="bg-white rounded-[2rem] shadow-xl border border-gray-100 p-8 space-y-8 animate-in fade-in duration-300">
          <div>
            <h2 className="text-xl font-black text-gray-800 mb-2">Workspace Preferences</h2>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Configure your default landing screen, view layouts, actions, density and custom rules.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Startup Landing Screen Selection */}
            <div className="space-y-3 col-span-1 md:col-span-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Startup Landing Page</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <button
                  type="button"
                  onClick={() => setLandingPage('/dashboard')}
                  className={`p-5 rounded-2xl border font-bold text-left flex items-start gap-4 active:scale-[0.98] transition-all ${landingPage === '/dashboard' ? 'border-green-600 bg-green-50/40 text-green-900 shadow-sm' : 'border-gray-200 text-gray-700 hover:bg-gray-50 bg-white'}`}
                >
                  <div className={`p-2.5 rounded-xl ${landingPage === '/dashboard' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                    <LayoutDashboard className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm">Dashboard Home</h4>
                    <p className="text-[10px] text-gray-400 font-medium mt-0.5">Quick summaries & activities</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setLandingPage('/dashboard/timetable')}
                  className={`p-5 rounded-2xl border font-bold text-left flex items-start gap-4 active:scale-[0.98] transition-all ${landingPage === '/dashboard/timetable' ? 'border-green-600 bg-green-50/40 text-green-900 shadow-sm' : 'border-gray-200 text-gray-700 hover:bg-gray-50 bg-white'}`}
                >
                  <div className={`p-2.5 rounded-xl ${landingPage === '/dashboard/timetable' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm">Timetables</h4>
                    <p className="text-[10px] text-gray-400 font-medium mt-0.5">Active schedule manager</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setLandingPage('/dashboard/flowcharts')}
                  className={`p-5 rounded-2xl border font-bold text-left flex items-start gap-4 active:scale-[0.98] transition-all ${landingPage === '/dashboard/flowcharts' ? 'border-green-600 bg-green-50/40 text-green-900 shadow-sm' : 'border-gray-200 text-gray-700 hover:bg-gray-50 bg-white'}`}
                >
                  <div className={`p-2.5 rounded-xl ${landingPage === '/dashboard/flowcharts' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm">Flowcharts</h4>
                    <p className="text-[10px] text-gray-400 font-medium mt-0.5">Curriculum progression maps</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Default Calendar Grid View */}
            <div className="space-y-3">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Default Schedule Layout</label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setDefaultScheduleLayout('week')}
                  className={`p-4 rounded-2xl border font-bold text-sm active:scale-95 transition-all ${defaultScheduleLayout === 'week' ? 'border-green-600 bg-green-50/40 text-green-800 font-extrabold shadow-sm' : 'border-gray-200 text-gray-700 hover:bg-gray-50 bg-white'}`}
                >
                  Weekly Calendar
                </button>
                <button
                  type="button"
                  onClick={() => setDefaultScheduleLayout('day')}
                  className={`p-4 rounded-2xl border font-bold text-sm active:scale-95 transition-all ${defaultScheduleLayout === 'day' ? 'border-green-600 bg-green-50/40 text-green-800 font-extrabold shadow-sm' : 'border-gray-200 text-gray-700 hover:bg-gray-50 bg-white'}`}
                >
                  Daily Timeline
                </button>
              </div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide ml-1">Sets the initial time-grid view when loading scheduling boards.</p>
            </div>

            {/* Action Safety Confirmations */}
            <div className="space-y-3">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Delete & Action Warnings</label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setSafetyConfirmations(true)}
                  className={`p-4 rounded-2xl border font-bold text-sm active:scale-95 transition-all ${safetyConfirmations === true ? 'border-green-600 bg-green-50/40 text-green-800 font-extrabold shadow-sm' : 'border-gray-200 text-gray-700 hover:bg-gray-50 bg-white'}`}
                >
                  Safe Mode (Confirm)
                </button>
                <button
                  type="button"
                  onClick={() => setSafetyConfirmations(false)}
                  className={`p-4 rounded-2xl border font-bold text-sm active:scale-95 transition-all ${safetyConfirmations === false ? 'border-green-600 bg-green-50/40 text-green-800 font-extrabold shadow-sm' : 'border-gray-200 text-gray-700 hover:bg-gray-50 bg-white'}`}
                >
                  Direct Mode (Fast)
                </button>
              </div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide ml-1">Require confirmations before destructive actions (deletions, clears).</p>
            </div>

            {/* Auto-Logout Timeout Options */}
            <div className="space-y-3">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Auto-Logout Security Timeout</label>
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setSessionTimeout('15m')}
                  className={`py-3.5 px-2 rounded-xl border font-bold text-xs active:scale-95 transition-all ${sessionTimeout === '15m' ? 'border-green-600 bg-green-50/40 text-green-800 font-extrabold shadow-sm' : 'border-gray-200 text-gray-700 hover:bg-gray-50 bg-white'}`}
                >
                  15 Min
                </button>
                <button
                  type="button"
                  onClick={() => setSessionTimeout('2h')}
                  className={`py-3.5 px-2 rounded-xl border font-bold text-xs active:scale-95 transition-all ${sessionTimeout === '2h' ? 'border-green-600 bg-green-50/40 text-green-800 font-extrabold shadow-sm' : 'border-gray-200 text-gray-700 hover:bg-gray-50 bg-white'}`}
                >
                  2 Hours
                </button>
                <button
                  type="button"
                  onClick={() => setSessionTimeout('8h')}
                  className={`py-3.5 px-2 rounded-xl border font-bold text-xs active:scale-95 transition-all ${sessionTimeout === '8h' ? 'border-green-600 bg-green-50/40 text-green-800 font-extrabold shadow-sm' : 'border-gray-200 text-gray-700 hover:bg-gray-50 bg-white'}`}
                >
                  8 Hours
                </button>
                <button
                  type="button"
                  onClick={() => setSessionTimeout('never')}
                  className={`py-3.5 px-2 rounded-xl border font-bold text-xs active:scale-95 transition-all ${sessionTimeout === 'never' ? 'border-green-600 bg-green-50/40 text-green-800 font-extrabold shadow-sm' : 'border-gray-200 text-gray-700 hover:bg-gray-50 bg-white'}`}
                >
                  Never
                </button>
              </div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide ml-1">Automatically logs out and locks the app during user inactivity.</p>
            </div>

            {/* SUGGESTED: Workspace Density */}
            <div className="space-y-3">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Workspace Table Density</label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setLayoutDensity('comfortable')}
                  className={`p-4 rounded-2xl border font-bold text-sm active:scale-95 transition-all ${layoutDensity === 'comfortable' ? 'border-green-600 bg-green-50/40 text-green-800 font-extrabold shadow-sm' : 'border-gray-200 text-gray-700 hover:bg-gray-50 bg-white'}`}
                >
                  Comfortable
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutDensity('compact')}
                  className={`p-4 rounded-2xl border font-bold text-sm active:scale-95 transition-all ${layoutDensity === 'compact' ? 'border-green-600 bg-green-50/40 text-green-800 font-extrabold shadow-sm' : 'border-gray-200 text-gray-700 hover:bg-gray-50 bg-white'}`}
                >
                  Compact Grid
                </button>
              </div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide ml-1">Adjust spacing and size padding across schedules and course lists.</p>
            </div>

            {/* SUGGESTED: Calendar Start Day */}
            <div className="space-y-3">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Start Day of Week</label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setStartDayOfWeek('monday')}
                  className={`p-4 rounded-2xl border font-bold text-sm active:scale-95 transition-all ${startDayOfWeek === 'monday' ? 'border-green-600 bg-green-50/40 text-green-800 font-extrabold shadow-sm' : 'border-gray-200 text-gray-700 hover:bg-gray-50 bg-white'}`}
                >
                  Monday Start
                </button>
                <button
                  type="button"
                  onClick={() => setStartDayOfWeek('sunday')}
                  className={`p-4 rounded-2xl border font-bold text-sm active:scale-95 transition-all ${startDayOfWeek === 'sunday' ? 'border-green-600 bg-green-50/40 text-green-800 font-extrabold shadow-sm' : 'border-gray-200 text-gray-700 hover:bg-gray-50 bg-white'}`}
                >
                  Sunday Start
                </button>
              </div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide ml-1">Determines the first column position rendered on calendars.</p>
            </div>

          </div>

          <div className="flex justify-end pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={handleSaveWorkspacePrefs}
              disabled={isLoading}
              className="flex items-center px-6 py-3 bg-green-700 hover:bg-green-800 text-white font-bold rounded-2xl shadow-md active:scale-95 transition-all disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
              Save Preferences
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={isLogoutAllOpen}
        onClose={() => setIsLogoutAllOpen(false)}
        onConfirm={confirmLogoutAllDevices}
        title="Sign out on all other devices?"
        description="Anyone signed in as you elsewhere will be signed out. This device stays signed in."
        confirmLabel="Sign Out Everywhere"
        destructive
        loading={isLoading}
      />
    </div>
  );
}
