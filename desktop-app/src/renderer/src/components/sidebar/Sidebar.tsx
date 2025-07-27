import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  LayoutDashboard, 
  Menu,
  Lock,
  X
} from 'lucide-react';

interface MenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
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
];

const Sidebar: React.FC<SidebarProps> = ({ onMobileClose }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

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
            <span className="text-xl font-bold text-gray-900">Scholastic</span>
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
        {menuItems.map((item) => (
          <motion.button
            key={item.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onMobileClose} // Close mobile sidebar when clicking a link
            className="flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all duration-200 cursor-pointer group w-full text-left bg-indigo-50 text-indigo-700 border-r-2 border-indigo-600"
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
          </motion.button>
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
            Desktop v1.0.0
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

export default Sidebar; 