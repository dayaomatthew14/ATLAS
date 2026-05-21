import React, { useState, useEffect, useRef } from 'react';
import { User, Mail, Shield, Building, Edit2, Save, X, Phone, Calendar, Camera, ChevronDown } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';

const getProfilePictureUrl = (path) => {
  if (!path) return '';
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl && apiUrl.startsWith('http')) {
    try {
      const url = new URL(apiUrl);
      return `${url.origin}${cleanPath}`;
    } catch (e) {
      console.error(e);
    }
  }
  return cleanPath;
};

export default function Profile() {
  const { addToast } = useToast();
  const [user, setUser] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({});
  const fileInputRef = useRef(null);
  
  useEffect(() => {
    fetchProfile();
  }, []);
  
  const fetchProfile = async () => {
    try {
      const response = await api.get('/auth/me');
      setUser(response);
      setFormData({
        first_name: response.first_name || '',
        last_name: response.last_name || '',
        contact_number: response.contact_number || '',
        sex: response.sex || '',
        date_of_birth: response.date_of_birth || ''
      });
      // Synchronize localStorage with fresh data
      localStorage.setItem('atlas_user_name', `${response.first_name || ''} ${response.last_name || ''}`.trim());
      if (response.profile_picture) {
        localStorage.setItem('atlas_profile_picture', response.profile_picture);
      } else {
        localStorage.removeItem('atlas_profile_picture');
      }
    } catch (e) {
      addToast('Failed to load profile', 'error');
    }
  };
  
  const handleSave = async () => {
    if (!formData.first_name || !formData.first_name.trim()) {
      addToast('First name is required', 'error');
      return;
    }
    const nameRegex = /^[A-Za-z\s.]+$/;
    if (!nameRegex.test(formData.first_name)) {
      addToast('First name can only contain letters, spaces, and periods', 'error');
      return;
    }

    if (!formData.last_name || !formData.last_name.trim()) {
      addToast('Last name is required', 'error');
      return;
    }
    if (!nameRegex.test(formData.last_name)) {
      addToast('Last name can only contain letters, spaces, and periods', 'error');
      return;
    }

    if (formData.contact_number) {
      const phoneRegex = /^(09\d{9}|\+639\d{9})$/;
      if (!phoneRegex.test(formData.contact_number)) {
        addToast('Contact number must be a valid PH mobile number (e.g., 09123456789)', 'error');
        return;
      }
    }

    try {
      const cleanData = { ...formData };
      if (cleanData.contact_number === '') cleanData.contact_number = null;
      if (cleanData.sex === '') cleanData.sex = null;
      if (cleanData.date_of_birth === '') cleanData.date_of_birth = null;

      await api.put(`/users/${user.id}`, cleanData);
      addToast('Profile updated successfully', 'success');
      
      // Update local storage name if it changed
      localStorage.setItem('atlas_user_name', `${cleanData.first_name} ${cleanData.last_name}`.trim());
      window.dispatchEvent(new Event('atlas_profile_updated'));
      
      setIsEditing(false);
      fetchProfile();
    } catch (e) {
      addToast('Failed to update profile', 'error');
    }
  };
  
  const handlePictureClick = () => {
    fileInputRef.current?.click();
  };
  
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const formDataObj = new FormData();
    formDataObj.append('file', file);
    
    try {
      const res = await api.post(`/users/${user.id}/upload-picture`, formDataObj);
      setUser(prev => ({...prev, profile_picture: res.url}));
      localStorage.setItem('atlas_profile_picture', res.url);
      window.dispatchEvent(new Event('atlas_profile_updated'));
      addToast('Profile picture updated', 'success');
    } catch (err) {
      addToast('Failed to upload picture', 'error');
    }
  };
  
  if (!user) return <div className="p-8 font-bold text-gray-500">Loading profile data...</div>;

  return (
    <div className="p-8 max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-green-900 tracking-tighter">My Profile</h1>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Manage and view your account credentials</p>
        </div>
        {!isEditing ? (
          <button onClick={() => setIsEditing(true)} className="flex items-center px-5 py-2.5 bg-green-100 text-green-700 rounded-xl font-bold hover:bg-green-200 active:scale-95 transition-all shadow-sm">
            <Edit2 className="w-4 h-4 mr-2" /> Edit Profile
          </button>
        ) : (
          <div className="flex gap-3">
            <button onClick={() => setIsEditing(false)} className="flex items-center px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 active:scale-95 transition-all shadow-sm">
              <X className="w-4 h-4 mr-2" /> Cancel
            </button>
            <button onClick={handleSave} className="flex items-center px-5 py-2.5 bg-green-700 text-white rounded-xl font-bold hover:bg-green-800 active:scale-95 transition-all shadow-sm shadow-green-700/20">
              <Save className="w-4 h-4 mr-2" /> Save Changes
            </button>
          </div>
        )}
      </div>
      
      <div className="bg-white rounded-[2.5rem] p-8 lg:p-12 shadow-xl border border-gray-100 flex flex-col lg:flex-row items-center lg:items-start gap-12 transition-all duration-300">
        <div className="relative group shrink-0 flex flex-col items-center">
          <div 
            onClick={isEditing ? handlePictureClick : undefined}
            className={`w-44 h-44 bg-green-50 rounded-full flex flex-col items-center justify-center border-4 border-white shadow-2xl overflow-hidden transition-all duration-300 ${isEditing ? 'cursor-pointer hover:ring-4 hover:ring-green-100 hover:scale-105' : ''}`}
          >
            {user.profile_picture ? (
              <img src={getProfilePictureUrl(user.profile_picture)} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <span className="text-6xl font-black text-green-700">{((user.first_name ? user.first_name[0] : '') + (user.last_name ? user.last_name[0] : '')).toUpperCase() || 'U'}</span>
            )}
            
            {isEditing && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 backdrop-blur-sm">
                <Camera className="w-8 h-8 text-white mb-2" />
                <span className="text-white text-[10px] font-black tracking-widest uppercase">Upload Photo</span>
              </div>
            )}
          </div>
          <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
          
          <div className="mt-6 text-center">
            <h3 className="text-xl font-black text-gray-800">{user.first_name} {user.last_name}</h3>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">{user.role.replace('_', ' ')}</p>
          </div>
        </div>
        
        <div className="flex-1 w-full space-y-8 min-w-0">
          <div>
            <h2 className="text-2xl font-black text-gray-800 mb-1">Personal Information</h2>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">
              {isEditing ? 'Update your personal details below.' : 'View your account details.'}
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">First Name</label>
              {isEditing ? (
                <input 
                  type="text" 
                  value={formData.first_name} 
                  onChange={e => setFormData({...formData, first_name: e.target.value})}
                  className="w-full p-4 bg-gray-50/50 border border-gray-200 rounded-2xl font-bold text-gray-800 focus:bg-white focus:ring-2 focus:ring-green-500/25 focus:border-green-600 transition-all outline-none shadow-sm"
                />
              ) : (
                <p className="p-4 font-bold text-gray-800 bg-gray-50/50 rounded-2xl border border-gray-100 truncate" title={user.first_name}>{user.first_name}</p>
              )}
            </div>
            
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Last Name</label>
              {isEditing ? (
                <input 
                  type="text" 
                  value={formData.last_name} 
                  onChange={e => setFormData({...formData, last_name: e.target.value})}
                  className="w-full p-4 bg-gray-50/50 border border-gray-200 rounded-2xl font-bold text-gray-800 focus:bg-white focus:ring-2 focus:ring-green-500/25 focus:border-green-600 transition-all outline-none shadow-sm"
                />
              ) : (
                <p className="p-4 font-bold text-gray-800 bg-gray-50/50 rounded-2xl border border-gray-100 truncate" title={user.last_name}>{user.last_name}</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Sex / Gender</label>
              {isEditing ? (
                <div className="relative">
                  <select 
                    value={formData.sex} 
                    onChange={e => setFormData({...formData, sex: e.target.value})}
                    className="w-full p-4 bg-gray-50/50 border border-gray-200 rounded-2xl font-bold text-gray-800 focus:bg-white focus:ring-2 focus:ring-green-500/25 focus:border-green-600 transition-all outline-none shadow-sm appearance-none cursor-pointer"
                  >
                    <option value="">Select...</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                  <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-gray-400">
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </div>
              ) : (
                <p className="p-4 font-bold text-gray-800 bg-gray-50/50 rounded-2xl border border-gray-100 flex items-center min-w-0">
                  <User className="w-5 h-5 mr-3 text-green-600/70 shrink-0" />
                  <span className="truncate">{user.sex || <span className="text-gray-400 font-medium">Not specified</span>}</span>
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Date of Birth</label>
              {isEditing ? (
                <input 
                  type="date" 
                  value={formData.date_of_birth} 
                  onChange={e => setFormData({...formData, date_of_birth: e.target.value})}
                  className="w-full p-4 bg-gray-50/50 border border-gray-200 rounded-2xl font-bold text-gray-800 focus:bg-white focus:ring-2 focus:ring-green-500/25 focus:border-green-600 transition-all outline-none shadow-sm"
                />
              ) : (
                <p className="p-4 font-bold text-gray-800 bg-gray-50/50 rounded-2xl border border-gray-100 flex items-center min-w-0">
                  <Calendar className="w-5 h-5 mr-3 text-green-600/70 shrink-0" />
                  <span className="truncate">{user.date_of_birth || <span className="text-gray-400 font-medium">Not specified</span>}</span>
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Contact Number</label>
              {isEditing ? (
                <input 
                  type="text" 
                  value={formData.contact_number} 
                  onChange={e => setFormData({...formData, contact_number: e.target.value})}
                  className="w-full p-4 bg-gray-50/50 border border-gray-200 rounded-2xl font-bold text-gray-800 focus:bg-white focus:ring-2 focus:ring-green-500/25 focus:border-green-600 transition-all outline-none shadow-sm"
                />
              ) : (
                <p className="p-4 font-bold text-gray-800 bg-gray-50/50 rounded-2xl border border-gray-100 flex items-center min-w-0">
                  <Phone className="w-5 h-5 mr-3 text-green-600/70 shrink-0" />
                  <span className="truncate">{user.contact_number || <span className="text-gray-400 font-medium">Not specified</span>}</span>
                </p>
              )}
            </div>
            
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">School Email Address</label>
              <p className="p-4 font-bold text-gray-500 bg-gray-100 rounded-2xl border border-transparent flex items-center cursor-not-allowed min-w-0" title={user.email}>
                <Mail className="w-5 h-5 mr-3 text-gray-400 shrink-0" />
                <span className="truncate">{user.email}</span>
              </p>
            </div>
          </div>
          
          <div className="pt-8 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-6 w-full">
            <div className="flex items-center p-5 bg-green-50/70 rounded-[2rem] border border-green-100 shadow-sm min-w-0">
              <div className="p-3.5 bg-white rounded-2xl mr-4 shadow-sm border border-green-50/50 shrink-0">
                <Building className="w-6 h-6 text-green-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black text-green-600/70 uppercase tracking-widest mb-1 truncate">Department</p>
                <p className="text-lg font-black text-green-900 leading-tight truncate" title={user.department}>{user.department || 'N/A'}</p>
              </div>
            </div>
            
            <div className="flex items-center p-5 bg-blue-50/70 rounded-[2rem] border border-blue-100 shadow-sm min-w-0">
              <div className="p-3.5 bg-white rounded-2xl mr-4 shadow-sm border border-blue-50/50 shrink-0">
                <Shield className="w-6 h-6 text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black text-blue-600/70 uppercase tracking-widest mb-1 truncate">Access Level</p>
                <p className="text-lg font-black text-blue-900 capitalize leading-tight truncate" title={user.role}>{user.role.replace('_', ' ')}</p>
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}

