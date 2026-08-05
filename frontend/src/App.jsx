import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Schedules from './pages/dashboard/Schedules';
import Curriculum from './pages/dashboard/Curriculum';
import Rooms from './pages/dashboard/Rooms';
import Teachers from './pages/dashboard/Teachers';
import Overview from './pages/dashboard/Overview';
import SystemLogs from './pages/dashboard/SystemLogs';
import UserManagement from './pages/dashboard/UserManagement';
import AcademicSemesters from './pages/dashboard/AcademicSemesters';
import Profile from './pages/dashboard/Profile';
import Settings from './pages/dashboard/Settings';
import Colleges from './pages/dashboard/Colleges';
import { ToastProvider } from './components/ToastProvider';
import { getRole, ROLES, ALL_ROLES, SCHEDULING_ROLES } from './utils/session';

const Unauthorized403 = () => (
  <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
    <div className="w-16 h-16 bg-sem-conflict-bg rounded-full flex items-center justify-center text-sem-conflict mb-4">
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    </div>
    <h2 className="font-display text-page text-atlas-ink mb-2">You do not have access to this page</h2>
    <p className="font-ui text-body text-atlas-slate max-w-md mb-6">
      This section is restricted to other roles. Ask a system administrator if you need access.
    </p>
    <a
      href="/dashboard"
      className="inline-flex items-center h-10 px-4 rounded-control bg-atlas-700 hover:bg-atlas-800 text-white font-ui font-medium transition-colors"
    >
      Back to Overview
    </a>
  </div>
);

const ProtectedRoute = ({ children, allowedRoles }) => {
  const role = getRole();
  if (!role) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(role)) return <Unauthorized403 />;
  return children;
};

/** Admin-only sections. Absent from the rail for other roles, blocked here too. */
const adminOnly = [ROLES.ADMIN];

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
            <Route index element={<Overview />} />
            <Route
              path="schedules"
              element={
                <ProtectedRoute allowedRoles={ALL_ROLES}>
                  <Schedules />
                </ProtectedRoute>
              }
            />
            <Route
              path="curriculum"
              element={
                <ProtectedRoute allowedRoles={ALL_ROLES}>
                  <Curriculum />
                </ProtectedRoute>
              }
            />
            <Route
              path="rooms"
              element={
                <ProtectedRoute allowedRoles={ALL_ROLES}>
                  <Rooms />
                </ProtectedRoute>
              }
            />
            <Route
              path="teachers"
              element={
                <ProtectedRoute allowedRoles={SCHEDULING_ROLES}>
                  <Teachers />
                </ProtectedRoute>
              }
            />
            <Route
              path="logs"
              element={
                <ProtectedRoute allowedRoles={ALL_ROLES}>
                  <SystemLogs />
                </ProtectedRoute>
              }
            />
            <Route
              path="users"
              element={
                <ProtectedRoute allowedRoles={adminOnly}>
                  <UserManagement />
                </ProtectedRoute>
              }
            />
            <Route
              path="colleges"
              element={
                <ProtectedRoute allowedRoles={adminOnly}>
                  <Colleges />
                </ProtectedRoute>
              }
            />
            <Route
              path="semesters"
              element={
                <ProtectedRoute allowedRoles={adminOnly}>
                  <AcademicSemesters />
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
