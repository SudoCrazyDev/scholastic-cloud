import "./App.css";
import { useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { Login } from "@/pages/Login";
import { LoadingScreen } from "@/pages/LoadingScreen";
import { Dashboard } from "@/pages/Dashboard";
import { MyClassSections } from "@/pages/MyClassSections";
import { AssignedSubjects } from "@/pages/AssignedSubjects";
import { ClassSectionDetail } from "@/pages/ClassSectionDetail";
import { AppLayout } from "@/components/layout/AppLayout";
import { Fab } from "@/components";
import { DebugDatabase } from "@/pages/DebugDatabase";

// Check if we're in development/local environment
// Vite automatically sets DEV to true in dev mode, false in production
const isDev = import.meta.env.DEV;

function App() {
  const [isDebugModalOpen, setIsDebugModalOpen] = useState(false);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/loading" element={<LoadingScreen />} />
        <Route
          path="/dashboard"
          element={
            <AppLayout>
              <Dashboard />
            </AppLayout>
          }
        />
        <Route
          path="/my-class-sections"
          element={
            <AppLayout>
              <MyClassSections />
            </AppLayout>
          }
        />
        <Route
          path="/my-class-sections/:id"
          element={
            <AppLayout>
              <ClassSectionDetail />
            </AppLayout>
          }
        />
        <Route
          path="/assigned-subjects"
          element={
            <AppLayout>
              <AssignedSubjects />
            </AppLayout>
          }
        />
      </Routes>
      {/* Floating Action Button for Debug DB - only visible in dev mode */}
      {isDev && <Fab onClick={() => setIsDebugModalOpen(true)} />}
      {/* Debug Database Modal - only available in development */}
      {isDev && (
        <DebugDatabase 
          isOpen={isDebugModalOpen} 
          onClose={() => setIsDebugModalOpen(false)} 
        />
      )}
    </Router>
  );
}

export default App;
