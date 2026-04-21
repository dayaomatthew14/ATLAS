import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Schedules from './pages/dashboard/Schedules';
import Subjects from './pages/dashboard/Subjects';
import Rooms from './pages/dashboard/Rooms';
import Colleges from './pages/dashboard/Colleges';
import Teachers from './pages/dashboard/Teachers';
import Sections from './pages/dashboard/Sections';
import DashboardHome from './pages/dashboard/DashboardHome';

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
          <Route path="subjects" element={<Subjects />} />
          <Route path="rooms" element={<Rooms />} />
          <Route path="colleges" element={<Colleges />} />
          <Route path="teachers" element={<Teachers />} />
          <Route path="sections" element={<Sections />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Router>
    </ToastProvider>
  );
}

export default App;
