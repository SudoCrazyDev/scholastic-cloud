import React, { useState, useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { institutionService } from '../../services/institutionService';
import {
  LayoutDashboard,
  Users,
  UserCircle,
  Building2,
  Shield,
  CreditCard,
  Wallet,
  Menu,
  GraduationCap,
  UserCheck,
  GraduationCap as StudentsIcon,
  BookOpen,
  BookOpen as AssignedSubjectsIcon,
  BarChart3,
  TrendingUp,
  X,
  Calendar,
  Settings,
  FileText,
  FolderTree,
  LayoutTemplate,
  ListOrdered,
  ListChecks,
  Route,
  ClipboardList,
  CalendarDays,
  ScanLine,
  Fingerprint,
  Monitor,
  Clock,
  CalendarClock,
  CalendarCheck,
  Megaphone,
  Send,
  Banknote,
  Smartphone,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import { announcementService } from '../../services/announcementService';

interface MenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  /**
   * Module from the access catalog this item belongs to. The item is shown
   * when the signed-in user's role can reach it at `ability` (default 'view').
   */
  module?: string;
  ability?: string;
  /**
   * Role slugs, for the student portal only. Student access is not modelled as
   * module permissions — those screens are a student's own records, and every
   * staff-side module is closed to them regardless.
   */
  allowedRoles?: string[];
  /** Shown to any signed-in staff member; hidden from students. */
  staffOnly?: boolean;
  // Match the path exactly (NavLink `end`) so a parent path doesn't stay
  // highlighted when a child route like `/announcements/manage` is active.
  end?: boolean;
}

interface MenuGroup {
  label: string;
  items: MenuItem[];
}

interface SidebarProps {
  onMobileClose?: () => void;
}

const menuGroups: MenuGroup[] = [
  {
    label: 'General',
    items: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        icon: <LayoutDashboard className="w-5 h-5" />,
        path: '/dashboard',
      },
    ],
  },
  {
    label: 'Communication',
    items: [
      {
        id: 'announcements-board',
        label: 'Announcements',
        icon: <Megaphone className="w-5 h-5" />,
        path: '/announcements',
        end: true,
      },
      {
        id: 'announcements-manage',
        label: 'Manage Announcements',
        icon: <Send className="w-5 h-5" />,
        path: '/announcements/manage',
        module: 'announcements',
        ability: 'manage',
      },
    ],
  },
  {
    label: 'My Portal',
    items: [
      {
        id: 'my-personal-info',
        label: 'My Personal Info',
        icon: <UserCircle className="w-5 h-5" />,
        path: '/my-personal-info',
        allowedRoles: ['student'],
      },
      {
        id: 'my-subjects',
        label: 'My Subject',
        icon: <BookOpen className="w-5 h-5" />,
        path: '/my-subjects',
        allowedRoles: ['student'],
      },
      {
        id: 'my-lessons',
        label: 'My Lessons',
        icon: <GraduationCap className="w-5 h-5" />,
        path: '/my-lessons',
        allowedRoles: ['student'],
      },
      {
        id: 'my-assessments',
        label: 'My Assessments',
        icon: <FileText className="w-5 h-5" />,
        path: '/my-assessments',
        allowedRoles: ['student'],
      },
      {
        id: 'my-finance',
        label: 'My Finance',
        icon: <Wallet className="w-5 h-5" />,
        path: '/my-finance',
        allowedRoles: ['student'],
      },
    ],
  },
  {
    label: 'My Work',
    items: [
      {
        // A teacher's own advisory sections and teaching load. Gated on
        // Subjects because that is what makes a role a teaching one.
        id: 'my-class-sections',
        label: 'My Class Sections',
        icon: <BookOpen className="w-5 h-5" />,
        path: '/my-class-sections',
        module: 'subjects',
      },
      {
        id: 'assigned-subjects',
        label: 'My Assigned Subjects',
        icon: <AssignedSubjectsIcon className="w-5 h-5" />,
        path: '/assigned-subjects',
        module: 'subjects',
      },
      {
        // Sending a message is a write, and EnsureModuleAccess upgrades write
        // verbs to `manage` — so `view` alone would show a link to a screen
        // that could read old threads and not answer anything.
        id: 'tala',
        label: 'Tala',
        icon: <Sparkles className="w-5 h-5" />,
        path: '/tala',
        module: 'tala',
        ability: 'manage',
      },
    ],
  },
  {
    label: 'Academics',
    items: [
      {
        id: 'class-sections',
        label: 'Class Sections',
        icon: <GraduationCap className="w-5 h-5" />,
        path: '/class-sections',
        module: 'class-sections',
      },
      {
        id: 'timetable',
        label: 'Timetable',
        icon: <CalendarDays className="w-5 h-5" />,
        path: '/timetable',
        module: 'timetable',
      },
      {
        id: 'grade-levels',
        label: 'Grade Levels',
        icon: <ListOrdered className="w-5 h-5" />,
        path: '/grade-levels',
        module: 'grade-levels',
        ability: 'manage',
      },
      {
        id: 'grading-scales',
        label: 'Grading Scales',
        icon: <ListChecks className="w-5 h-5" />,
        path: '/grading-scales',
        module: 'grading-scales',
      },
      {
        id: 'consolidated-grades',
        label: 'Consolidated Grades',
        icon: <BarChart3 className="w-5 h-5" />,
        path: '/consolidated-grades',
        module: 'consolidated-grades',
      },
      {
        id: 'proficiency',
        label: 'Proficiency',
        icon: <TrendingUp className="w-5 h-5" />,
        path: '/proficiency',
        module: 'proficiency',
      },
      {
        id: 'school-days',
        label: 'School Days',
        icon: <Calendar className="w-5 h-5" />,
        path: '/school-days',
        module: 'school-days',
        ability: 'manage',
      },
    ],
  },
  {
    label: 'Students',
    items: [
      {
        id: 'students',
        label: 'Students',
        icon: <StudentsIcon className="w-5 h-5" />,
        path: '/students',
        module: 'students',
        ability: 'manage',
      },
      {
        id: 'admission-forms',
        label: 'Admission Forms',
        icon: <ClipboardList className="w-5 h-5" />,
        path: '/admission-forms',
        module: 'admission-forms',
      },
      {
        id: 'gate-entries',
        label: 'Gate Entries',
        icon: <ScanLine className="w-5 h-5" />,
        path: '/gate-entries',
        module: 'gate-entries',
      },
    ],
  },
  {
    label: 'Finance',
    items: [
      {
        id: 'finance',
        label: 'Finance',
        icon: <Wallet className="w-5 h-5" />,
        path: '/finance',
        module: 'finance',
      },
      {
        id: 'payment-plans',
        label: 'Payment Plans',
        icon: <CalendarDays className="w-5 h-5" />,
        path: '/payment-plans',
        module: 'payment-plans',
      },
      {
        id: 'finance-announcements',
        label: 'Announcements',
        icon: <Megaphone className="w-5 h-5" />,
        path: '/finance-announcements',
        module: 'finance',
      },
      {
        id: 'disbursements',
        label: 'Disbursements',
        icon: <Banknote className="w-5 h-5" />,
        path: '/disbursements',
        module: 'disbursements',
      },
    ],
  },
  {
    label: 'HRIS',
    items: [
      {
        id: 'hris-devices',
        label: 'Biometric Devices',
        icon: <Fingerprint className="w-5 h-5" />,
        path: '/hris/devices',
        module: 'biometric-devices',
      },
      {
        id: 'hris-zk-users',
        label: 'ZK Users',
        icon: <Monitor className="w-5 h-5" />,
        path: '/hris/zk-users',
        module: 'zk-users',
      },
      {
        id: 'hris-attendance',
        label: 'Attendance Logs',
        icon: <Clock className="w-5 h-5" />,
        path: '/hris/attendance',
        module: 'attendance-logs',
      },
      {
        id: 'hris-staff-schedules',
        label: 'Staff Schedules',
        icon: <CalendarClock className="w-5 h-5" />,
        path: '/hris/staff-schedules',
        module: 'staff-schedules',
      },
      {
        // Every staff member files their own here, so this stays open to all
        // staff; the approval queue inside is what the permission gates.
        id: 'hris-attendance-requests',
        label: 'Attendance Requests',
        icon: <CalendarCheck className="w-5 h-5" />,
        path: '/hris/attendance-requests',
        staffOnly: true,
      },
      {
        id: 'hris-payroll',
        label: 'Payroll',
        icon: <Banknote className="w-5 h-5" />,
        path: '/hris/payroll',
        module: 'payroll',
      },
      {
        id: 'staffs',
        label: 'Staffs',
        icon: <UserCheck className="w-5 h-5" />,
        path: '/staffs',
        module: 'staffs',
      },
    ],
  },
  {
    label: 'SMS Gateway',
    items: [
      {
        id: 'sms-gateways',
        label: 'Gateways',
        icon: <Smartphone className="w-5 h-5" />,
        path: '/sms/gateways',
        module: 'sms-gateways',
      },
      {
        id: 'sms-messages',
        label: 'Messages',
        icon: <MessageSquare className="w-5 h-5" />,
        path: '/sms/messages',
        module: 'sms-messages',
      },
      {
        id: 'sms-settings',
        label: 'SMS Settings',
        icon: <Settings className="w-5 h-5" />,
        path: '/sms/settings',
        module: 'sms-settings',
      },
    ],
  },
  {
    label: 'Administration',
    items: [
      {
        id: 'users',
        label: 'Users',
        icon: <Users className="w-5 h-5" />,
        path: '/users',
        module: 'users',
      },
      {
        id: 'institutions',
        label: 'Institutions',
        icon: <Building2 className="w-5 h-5" />,
        path: '/institutions',
        module: 'institutions',
      },
      {
        id: 'roles',
        label: 'Roles & Access',
        icon: <Shield className="w-5 h-5" />,
        path: '/roles',
        module: 'roles',
      },
      {
        id: 'subscriptions',
        label: 'Subscriptions',
        icon: <CreditCard className="w-5 h-5" />,
        path: '/subscriptions',
        module: 'subscriptions',
      },
      {
        id: 'departments',
        label: 'Departments',
        icon: <FolderTree className="w-5 h-5" />,
        path: '/departments',
        module: 'departments',
      },
      {
        id: 'tracks-strands',
        label: 'Tracks & Strands',
        icon: <Route className="w-5 h-5" />,
        path: '/tracks-strands',
        module: 'tracks-strands',
      },
      {
        id: 'settings',
        label: 'Settings',
        icon: <Settings className="w-5 h-5" />,
        path: '/settings',
        module: 'settings',
      },
    ],
  },
  {
    label: 'Tools',
    items: [
      {
        id: 'certificate-builder',
        label: 'Certificate Builder',
        icon: <FileText className="w-5 h-5" />,
        path: '/certificate-builder',
        module: 'certificate-builder',
      },
      {
        id: 'form-builder',
        label: 'Form Builder',
        icon: <LayoutTemplate className="w-5 h-5" />,
        path: '/form-builder',
        module: 'form-builder',
      },
      {
        id: 'id-card-builder',
        label: 'Student ID Builder',
        icon: <CreditCard className="w-5 h-5" />,
        path: '/id-card-builder',
        module: 'id-card-builder',
      },
    ],
  },
];

