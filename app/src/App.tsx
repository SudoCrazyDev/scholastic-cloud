import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
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
import AssignedSubjects from './pages/AssignedSubjects/AssignedSubjects';
import SubjectDetail from './pages/AssignedSubjects/SubjectDetail';
import { TeacherAttendance } from './pages/TeacherAttendance';
import TeacherAttendanceDemo from './pages/TeacherAttendanceDemo';
import UserProfile from './pages/Users/UserProfile';


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
              <Route path="user-profile" element={<UserProfile />} />
              <Route path="institutions" element={<Institutions />} />
              <Route path="roles" element={<Roles />} />
              <Route path="subscriptions" element={<Subscriptions />} />
              <Route path="staffs" element={<Staffs />} />
              <Route path="students" element={<Students />} />
              <Route path="students/:id" element={<StudentDetail />} />
              <Route path="class-sections" element={<ClassSections />} />
              <Route path="my-class-sections" element={<MyClassSections />} />
              <Route path="my-class-sections/:id" element={<ClassSectionDetail />} />
              <Route path="assigned-subjects" element={<AssignedSubjects />} />
              <Route path="assigned-subjects/:id" element={<SubjectDetail />} />
              <Route path="teacher-attendance" element={<TeacherAttendance />} />
              <Route path="teacher-attendance-demo" element={<TeacherAttendanceDemo />} />

            </Route>

            {/* Catch all route */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Router>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#363636',
              color: '#fff',
            },
            success: {
              duration: 4000,
              iconTheme: {
                primary: '#10b981',
                secondary: '#fff',
              },
            },
            error: {
              duration: 5000,
              iconTheme: {
                primary: '#ef4444',
                secondary: '#fff',
              },
            },
          }}
        />
      </AuthProvider>
    </QueryProvider>
  );
}

export default App;
