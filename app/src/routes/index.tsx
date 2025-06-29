import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import PublicRoute from './PublicRoute';
import PrivateRoute from './PrivateRoute';
import { AuthProvider } from '../contexts/AuthContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Lazily load page components
const LoginPage = lazy(() => import('../pages/LoginPage'));
const DashboardPage = lazy(() => import('../pages/DashboardPage'));
const UsersPage = lazy(() => import('../pages/Users/UsersPage'));
const CreateUserPage = lazy(() => import('../pages/Users/CreateUserPage'));
const EditUserPage = lazy(() => import('../pages/Users/EditUserPage'));
const InstitutionsPage = lazy(() => import('../pages/Institutions/InstitutionsPage'));
const RolesPage = lazy(() => import('../pages/Roles/RolesPage'));
const SubscriptionsPage = lazy(() => import('../pages/Subscriptions/SubscriptionsPage'));
const CreateSubscriptionPage = lazy(() => import('../pages/Subscriptions/CreateSubscriptionPage'));
const EditSubscriptionPage = lazy(() => import('../pages/Subscriptions/EditSubscriptionPage'));

// Placeholder for pages not yet created to avoid import errors
const PlaceholderComponent: React.FC<{ title: string }> = ({ title }) => (
  <div style={{ padding: '20px', border: '1px dashed #ccc', margin: '20px 0' }}>
    <h2>{title}</h2>
    <p>This page is under construction.</p>
  </div>
);

const queryClient = new QueryClient();

const AppRoutes: React.FC = () => {
  return (
    <Router>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <Suspense fallback={<div>Loading...</div>}>
            <Routes>
              <Route element={<PublicRoute />}>
                <Route path="/login" element={<LoginPage />} />
              </Route>
              <Route element={<PrivateRoute />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/users" element={<UsersPage />} />
                <Route path="/users/new" element={<CreateUserPage />} />
                <Route path="/users/edit/:userId" element={<EditUserPage />} />
                <Route path="/institutions" element={<InstitutionsPage />} />
                <Route path="/roles" element={<RolesPage />} />
                <Route path="/subscriptions" element={<SubscriptionsPage />} />
                <Route path="/subscriptions/new" element={<CreateSubscriptionPage />} />
                <Route path="/subscriptions/edit/:subscriptionId" element={<EditSubscriptionPage />} />
                {/* Fallback for private routes */}
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
              </Route>
              {/* Fallback for any other routes */}
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </Suspense>
        </QueryClientProvider>
      </AuthProvider>
    </Router>
  );
};

// Create dummy page components for now to satisfy imports
const createDummyPage = (name: string): React.FC => () => <PlaceholderComponent title={name} />;

// Ensure these files exist with placeholder content if not yet implemented
const dummyPages = {
  '../pages/LoginPage': createDummyPage('Login Page'),
  '../pages/DashboardPage': createDummyPage('Dashboard Page'),
  '../pages/Users/UsersPage': createDummyPage('Users Page'),
  '../pages/Users/CreateUserPage': createDummyPage('Create User Page'),
  '../pages/Users/EditUserPage': createDummyPage('Edit User Page'),
  '../pages/Institutions/InstitutionsPage': createDummyPage('Institutions Page'),
  '../pages/Roles/RolesPage': createDummyPage('Roles Page'),
  '../pages/Subscriptions/SubscriptionsPage': createDummyPage('Subscriptions Page'),
  '../pages/Subscriptions/CreateSubscriptionPage': createDummyPage('Create Subscription Page'),
  '../pages/Subscriptions/EditSubscriptionPage': createDummyPage('Edit Subscription Page'),
};

// This part is conceptual for ensuring files exist.
// In a real scenario, you'd create these files with placeholder content.
// For this environment, we assume these will be created in subsequent steps.

export default AppRoutes;