const Sidebar: React.FC<SidebarProps> = ({ onMobileClose }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { user } = useAuth();
  const { can, isStudent } = usePermissions();
  const userRoleSlug = user?.role?.slug;

  const institutionId = user?.user_institutions?.[0]?.institution_id;
  const institutionFromUser = user?.user_institutions?.find((ui: { is_default?: boolean }) => ui.is_default)?.institution
    ?? user?.user_institutions?.[0]?.institution;

  const { data: institutionResponse } = useQuery({
    queryKey: ['institution', institutionId],
    queryFn: () => institutionService.getInstitution(institutionId!),
    enabled: !!institutionId && !institutionFromUser,
  });

  const institution = useMemo(
    () => institutionFromUser ?? institutionResponse?.data,
    [institutionFromUser, institutionResponse?.data],
  );

  const sidebarLabel = institution?.title ?? 'ScholasticCloud';
  const sidebarLogo = institution?.logo;

  // Unread announcement count drives the badge on the Announcements board item.
  const { data: unreadResponse } = useQuery({
    queryKey: ['announcement-unread-count'],
    queryFn: () => announcementService.getUnreadCount(),
    refetchInterval: 60000,
  });
  const unreadCount = unreadResponse?.data?.count ?? 0;

  const filteredGroups = useMemo(() => {
    return menuGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          // Module-gated: shown only when the role can reach it. This mirrors
          // the API — hiding the link is presentation, the endpoint enforces.
          if (item.module) return can(item.module, item.ability ?? 'view');

          // Student-portal items are matched on the role slug; students hold
          // no module permissions.
          if (item.allowedRoles) {
            return userRoleSlug ? item.allowedRoles.includes(userRoleSlug) : false;
          }

          if (item.staffOnly) return !isStudent;

          return true;
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [userRoleSlug, can, isStudent]);

  return (
    <motion.div
      initial={{ x: -250 }}
      animate={{ x: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`bg-white shadow-lg border-r border-gray-200 h-screen flex flex-col lg:relative fixed left-0 top-0 ${
        isCollapsed ? 'w-16' : 'w-64'
      } transition-all duration-300 ease-in-out`}
    >
      {/* Logo Section */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex items-center space-x-2 min-w-0"
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden bg-gray-100">
            {sidebarLogo ? (
              <img
                src={sidebarLogo}
                alt=""
                className="w-full h-full object-contain"
              />
            ) : (
              <span className="text-sm font-bold text-primary-600">
                {sidebarLabel.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          {!isCollapsed && (
            <span className="text-xl font-bold text-gray-900 truncate">
              {sidebarLabel}
            </span>
          )}
        </motion.div>
        <div className="flex items-center space-x-2">
          {/* Mobile close button */}
          {onMobileClose && (
            <button
              onClick={onMobileClose}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors duration-200 cursor-pointer lg:hidden"
            >
              <X className="w-4 h-4 text-gray-600" />
            </button>
          )}
          {/* Desktop collapse button */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors duration-200 cursor-pointer hidden lg:block"
          >
            <Menu className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 py-4 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {filteredGroups.map((group) => (
          <div key={group.label} className="mb-4">
            {/* Group Label */}
            {!isCollapsed && (
              <p className="px-4 mb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400 select-none">
                {group.label}
              </p>
            )}
            {isCollapsed && (
              <div className="mx-3 mb-1 border-t border-gray-100" />
            )}
            <div className="space-y-0.5 px-2">
              {group.items.map((item) => (
                <NavLink
                  key={item.id}
                  to={item.path}
                  end={item.end}
                  onClick={onMobileClose}
                  className={({ isActive }) =>
                    `flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all duration-200 cursor-pointer group ${
                      isActive
                        ? 'bg-primary-50 text-primary-700 border-r-2 border-primary-600'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                    }`
                  }
                >
                  <motion.div
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    className={`flex-shrink-0 ${isCollapsed ? 'mx-auto' : ''}`}
                  >
                    {item.icon}
                  </motion.div>
                  {!isCollapsed && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.1 }}
                      className="font-medium text-sm"
                    >
                      {item.label}
                    </motion.span>
                  )}
                  {item.id === 'announcements-board' && unreadCount > 0 && (
                    <span className="ml-auto inline-flex items-center justify-center rounded-full bg-primary-600 px-1.5 min-w-[1.25rem] h-5 text-[10px] font-semibold text-white">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </motion.div>
  );
};

export default Sidebar;
