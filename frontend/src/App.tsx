import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import AppLayout from './layouts/AppLayout';
import DashboardPage from './pages/DashboardPage';
import JobsPage from './pages/JobsPage';
import TechniciansPage from './pages/TechniciansPage';
import SchedulingBoardPage from './pages/SchedulingBoardPage';
import OptimizationPage from './pages/OptimizationPage';
import DisruptionsPage from './pages/DisruptionsPage';
import RecoveryHistoryPage from './pages/RecoveryHistoryPage';
import AuditLogPage from './pages/AuditLogPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import UserDashboardPage from './pages/UserDashboardPage';
import TechnicianDashboardPage from './pages/TechnicianDashboardPage';
import CustomersPage from './pages/CustomersPage';
import NotFoundPage from './pages/NotFoundPage';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Standalone Authentication Portal */}
          <Route path="/login" element={<LoginPage />} />

          {/* Main App Layout */}
          <Route path="/" element={<AppLayout />}>
            {/* 1. Overview Dashboard */}
            <Route index element={<DashboardPage />} />

            {/* 2. Client / End User Dashboard */}
            <Route path="user-dashboard" element={<UserDashboardPage />} />

            {/* 3. Field Specialist Dashboard */}
            <Route path="technician-dashboard" element={<TechnicianDashboardPage />} />

            {/* 4. Client Directory & Tracking for Admin */}
            <Route path="customers" element={<CustomersPage />} />

            {/* 5. Job Management */}
            <Route path="jobs" element={<JobsPage />} />

            {/* 6. Technician Management */}
            <Route path="technicians" element={<TechniciansPage />} />

            {/* 7. Scheduling Board (Gantt Timeline) */}
            <Route path="scheduling" element={<SchedulingBoardPage />} />

            {/* 8. Optimization Center */}
            <Route path="optimization" element={<OptimizationPage />} />

            {/* 9. Disruption Simulator */}
            <Route path="disruptions" element={<DisruptionsPage />} />

            {/* 10. Recovery History */}
            <Route path="recovery" element={<RecoveryHistoryPage />} />

            {/* 11. Audit Logs */}
            <Route path="audit" element={<AuditLogPage />} />

            {/* 12. Settings & Health */}
            <Route path="settings" element={<SettingsPage />} />

            {/* Legacy route redirects */}
            <Route path="schedules" element={<Navigate to="/scheduling" replace />} />
            <Route path="personnel" element={<Navigate to="/technicians" replace />} />
            <Route path="clients" element={<Navigate to="/customers" replace />} />

            {/* 404 Catch-All */}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
