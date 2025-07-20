import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import { 
  LayoutDashboard, 
  Users, 
  Building2, 
  Shield, 
  CreditCard,
  Menu,
  Lock,
  GraduationCap,
  UserCheck,
  GraduationCap as StudentsIcon,
  BookOpen,
  BookOpen as AssignedSubjectsIcon,
  Clock,

  X
} from 'lucide-react';

interface MenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  allowedRoles?: string[];
}

interface SidebarProps {
  onMobileClose?: () => void;
}

const menuItems: MenuItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard className="w-5 h-5" />,
    path: '/dashboard',
  },
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
    id: 'class-sections',
    label: 'Class Sections',
    icon: <GraduationCap className="w-5 h-5" />,
    path: '/class-sections',
    allowedRoles: ['super-administrator', 'principal', 'institution-administrator'],
  },
  {
    id: 'staffs',
    label: 'Staffs',
    icon: <UserCheck className="w-5 h-5" />,
    path: '/staffs',
    allowedRoles: ['super-administrator', 'principal', 'institution-administrator'],
  },
  {
    id: 'students',
    label: 'Students',
    icon: <StudentsIcon className="w-5 h-5" />,
    path: '/students',
    allowedRoles: ['super-administrator', 'principal', 'institution-administrator'],
  },
  {
    id: 'teacher-attendance',
    label: 'Teacher Attendance',
    icon: <Clock className="w-5 h-5" />,
    path: '/teacher-attendance',
    allowedRoles: ['super-administrator', 'principal', 'institution-administrator'],
  },

];

const Sidebar: React.FC<SidebarProps> = ({ onMobileClose }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { user } = useAuth();
  const userRoleSlug = user?.role?.slug;

  // Filter menu items by allowedRoles
  const filteredMenuItems = menuItems.filter((item) => {
    if (!item.allowedRoles) return true; // visible to all
    if (!userRoleSlug) return false; // no role, hide
    return item.allowedRoles.includes(userRoleSlug);
  });

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
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        {!isCollapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex items-center space-x-2"
          >
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Lock className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">ScholasticCloud</span>
          </motion.div>
        )}
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
      <nav className="flex-1 p-4 space-y-2">
        {filteredMenuItems.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            onClick={onMobileClose} // Close mobile sidebar when clicking a link
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
              className={`flex-shrink-0 ${
                isCollapsed ? 'mx-auto' : ''
              }`}
            >
              {item.icon}
            </motion.div>
            {!isCollapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="font-medium"
              >
                {item.label}
              </motion.span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom Section */}
      <div className="p-4 border-t border-gray-200">
        {!isCollapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-xs text-gray-500 text-center"
          >
            v1.0.0
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

export default Sidebar; 