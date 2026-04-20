import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { LogIn, Key, User, ArrowLeft, UserPlus } from 'lucide-react';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (isLogin) {
        const formData = new URLSearchParams();
        formData.append('username', email);
        formData.append('password', password);

        const response = await axios.post('http://localhost:8000/api/auth/login', formData, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        localStorage.setItem('atlas_token', response.data.access_token);
        localStorage.setItem('atlas_role', response.data.role);
        navigate('/dashboard');
      } else {
        const payload = {
          email,
          password,
          name,
          role: 'faculty' // Default registration role
        };
        await axios.post('http://localhost:8000/api/auth/register', payload);
        setSuccess('Registration successful! You can now log in.');
        setIsLogin(true); // Switch to login view
        setPassword(''); // Clear password for security
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center font-sans">
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center"
        style={{ backgroundImage: `url('/bg.png')`, filter: 'brightness(0.6)' }}
      ></div>

      <div className="relative z-10 w-full max-w-md p-4">
        <Link to="/" className="inline-flex items-center text-white/80 hover:text-white mb-4 text-sm font-medium transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Home
        </Link>
        
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border-t-8 border-green-700">
          <div className="pt-10 pb-6 px-8 text-center">
            <div className="w-20 h-20 bg-green-50 border-4 border-green-100 text-green-700 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
              <span className="text-4xl font-black">A</span>
            </div>
            <h2 className="text-2xl font-bold text-gray-800">ATLAS</h2>
            <p className="text-gray-500 mt-1 text-sm font-medium">De La Salle Araneta University</p>
          </div>
          
          <div className="px-8 pb-10">
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100 flex items-start">
                  <span>{error}</span>
                </div>
              )}
              {success && (
                <div className="bg-green-50 text-green-600 p-3 rounded-lg text-sm border border-green-100 flex items-start">
                  <span>{success}</span>
                </div>
              )}

              {!isLogin && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Full Name</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="block w-full pl-10 pr-3 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all text-gray-700"
                      placeholder="Juan Dela Cruz"
                    />
                  </div>
                </div>
              )}
              
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Email Address</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full pl-10 pr-3 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all text-gray-700"
                    placeholder="student@dlsau.edu.ph"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Key className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-10 pr-3 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all text-gray-700"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {isLogin && (
                <div className="flex items-center justify-between mt-2 mb-6">
                  <label className="flex items-center">
                    <input type="checkbox" className="rounded text-green-600 focus:ring-green-500 h-4 w-4 border-gray-300" />
                    <span className="ml-2 text-sm text-gray-500">Remember me</span>
                  </label>
                  <button type="button" onClick={(e) => e.preventDefault()} className="text-sm font-medium text-green-600 hover:text-green-500">Forgot password?</button>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center py-3 px-4 rounded-xl shadow-md text-sm font-bold text-white bg-gradient-to-r from-green-700 to-green-600 hover:from-green-800 hover:to-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-all disabled:opacity-70 mt-6"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : isLogin ? (
                  <><LogIn className="w-4 h-4 mr-2" /> Log in</>
                ) : (
                  <><UserPlus className="w-4 h-4 mr-2" /> Register</>
                )}
              </button>
            </form>
            
            <p className="mt-8 text-center text-sm text-gray-500">
              {isLogin ? (
                <>Don't have an account? <button type="button" onClick={() => setIsLogin(false)} className="font-bold text-yellow-500 hover:text-yellow-600">Register</button></>
              ) : (
                <>Already have an account? <button type="button" onClick={() => setIsLogin(true)} className="font-bold text-green-600 hover:text-green-700">Log in</button></>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
