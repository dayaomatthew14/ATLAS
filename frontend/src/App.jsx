import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Schedules from './pages/dashboard/Schedules';
import Curriculum from './pages/dashboard/Curriculum';
import Rooms from './pages/dashboard/Rooms';
import Teachers from './pages/dashboard/Teachers';
import DashboardHome from './pages/dashboard/DashboardHome';
import SystemLogs from './pages/dashboard/SystemLogs';
import UserManagement from './pages/dashboard/UserManagement';
import AcademicSemesters from './pages/dashboard/AcademicSemesters';
import Profile from './pages/dashboard/Profile';
import Settings from './pages/dashboard/Settings';

const Unauthorized403 = () => {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center text-rose-600 dark:text-rose-400 mb-4 shadow-inner">
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">403 Unauthorized Access</h2>
      <p className="text-slate-600 dark:text-slate-400 max-w-md mb-6">
        Access to this administrative section is restricted to authorized roles. Contact the system administrator if you require elevated permissions.
      </p>
      <a 
        href="/dashboard"
        className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition shadow-md"
      >
        Return to Dashboard Overview
      </a>
    </div>
  );
};

const ProtectedRoute = ({ children, allowedRoles }) => {
  const role = localStorage.getItem('atlas_role');
  if (!role) {
    return <Navigate to="/login" replace />;
  }
  const cleanRole = role.toLowerCase().trim();
  if (allowedRoles && !allowedRoles.includes(cleanRole)) {
    return <Unauthorized403 />;
  }
  return children;
};

import { ToastProvider } from './components/ToastProvider';

function App() {
  return (
    <ToastProvider>
      <Router>
        <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        >
          <Route index element={<DashboardHome />} />
          <Route 
            path="schedules" 
            element={
              <ProtectedRoute allowedRoles={['admin', 'program_chair', 'coordinator']}>
                <Schedules />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="curriculum" 
            element={
              <ProtectedRoute allowedRoles={['admin', 'program_chair', 'coordinator']}>
                <Curriculum />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="rooms" 
            element={
              <ProtectedRoute allowedRoles={['admin', 'program_chair', 'coordinator']}>
                <Rooms />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="teachers" 
            element={
              <ProtectedRoute allowedRoles={['admin', 'program_chair', 'coordinator']}>
                <Teachers />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="users" 
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <UserManagement />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="semesters" 
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AcademicSemesters />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="logs" 
            element={
              <ProtectedRoute allowedRoles={['admin', 'program_chair', 'coordinator']}>
                <SystemLogs />
              </ProtectedRoute>
            } 
          />
          <Route path="profile" element={<Profile />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Router>
    </ToastProvider>
  );
}

export default App;
