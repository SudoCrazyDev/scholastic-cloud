import React, { ReactNode } from 'react';
import { Sidebar, SidebarBody, SidebarHeader, SidebarItem, SidebarLabel, SidebarSection } from '../components/sidebar'; // Assuming this path is correct
import { Navbar, NavbarItem, NavbarSection, NavbarSpacer } from '../components/navbar'; // Assuming this path is correct
import { Avatar } from '../components/avatar'; // Assuming this path is correct
import { HomeIcon, UsersIcon, BuildingOfficeIcon, ShieldCheckIcon, DocumentTextIcon, Cog6ToothIcon, ArrowLeftStartOnRectangleIcon } from '@heroicons/react/24/outline'; // Example icons
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

interface SharedLayoutProps {
  children: ReactNode;
}

const SharedLayout: React.FC<SharedLayoutProps> = ({ children }) => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar>
        <SidebarHeader>
          {/* You can add a logo here */}
          <svg className="h-8 w-auto text-indigo-600" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M11.25 4.5A6.75 6.75 0 1018 11.25a.75.75 0 01-1.5 0A5.25 5.25 0 116.75 6h.523a.75.75 0 01.624.931l-.601 2.548a.75.75 0 01-1.46-.348l.417-1.756A6.723 6.723 0 004.5 11.25c0 3.728 3.022 6.75 6.75 6.75s6.75-3.022 6.75-6.75a.75.75 0 011.5 0A8.25 8.25 0 112.972 7.618a.75.75 0 01.624-.932l2.551-.601A.75.75 0 016.75 6H11.25V4.5z"
              clipRule="evenodd"
            />
          </svg>
        </SidebarHeader>
        <SidebarBody>
          <SidebarSection>
            <SidebarItem href="/dashboard" current>
              <HomeIcon className="h-5 w-5" />
              <SidebarLabel>Dashboard</SidebarLabel>
            </SidebarItem>
            <SidebarItem href="/users">
              <UsersIcon className="h-5 w-5" />
              <SidebarLabel>Users</SidebarLabel>
            </SidebarItem>
            <SidebarItem href="/institutions">
              <BuildingOfficeIcon className="h-5 w-5" />
              <SidebarLabel>Institutions</SidebarLabel>
            </SidebarItem>
            <SidebarItem href="/roles">
              <ShieldCheckIcon className="h-5 w-5" />
              <SidebarLabel>Roles</SidebarLabel>
            </SidebarItem>
            <SidebarItem href="/subscriptions">
              <DocumentTextIcon className="h-5 w-5" />
              <SidebarLabel>Subscriptions</SidebarLabel>
            </SidebarItem>
          </SidebarSection>
          <SidebarSection className="mt-auto">
             <SidebarItem href="/settings"> {/* Assuming a settings page might exist */}
              <Cog6ToothIcon className="h-5 w-5" />
              <SidebarLabel>Settings</SidebarLabel>
            </SidebarItem>
            <SidebarItem onClick={handleLogout} href="#">
              <ArrowLeftStartOnRectangleIcon className="h-5 w-5" />
              <SidebarLabel>Logout</SidebarLabel>
            </SidebarItem>
          </SidebarSection>
        </SidebarBody>
      </Sidebar>

      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar>
          <NavbarSpacer />
          <NavbarSection>
            <NavbarItem href="/profile"> {/* Assuming a profile page might exist */}
              <Avatar src="/placeholder-avatar.jpg" alt="User Avatar" />
            </NavbarItem>
          </NavbarSection>
        </Navbar>

        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 p-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
};

export default SharedLayout;
