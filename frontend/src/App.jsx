import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Schedules from './pages/dashboard/Schedules';
import Subjects from './pages/dashboard/Subjects';
import Rooms from './pages/dashboard/Rooms';
import Students from './pages/dashboard/Students';
import Teachers from './pages/dashboard/Teachers';
import Sections from './pages/dashboard/Sections';

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('atlas_token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

function App() {
  return (
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
          <Route index element={<Navigate to="schedules" replace />} />
          <Route path="schedules" element={<Schedules />} />
          <Route path="subjects" element={<Subjects />} />
          <Route path="rooms" element={<Rooms />} />
          <Route path="students" element={<Students />} />
          <Route path="teachers" element={<Teachers />} />
          <Route path="sections" element={<Sections />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
