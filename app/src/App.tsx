import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { QueryProvider } from './providers/QueryProvider';
import { AuthProvider } from './providers/AuthProvider';
import { ThemeProvider } from './providers/ThemeProvider';
import PublicLayout from './components/layouts/PublicLayout';
import PrivateLayout from './components/layouts/PrivateLayout';
import StudentOnlyRoute from './components/StudentOnlyRoute';
import RequireModule from './components/RequireModule';
import RequireFeature from './components/RequireFeature';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Institutions from './pages/Institutions';
import Roles from './pages/Roles';
import Subscriptions from './pages/Subscriptions';
import FeatureAccess from './pages/FeatureAccess';
import PaymentGateways from './pages/PaymentGateways';
import Staffs from './pages/Staffs';
import ClassSections from './pages/ClassSections/ClassSections';
import Students from './pages/Students/Students';
import StudentDetail from './pages/Students/StudentDetail';
import { MyClassSections, ClassSectionDetail } from './pages/MyClassSections';
import AssignedSubjects from './pages/AssignedSubjects/AssignedSubjects';
import { TalaChat } from './pages/Tala';
import SubjectDetail from './pages/AssignedSubjects/SubjectDetail';
import { TeacherAttendance } from './pages/TeacherAttendance';
import TeacherAttendanceDemo from './pages/TeacherAttendanceDemo';
import UserProfile from './pages/Users/UserProfile';
import ConsolidatedGrades from './pages/ConsolidatedGrades/ConsolidatedGrades';
import SectionGrades from './pages/ConsolidatedGrades/SectionGrades';
import Proficiency from './pages/Proficiency/Proficiency';
import SF9 from './pages/SF9';
import SetNewPassword from './pages/SetNewPassword';
import CertificateBuilder from './pages/CertificateBuilder/CertificateBuilder';
import CertificateBuilderPage from './pages/CertificateBuilder/CertificateBuilderPage';
import CertificateList from './pages/CertificateBuilder/CertificateList';
import IdCardBuilder from './pages/IdCardBuilder/IdCardBuilder';
import IdCardBuilderPage from './pages/IdCardBuilder/IdCardBuilderPage';
import SchoolDays from './pages/SchoolDays';
import Departments from './pages/Departments/Departments';
import GradeLevels from './pages/GradeLevels/GradeLevels';
import GradingScales from './pages/GradingScales/GradingScales';
import Settings from './pages/Settings/Settings';
import TracksStrands from './pages/TracksStrands/TracksStrands';
import Finance from './pages/Finance';
import PaymentPlansView from './pages/Finance/PaymentPlansView';
import Disbursements from './pages/Finance/Disbursements';
import FinanceAnnouncementsView from './pages/Finance/FinanceAnnouncementsView';
import Login from './pages/Login';
import MyAssessments from './pages/MyAssessments';
import { TakeAssessment } from './pages/MyAssessments';
import MyLessons from './pages/MyLessons';
import { ViewLesson } from './pages/MyLessons';
import MyPersonalInfo from './pages/MyPersonalInfo';
import MySubjects from './pages/MySubjects';
import MyFinance from './pages/MyFinance';
import GateEnter from './pages/Gate/GateEnter';
import GateExit from './pages/Gate/GateExit';
import FormBuilderPage from './pages/FormBuilder/FormBuilderPage';
import PublicAdmissionForm from './pages/PublicAdmission/PublicAdmissionForm';
import AdmissionForms from './pages/AdmissionForms/AdmissionForms';
import Timetable from './pages/Timetable/Timetable';
import GateEntries from './pages/GateEntries/GateEntries';
import HrisDevices from './pages/HRIS/Devices';
import HrisZkUsers from './pages/HRIS/ZkUsers';
import HrisAttendance from './pages/HRIS/Attendance';
import HrisStaffSchedules from './pages/HRIS/StaffSchedules';
import HrisAttendanceRequests from './pages/HRIS/AttendanceRequests';
import HrisPayroll from './pages/HRIS/Payroll';
import SmsGateways from './pages/SMS/Gateways';
import SmsMessages from './pages/SMS/Messages';
import SmsSettings from './pages/SMS/Settings';
import AnnouncementBoard from './pages/Announcements/AnnouncementBoard';
import AnnouncementsManage from './pages/Announcements/AnnouncementsManage';
import ChatPage from './pages/Chat/ChatPage';


