import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryProvider } from './providers/QueryProvider';
import { AuthProvider } from './providers/AuthProvider';
import PublicLayout from './components/layouts/PublicLayout';
import PrivateLayout from './components/layouts/PrivateLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Institutions from './pages/Institutions';
import Roles from './pages/Roles';
import Subscriptions from './pages/Subscriptions';
import Staffs from './pages/Staffs';

function App() {
  return (
    <QueryProvider>
      <AuthProvider>
        <Router>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<PublicLayout />}>
              <Route index element={<Navigate to="/login" replace />} />
              <Route path="login" element={<Login />} />
            </Route>

            {/* Private Routes */}
            <Route element={<PrivateLayout />}>
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="users" element={<Users />} />
              <Route path="institutions" element={<Institutions />} />
              <Route path="roles" element={<Roles />} />
              <Route path="subscriptions" element={<Subscriptions />} />
              <Route path="staffs" element={<Staffs />} />
            </Route>

            {/* Catch all route */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </QueryProvider>
  );
}

export default App;
