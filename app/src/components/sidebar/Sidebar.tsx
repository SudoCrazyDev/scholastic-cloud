import React, { useState, useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
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
  Megaphone,
  Send,
  Banknote,
} from 'lucide-react';
import { announcementService } from '../../services/announcementService';

interface MenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  allowedRoles?: string[];
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
        allowedRoles: ['subject-teacher', 'super-administrator', 'principal', 'institution-administrator'],
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
        id: 'my-class-sections',
        label: 'My Class Sections',
        icon: <BookOpen className="w-5 h-5" />,
        path: '/my-class-sections',
        allowedRoles: ['subject-teacher', 'principal', 'institution-administrator'],
      },
      {
        id: 'assigned-subjects',
        label: 'My Assigned Subjects',
        icon: <AssignedSubjectsIcon className="w-5 h-5" />,
        path: '/assigned-subjects',
        allowedRoles: ['subject-teacher', 'principal', 'institution-administrator'],
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
        allowedRoles: ['super-administrator', 'principal', 'institution-administrator'],
      },
      {
        id: 'timetable',
        label: 'Timetable',
        icon: <CalendarDays className="w-5 h-5" />,
        path: '/timetable',
        allowedRoles: ['super-administrator', 'principal', 'institution-administrator'],
      },
      {
        id: 'grade-levels',
        label: 'Grade Levels',
        icon: <ListOrdered className="w-5 h-5" />,
        path: '/grade-levels',
        allowedRoles: ['super-administrator'],
      },
      {
        id: 'grading-scales',
        label: 'Grading Scales',
        icon: <ListChecks className="w-5 h-5" />,
        path: '/grading-scales',
        allowedRoles: ['super-administrator', 'principal', 'institution-administrator'],
      },
      {
        id: 'consolidated-grades',
        label: 'Consolidated Grades',
        icon: <BarChart3 className="w-5 h-5" />,
        path: '/consolidated-grades',
        allowedRoles: ['principal', 'curriculum-head', 'assistant-principal'],
      },
      {
        id: 'proficiency',
        label: 'Proficiency',
        icon: <TrendingUp className="w-5 h-5" />,
        path: '/proficiency',
        allowedRoles: ['principal', 'institution-administrator', 'curriculum-head', 'assistant-principal'],
      },
      {
        id: 'school-days',
        label: 'School Days',
        icon: <Calendar className="w-5 h-5" />,
        path: '/school-days',
        allowedRoles: ['principal', 'institution-administrator'],
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
        allowedRoles: ['super-administrator', 'principal', 'institution-administrator'],
      },
      {
        id: 'admission-forms',
        label: 'Admission Forms',
        icon: <ClipboardList className="w-5 h-5" />,
        path: '/admission-forms',
        allowedRoles: ['principal', 'institution-administrator'],
      },
      {
        id: 'gate-entries',
        label: 'Gate Entries',
        icon: <ScanLine className="w-5 h-5" />,
        path: '/gate-entries',
        allowedRoles: ['super-administrator', 'principal', 'institution-administrator'],
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
        allowedRoles: ['super-administrator', 'principal', 'institution-administrator', 'finance'],
      },
      {
        id: 'payment-plans',
        label: 'Payment Plans',
        icon: <CalendarDays className="w-5 h-5" />,
        path: '/payment-plans',
        allowedRoles: ['super-administrator', 'principal', 'institution-administrator', 'finance'],
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
        allowedRoles: ['principal', 'institution-administrator'],
      },
      {
        id: 'hris-zk-users',
        label: 'ZK Users',
        icon: <Monitor className="w-5 h-5" />,
        path: '/hris/zk-users',
        allowedRoles: ['principal', 'institution-administrator'],
      },
      {
        id: 'hris-attendance',
        label: 'Attendance Logs',
        icon: <Clock className="w-5 h-5" />,
        path: '/hris/attendance',
        allowedRoles: ['principal', 'institution-administrator'],
      },
      {
        id: 'hris-staff-schedules',
        label: 'Staff Schedules',
        icon: <CalendarClock className="w-5 h-5" />,
        path: '/hris/staff-schedules',
        allowedRoles: ['principal', 'institution-administrator'],
      },
      {
        id: 'hris-payroll',
        label: 'Payroll',
        icon: <Banknote className="w-5 h-5" />,
        path: '/hris/payroll',
        allowedRoles: ['principal', 'institution-administrator'],
      },
      {
        id: 'staffs',
        label: 'Staffs',
        icon: <UserCheck className="w-5 h-5" />,
        path: '/staffs',
        allowedRoles: ['super-administrator', 'principal', 'institution-administrator'],
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
        allowedRoles: ['super-administrator'],
      },
      {
        id: 'institutions',
        label: 'Institutions',
        icon: <Building2 className="w-5 h-5" />,
        path: '/institutions',
        allowedRoles: ['super-administrator'],
      },
      {
        id: 'roles',
        label: 'Roles',
        icon: <Shield className="w-5 h-5" />,
        path: '/roles',
        allowedRoles: ['super-administrator'],
      },
      {
        id: 'subscriptions',
        label: 'Subscriptions',
        icon: <CreditCard className="w-5 h-5" />,
        path: '/subscriptions',
        allowedRoles: ['super-administrator'],
      },
      {
        id: 'departments',
        label: 'Departments',
        icon: <FolderTree className="w-5 h-5" />,
        path: '/departments',
        allowedRoles: ['principal', 'institution-administrator'],
      },
      {
        id: 'tracks-strands',
        label: 'Tracks & Strands',
        icon: <Route className="w-5 h-5" />,
        path: '/tracks-strands',
        allowedRoles: ['principal', 'institution-administrator'],
      },
      {
        id: 'settings',
        label: 'Settings',
        icon: <Settings className="w-5 h-5" />,
        path: '/settings',
        allowedRoles: ['principal', 'institution-administrator'],
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
        allowedRoles: ['subject-teacher', 'principal', 'institution-administrator'],
      },
      {
        id: 'form-builder',
        label: 'Form Builder',
        icon: <LayoutTemplate className="w-5 h-5" />,
        path: '/form-builder',
        allowedRoles: ['subject-teacher', 'principal', 'institution-administrator'],
      },
      {
        id: 'id-card-builder',
        label: 'Student ID Builder',
        icon: <CreditCard className="w-5 h-5" />,
        path: '/id-card-builder',
        allowedRoles: ['subject-teacher', 'principal', 'institution-administrator'],
      },
    ],
  },
];

const Sidebar: React.FC<SidebarProps> = ({ onMobileClose }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { user } = useAuth();
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
    if (userRoleSlug === 'finance') {
      return menuGroups.filter((group) => group.label === 'Finance');
    }
    return menuGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (!item.allowedRoles) return true;
          if (!userRoleSlug) return false;
          return item.allowedRoles.includes(userRoleSlug);
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [userRoleSlug]);

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
              <span className="text-sm font-bold text-indigo-600">
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
                        ? 'bg-indigo-50 text-indigo-700 border-r-2 border-indigo-600'
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
                    <span className="ml-auto inline-flex items-center justify-center rounded-full bg-indigo-600 px-1.5 min-w-[1.25rem] h-5 text-[10px] font-semibold text-white">
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