function App() {
  return (
    <QueryProvider>
      <AuthProvider>
        <ThemeProvider>
        <Router>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<PublicLayout />}>
              <Route index element={<Navigate to="/login" replace />} />
              <Route path="login" element={<Login />} />
            </Route>

            {/* Set New Password Route - Separate from PrivateLayout */}
            <Route path="set-new-password" element={<SetNewPassword />} />

            {/* Public Kiosk Gate Pages */}
            <Route path="gate-enter" element={<GateEnter />} />
            <Route path="gate-exit" element={<GateExit />} />
            <Route path="admission/:institutionId" element={<PublicAdmissionForm />} />

            {/* Private Routes */}
            <Route element={<PrivateLayout />}>
              {/*
                Pages wrapped in RequireModule are closed to roles that were not
                given that module — typing the URL redirects to the dashboard
                rather than rendering a screen that only fills with 403s.
                Personal pages (dashboard, own profile, own portal) are never
                gated.
              */}
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="users" element={<RequireModule module="users"><Users /></RequireModule>} />
              <Route path="user-profile" element={<UserProfile />} />
              <Route path="institutions" element={<RequireModule module="institutions"><Institutions /></RequireModule>} />
              <Route path="roles" element={<RequireModule module="roles"><Roles /></RequireModule>} />
              <Route path="subscriptions" element={<RequireModule module="subscriptions"><Subscriptions /></RequireModule>} />
              {/*
                Platform administration. `feature-access` is a system_only
                module, so only a wildcard holder reaches it — an institution
                cannot be granted the ability to decide its own features, which
                is the entire point of the screen.
              */}
              <Route path="feature-access" element={<RequireModule module="feature-access"><FeatureAccess /></RequireModule>} />
              {/*
                Likewise platform-only. A school's own administrator cannot be
                granted `payment-gateways` in its role builder, so it never sees
                — or sets — the keys its online payments run on.
              */}
              <Route path="payment-gateways" element={<RequireModule module="payment-gateways"><PaymentGateways /></RequireModule>} />
              <Route path="staffs" element={<RequireModule module="staffs"><Staffs /></RequireModule>} />
              <Route path="students" element={<RequireModule module="students" ability="manage"><Students /></RequireModule>} />
              <Route path="admission-forms" element={<RequireModule module="admission-forms"><AdmissionForms /></RequireModule>} />
              <Route path="gate-entries" element={<RequireModule module="gate-entries"><GateEntries /></RequireModule>} />
              <Route path="students/:id" element={<RequireModule module="students"><StudentDetail /></RequireModule>} />
              <Route path="class-sections" element={<RequireModule module="class-sections"><ClassSections /></RequireModule>} />
              <Route path="timetable" element={<RequireModule module="timetable"><Timetable /></RequireModule>} />
              <Route path="my-class-sections" element={<RequireModule module="subjects"><MyClassSections /></RequireModule>} />
              <Route path="my-class-sections/:id" element={<RequireModule module="subjects"><ClassSectionDetail /></RequireModule>} />
              <Route path="assigned-subjects" element={<RequireModule module="subjects"><AssignedSubjects /></RequireModule>} />
              {/*
                `view`, not `manage`, and it has to be. Chatting needs `manage`,
                which now comes only from a per-teacher grant — but the screen
                that hands out those grants lives here too. Guarding the page on
                `manage` locked the administrator out of the only place access
                can be given, which needs `tala.configure` and confers `view`.
                The page itself decides what to render: composer, or setup panel.
              */}
              <Route path="tala" element={<RequireModule module="tala" ability="view"><TalaChat /></RequireModule>} />
              {/*
                No permission gates chat, and none should: a teacher's own
                advisory and a student's own subjects are their own data, and the
                API scopes every response to the groups their enrolment puts them
                in — there is nothing here a role could usefully withhold.

                The feature gate is a different question, and the one the school
                does not get to answer: whether this institution has chat at all.
                Decided on the platform's Feature Access screen.
              */}
              <Route path="chat" element={<RequireFeature feature="chat"><ChatPage /></RequireFeature>} />
              <Route path="assigned-subjects/:id" element={<RequireModule module="subjects"><SubjectDetail /></RequireModule>} />
              <Route
                path="my-assessments"
                element={(
                  <StudentOnlyRoute>
                    <MyAssessments />
                  </StudentOnlyRoute>
                )}
              />
              <Route
                path="my-assessments/:id/take"
                element={(
                  <StudentOnlyRoute>
                    <TakeAssessment />
                  </StudentOnlyRoute>
                )}
              />
              <Route
                path="my-lessons"
                element={(
                  <StudentOnlyRoute>
                    <MyLessons />
                  </StudentOnlyRoute>
                )}
              />
              <Route
                path="my-lessons/:id/view"
                element={(
                  <StudentOnlyRoute>
                    <ViewLesson />
                  </StudentOnlyRoute>
                )}
              />
              <Route path="my-personal-info" element={<MyPersonalInfo />} />
              <Route path="my-subjects" element={<MySubjects />} />
              <Route
                path="my-finance"
                element={(
                  <StudentOnlyRoute>
                    <MyFinance />
                  </StudentOnlyRoute>
                )}
              />
              <Route path="teacher-attendance" element={<RequireModule module="student-attendance"><TeacherAttendance /></RequireModule>} />
              <Route path="teacher-attendance-demo" element={<TeacherAttendanceDemo />} />
              <Route path="consolidated-grades" element={<RequireModule module="consolidated-grades"><ConsolidatedGrades /></RequireModule>} />
              <Route path="consolidated-grades/:sectionId/:quarter" element={<RequireModule module="consolidated-grades"><SectionGrades /></RequireModule>} />
              <Route path="proficiency" element={<RequireModule module="proficiency"><Proficiency /></RequireModule>} />
              <Route path="sf9" element={<RequireModule module="consolidated-grades"><SF9 /></RequireModule>} />
              <Route path="certificate-builder/new" element={<RequireModule module="certificate-builder" ability="manage"><CertificateBuilder /></RequireModule>} />
              <Route path="certificate-builder" element={<RequireModule module="certificate-builder"><CertificateBuilderPage /></RequireModule>} />
              <Route path="certificates" element={<RequireModule module="certificate-builder"><CertificateList /></RequireModule>} />
              <Route path="id-card-builder/new" element={<RequireModule module="id-card-builder" ability="manage"><IdCardBuilder /></RequireModule>} />
              <Route path="id-card-builder" element={<RequireModule module="id-card-builder"><IdCardBuilderPage /></RequireModule>} />
              <Route path="form-builder" element={<RequireModule module="form-builder"><FormBuilderPage /></RequireModule>} />
              <Route path="school-days" element={<RequireModule module="school-days" ability="manage"><SchoolDays /></RequireModule>} />
              <Route path="departments" element={<RequireModule module="departments"><Departments /></RequireModule>} />
              <Route path="grade-levels" element={<RequireModule module="grade-levels" ability="manage"><GradeLevels /></RequireModule>} />
              <Route path="grading-scales" element={<RequireModule module="grading-scales"><GradingScales /></RequireModule>} />
              <Route path="tracks-strands" element={<RequireModule module="tracks-strands"><TracksStrands /></RequireModule>} />
              <Route path="finance" element={<RequireModule module="finance"><Finance /></RequireModule>} />
              <Route path="finance/school-fees" element={<RequireModule module="school-fees"><Finance /></RequireModule>} />
              <Route path="payment-plans" element={<RequireModule module="payment-plans"><PaymentPlansView /></RequireModule>} />
              <Route path="disbursements" element={<RequireModule module="disbursements"><Disbursements /></RequireModule>} />
              <Route path="finance-announcements" element={<RequireModule module="finance"><FinanceAnnouncementsView /></RequireModule>} />
              <Route path="finance/default-amounts" element={<RequireModule module="school-fees"><Finance /></RequireModule>} />
              <Route path="finance/student-fees" element={<RequireModule module="school-fees"><Finance /></RequireModule>} />
              <Route path="finance/cashiering" element={<RequireModule module="finance"><Finance /></RequireModule>} />
              <Route path="finance/ledger" element={<RequireModule module="finance"><Finance /></RequireModule>} />
              <Route path="finance/collections" element={<RequireModule module="finance-reports"><Finance /></RequireModule>} />
              <Route path="finance/discounts" element={<RequireModule module="discounts"><Finance /></RequireModule>} />
              <Route path="finance/default-discounts" element={<RequireModule module="discounts"><Finance /></RequireModule>} />
              <Route path="finance/sibling-discounts" element={<RequireModule module="discounts"><Finance /></RequireModule>} />
              <Route path="finance/receipt-builder" element={<RequireModule module="receipt-templates"><Finance /></RequireModule>} />
              <Route path="finance/receipt-approvals" element={<RequireModule module="finance"><Finance /></RequireModule>} />
              <Route path="finance/void-requests" element={<RequireModule module="finance"><Finance /></RequireModule>} />
              {/* Data clearing needs the ability, not just Finance access — the
                  page itself gates on it again, as does every endpoint. */}
              <Route path="finance/fee-naming" element={<RequireModule module="finance" ability="name-fees"><Finance /></RequireModule>} />
              <Route path="finance/data-clearing" element={<RequireModule module="finance" ability="clear-data"><Finance /></RequireModule>} />
              <Route path="settings" element={<RequireModule module="settings"><Settings /></RequireModule>} />
              <Route path="hris/devices" element={<RequireModule module="biometric-devices"><HrisDevices /></RequireModule>} />
              <Route path="hris/zk-users" element={<RequireModule module="zk-users"><HrisZkUsers /></RequireModule>} />
              <Route path="hris/attendance" element={<RequireModule module="attendance-logs"><HrisAttendance /></RequireModule>} />
              <Route path="hris/staff-schedules" element={<RequireModule module="staff-schedules"><HrisStaffSchedules /></RequireModule>} />
              {/* Any staff member files their own request here; the approval
                  queue inside the page is what the permission gates. */}
              <Route path="hris/attendance-requests" element={<HrisAttendanceRequests />} />
              <Route path="hris/payroll" element={<RequireModule module="payroll"><HrisPayroll /></RequireModule>} />
              <Route path="sms/gateways" element={<RequireModule module="sms-gateways"><SmsGateways /></RequireModule>} />
              <Route path="sms/messages" element={<RequireModule module="sms-messages"><SmsMessages /></RequireModule>} />
              <Route path="sms/settings" element={<RequireModule module="sms-settings"><SmsSettings /></RequireModule>} />
              {/* The board is everyone's; authoring is gated. */}
              <Route path="announcements" element={<AnnouncementBoard />} />
              <Route path="announcements/manage" element={<RequireModule module="announcements" ability="manage"><AnnouncementsManage /></RequireModule>} />

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
                primary: 'var(--color-success-500)',
                secondary: '#fff',
              },
            },
            error: {
              duration: 5000,
              iconTheme: {
                primary: 'var(--color-danger-500)',
                secondary: '#fff',
              },
            },
          }}
        />
        </ThemeProvider>
      </AuthProvider>
    </QueryProvider>
  );
}

export default App;
