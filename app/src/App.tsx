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
import ClassSections from './pages/ClassSections/ClassSections';
import Students from './pages/Students/Students';
import StudentDetail from './pages/Students/StudentDetail';
import { MyClassSections, ClassSectionDetail } from './pages/MyClassSections';

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
              <Route path="students" element={<Students />} />
              <Route path="students/:id" element={<StudentDetail />} />
              <Route path="class-sections" element={<ClassSections />} />
              <Route path="my-class-sections" element={<MyClassSections />} />
              <Route path="my-class-sections/:id" element={<ClassSectionDetail />} />
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
