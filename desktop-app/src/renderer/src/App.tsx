import React, { useState, useEffect } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import DashboardLayout from './components/layouts/DashboardLayout';
import UnauthorizedRole from './pages/UnauthorizedRole';
import { useAuth } from './hooks/useAuth';
import { AuthProvider } from './providers/AuthProvider';
import { authService } from './services/authService';
import InitialSync from './pages/InitialSync';
import OfflineGrades from './pages/OfflineGrades';

type AppState = 'loading' | 'login' | 'initial-sync' | 'dashboard' | 'unauthorized';

function AppContent(): React.JSX.Element {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [appState, setAppState] = useState<AppState>('loading');

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated && user) {
        if (authService.isSubjectTeacher()) {
          setAppState('initial-sync');
        } else {
          setAppState('unauthorized');
        }
      } else {
        setAppState('login');
      }
    }
  }, [isAuthenticated, user, isLoading]);

  const handleLogin = (_loginData: any) => {
    // The login is handled by the AuthProvider
    // This callback is called after successful login
    if (authService.isSubjectTeacher()) {
      setAppState('dashboard');
    } else {
      setAppState('unauthorized');
    }
  };

  const handleLogout = async () => {
    await authService.logout();
    setAppState('login');
  };

  // Show loading state
  if (isLoading || appState === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login page
  if (appState === 'login') {
    return <Login onLogin={handleLogin} />;
  }

  // Show unauthorized page
  if (appState === 'unauthorized') {
    return <UnauthorizedRole onLogout={handleLogout} />;
  }

  if (appState === 'initial-sync') {
    return <InitialSync onDone={() => setAppState('dashboard')} />;
  }

  // Simple hash-based routing for two pages
  const hash = typeof window !== 'undefined' ? window.location.hash : '';
  const route = hash.replace('#', '') || '/dashboard';
  const Page = route === '/offline-grades' ? <OfflineGrades /> : <Dashboard />;

  return (
    <DashboardLayout onLogout={handleLogout}>
      {Page}
    </DashboardLayout>
  );
}

function App(): React.JSX.Element {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
