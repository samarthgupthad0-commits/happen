import './index.css';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import ToastProvider from './components/ToastProvider';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './layouts/AppLayout';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import { useAuthStore } from './store/authStore';

const HomePage           = lazy(() => import('./pages/HomePage'));
const CalendarPage       = lazy(() => import('./pages/CalendarPage'));
const LeavePage          = lazy(() => import('./pages/LeavePage'));
const AllLeavesPage      = lazy(() => import('./pages/AllLeavesPage'));
const LeaveRequestPage   = lazy(() => import('./pages/LeaveRequestPage'));
const LeavesQueuePage    = lazy(() => import('./pages/LeavesQueuePage'));
const CurrentLeavesPage  = lazy(() => import('./pages/CurrentLeavesPage'));
const MessagesPage       = lazy(() => import('./pages/MessagesPage'));
const ProjectsPage       = lazy(() => import('./pages/ProjectsPage'));
const TasksPage          = lazy(() => import('./pages/TasksPage'));
const PerformancePage    = lazy(() => import('./pages/PerformancePage'));
const WikiPage           = lazy(() => import('./pages/WikiPage'));
const ResourcesPage      = lazy(() => import('./pages/ResourcesPage'));
const KudosPage          = lazy(() => import('./pages/KudosPage'));
const TimesheetsPage     = lazy(() => import('./pages/TimesheetsPage'));
const TeamPage           = lazy(() => import('./pages/TeamPage'));
const AnalyticsPage      = lazy(() => import('./pages/AnalyticsPage'));
const HRPage             = lazy(() => import('./pages/HRPage'));
const PayrollPage        = lazy(() => import('./pages/PayrollPage'));
const DonationPage       = lazy(() => import('./pages/DonationPage'));
const WellnessPage       = lazy(() => import('./pages/WellnessPage'));
const SettingsPage       = lazy(() => import('./pages/SettingsPage'));
const AdminUsersPage     = lazy(() => import('./pages/admin/AdminUsersPage'));
const AdminPasswordsPage = lazy(() => import('./pages/admin/AdminPasswordsPage'));
const AdminAuditPage     = lazy(() => import('./pages/admin/AdminAuditPage'));
const AdminImpersonatePage = lazy(() => import('./pages/admin/AdminImpersonatePage'));

const Spin = () => (
  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}>
    <div style={{ width:40, height:40, border:'3px solid #F4631E', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
);

function App() {
  const user = useAuthStore((state) => state.user);
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <Suspense fallback={<Spin />}>
            <Routes>
              <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
              <Route path="/home" element={<HomePage />} />
              <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <LoginPage />} />
              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route path="/dashboard"         element={<Dashboard />} />
                <Route path="/calendar"          element={<CalendarPage />} />
                <Route path="/leave"             element={<LeavePage />} />
                <Route path="/leave/request"     element={<LeaveRequestPage />} />
                <Route path="/leave/queue"       element={<LeavesQueuePage />} />
                <Route path="/leave/all"         element={<ProtectedRoute allowedRoles={['team_lead','manager','hr','admin']}><AllLeavesPage /></ProtectedRoute>} />
                {/* My Team — open to all roles that belong to a team */}
                <Route path="/team"              element={<TeamPage />} />
                <Route path="/tasks"             element={<TasksPage />} />
                <Route path="/timesheets"        element={<TimesheetsPage />} />
                <Route path="/performance"       element={<PerformancePage />} />
                <Route path="/kudos"             element={<KudosPage />} />
                <Route path="/messages"          element={<MessagesPage />} />
                <Route path="/resources"         element={<ResourcesPage />} />
                <Route path="/wiki"              element={<WikiPage />} />
                <Route path="/current-leaves"    element={<ProtectedRoute allowedRoles={['manager','hr','admin']}><CurrentLeavesPage /></ProtectedRoute>} />
                <Route path="/projects"          element={<ProtectedRoute allowedRoles={['team_lead','manager','hr','admin']}><ProjectsPage /></ProtectedRoute>} />
                <Route path="/analytics"         element={<ProtectedRoute allowedRoles={['manager','hr','accounting']}><AnalyticsPage /></ProtectedRoute>} />
                <Route path="/hr"                element={<ProtectedRoute allowedRoles={['hr']}><HRPage /></ProtectedRoute>} />
                <Route path="/payroll"           element={<ProtectedRoute allowedRoles={['accounting']}><PayrollPage /></ProtectedRoute>} />
                <Route path="/donation"          element={<DonationPage />} />
                <Route path="/wellness"          element={<WellnessPage />} />
                <Route path="/settings"          element={<SettingsPage />} />
                <Route path="/admin"             element={<ProtectedRoute allowedRoles={['admin']}><Dashboard /></ProtectedRoute>} />
                <Route path="/admin/users"       element={<ProtectedRoute allowedRoles={['admin']}><AdminUsersPage /></ProtectedRoute>} />
                <Route path="/admin/passwords"   element={<ProtectedRoute allowedRoles={['admin']}><AdminPasswordsPage /></ProtectedRoute>} />
                <Route path="/admin/audit"       element={<ProtectedRoute allowedRoles={['admin']}><AdminAuditPage /></ProtectedRoute>} />
                <Route path="/admin/impersonate" element={<ProtectedRoute allowedRoles={['admin']}><AdminImpersonatePage /></ProtectedRoute>} />
              </Route>
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export default App;
