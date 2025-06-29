import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import SharedLayout from '../layouts/SharedLayout'; // Assuming SharedLayout will be created here

const PrivateRoute: React.FC = () => {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <SharedLayout>
      <Outlet />
    </SharedLayout>
  );
};

export default PrivateRoute;
