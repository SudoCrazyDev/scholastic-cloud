import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import DashboardLayout from './DashboardLayout';

const PrivateLayout = () => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // If user is new, redirect to set new password page
  if (user && user.is_new) {
    return <Navigate to="/set-new-password" replace />;
  }

  return <DashboardLayout />;
};

export default PrivateLayout; 