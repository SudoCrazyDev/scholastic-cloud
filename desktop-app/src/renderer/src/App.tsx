import React, { useState, useEffect } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import DashboardLayout from './components/layouts/DashboardLayout';
import UnauthorizedRole from './pages/UnauthorizedRole';
import { authService } from './services/authService';

type AppState = 'loading' | 'login' | 'dashboard' | 'unauthorized';

function App(): React.JSX.Element {
  const [appState, setAppState] = useState<AppState>('loading');
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      const response = await authService.initialize();
      
      if (response.success && response.user) {
        setCurrentUser(response.user);
        
        // Check if user has subject-teacher role
        if (authService.isSubjectTeacher()) {
          setAppState('dashboard');
        } else {
          setAppState('unauthorized');
        }
      } else {
        setAppState('login');
      }
    } catch (error) {
      console.error('App initialization error:', error);
      setAppState('login');
    }
  };

  const handleLogin = (user: any) => {
    setCurrentUser(user);
    
    // Check if user has subject-teacher role
    if (authService.isSubjectTeacher()) {
      setAppState('dashboard');
    } else {
      setAppState('unauthorized');
    }
  };

  const handleLogout = async () => {
    await authService.logout();
    setCurrentUser(null);
    setAppState('login');
  };

  // Show loading state
  if (appState === 'loading') {
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

  // Show dashboard for subject-teacher users
  return (
    <DashboardLayout onLogout={handleLogout}>
      <Dashboard />
    </DashboardLayout>
  );
}

export default App;
