import { Outlet } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Sidebar from '../sidebar/Sidebar';
import Topbar from '../topbar/Topbar';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { LogOut } from 'lucide-react';

const DashboardLayout = () => {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const location = useLocation();
  const isCertificateBuilder = location.pathname.startsWith('/certificate-builder');
  const { isImpersonating, user, stopImpersonating } = useAuth();

  // Close mobile sidebar when screen size changes to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) { // lg breakpoint
        setIsMobileSidebarOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile Overlay */}
      {isMobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed lg:relative z-50 ${isMobileSidebarOpen ? 'block' : 'hidden lg:block'}`}>
        <Sidebar onMobileClose={() => setIsMobileSidebarOpen(false)} />
      </div>
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Impersonation banner (super-admin only) */}
        {isImpersonating && (
          <div className="bg-amber-100 border-b border-amber-300 px-4 py-2 flex items-center justify-between gap-4">
            <span className="text-amber-900 text-sm font-medium">
              You are viewing as {user?.first_name} {user?.last_name}
              {user?.email && ` (${user.email})`}.
            </span>
            <button
              type="button"
              onClick={stopImpersonating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Stop impersonating
            </button>
          </div>
        )}
        {/* Topbar */}
        <Topbar onMobileMenuClick={() => setIsMobileSidebarOpen(true)} />
        
        {/* Page Content */}
        {isCertificateBuilder ? (
          <main className="flex-1 overflow-hidden p-0">
            <Outlet />
          </main>
        ) : (
          <main className="flex-1 overflow-y-auto p-6">
            <div className="max-w-7xl mx-auto">
              <Outlet />
            </div>
          </main>
        )}
      </div>
    </div>
  );
};

export default DashboardLayout; 