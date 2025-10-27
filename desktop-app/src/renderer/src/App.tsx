import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { Login } from './pages/Login';
import { LoadingScreen } from './pages/LoadingScreen';
import { Dashboard } from './pages/Dashboard';
import { GradeManagement } from './pages/GradeManagement';
import './assets/main.css';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
};

function AppContent() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/loading" element={
          <ProtectedRoute>
            <LoadingScreen />
          </ProtectedRoute>
        } />
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/grades" element={
          <ProtectedRoute>
            <GradeManagement />
          </ProtectedRoute>
        } />
        <Route path="/students" element={
          <ProtectedRoute>
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
              <div className="text-center">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Students Module</h1>
                <p className="text-gray-600">Coming Soon</p>
                <a href="#/dashboard" className="mt-4 inline-block text-blue-600 hover:text-blue-700">
                  Back to Dashboard
                </a>
              </div>
            </div>
          </ProtectedRoute>
        } />
        <Route path="/subjects" element={
          <ProtectedRoute>
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
              <div className="text-center">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Subjects Module</h1>
                <p className="text-gray-600">Coming Soon</p>
                <a href="#/dashboard" className="mt-4 inline-block text-blue-600 hover:text-blue-700">
                  Back to Dashboard
                </a>
              </div>
            </div>
          </ProtectedRoute>
        } />
        <Route path="/sections" element={
          <ProtectedRoute>
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
              <div className="text-center">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Sections Module</h1>
                <p className="text-gray-600">Coming Soon</p>
                <a href="#/dashboard" className="mt-4 inline-block text-blue-600 hover:text-blue-700">
                  Back to Dashboard
                </a>
              </div>
            </div>
          </ProtectedRoute>
        } />
      </Routes>
    </Router>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;