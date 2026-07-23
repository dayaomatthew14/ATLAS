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

const ProtectedRoute = ({ children }) => {
  const role = localStorage.getItem('atlas_role');
  if (!role) {
    return <Navigate to="/login" replace />;
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
          <Route path="schedules" element={<Schedules />} />
          <Route path="curriculum" element={<Curriculum />} />
          <Route path="rooms" element={<Rooms />} />
          <Route path="teachers" element={<Teachers />} />
          <Route path="users" element={<UserManagement />} />
          <Route path="semesters" element={<AcademicSemesters />} />
          <Route path="logs" element={<SystemLogs />} />
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
