import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { downloadCurrentUserInstitution } from "@/lib/downloadInstitution";
import { downloadCurrentUserClassSections } from "@/lib/downloadClassSections";
import { downloadCurrentUserAssignedLoads } from "@/lib/downloadAssignedLoads";
import { downloadStudentsForClassSections } from "@/lib/downloadStudents";
import { downloadEcrData } from "@/lib/downloadEcrData";
import { downloadStudentRunningGrades } from "@/lib/downloadRunningGrades";

export function LoadingScreen() {
  const navigate = useNavigate();
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("Initializing...");
  const [error, setError] = useState(null);

  useEffect(() => {
    async function downloadData() {
      try {
        // Step 1: Download Institution
        setCurrentStep("Downloading institution data...");
        setProgress(10);
        
        const institutionResult = await downloadCurrentUserInstitution();
        
        if (!institutionResult.success) {
          setError(institutionResult.error || "Failed to download institution data");
          setProgress(0);
          return;
        }

        // Step 2: Download Class Sections
        setCurrentStep("Downloading class sections...");
        setProgress(20);
        
        const classSectionsResult = await downloadCurrentUserClassSections();
        
        if (!classSectionsResult.success) {
          setError(classSectionsResult.error || "Failed to download class sections");
          setProgress(0);
          return;
        }

        // Step 3: Download Assigned Loads (subjects, cascading to class_sections and users)
        setCurrentStep("Downloading assigned loads...");
        setProgress(40);
        
        const assignedLoadsResult = await downloadCurrentUserAssignedLoads();
        
        if (!assignedLoadsResult.success) {
          setError(assignedLoadsResult.error || "Failed to download assigned loads");
          setProgress(0);
          return;
        }

        // Step 4: Download Students for Class Sections
        setCurrentStep("Downloading students...");
        setProgress(60);
        
        const studentsResult = await downloadStudentsForClassSections();
        
        if (!studentsResult.success) {
          setError(studentsResult.error || "Failed to download students");
          setProgress(0);
          return;
        }

        // Step 5: Download ECR Data
        setCurrentStep("Downloading ECR data...");
        setProgress(75);
        
        const ecrResult = await downloadEcrData();
        
        if (!ecrResult.success) {
          setError(ecrResult.error || "Failed to download ECR data");
          setProgress(0);
          return;
        }

        // Step 6: Download Running Grades
        setCurrentStep("Downloading running grades...");
        setProgress(90);
        
        const gradesResult = await downloadStudentRunningGrades();
        
        if (!gradesResult.success) {
          setError(gradesResult.error || "Failed to download running grades");
          setProgress(0);
          return;
        }

        // Step 7: Complete
        setCurrentStep("Setup complete!");
        setProgress(100);
        
        // Navigate to dashboard after a short delay
        setTimeout(() => {
          navigate("/dashboard");
        }, 1000);
      } catch (err) {
        setError(err.message || "An unexpected error occurred");
        setProgress(0);
      }
    }

    downloadData();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center space-y-4">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
            className="mx-auto h-12 w-12 bg-indigo-600 rounded-full flex items-center justify-center"
          >
            <svg
              className="h-6 w-6 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6v6l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </motion.div>
          <h2 className="text-2xl font-bold text-gray-900">
            Preparing your workspace
          </h2>
          <p className="text-sm text-gray-600">
            {currentStep}
          </p>
        </div>

        {/* Progress bar */}
        <div className="space-y-3">
          <div className="w-full bg-white/60 rounded-full h-3 shadow-inner overflow-hidden border border-indigo-100">
            <motion.div
              className="h-3 bg-gradient-to-r from-indigo-500 via-blue-500 to-indigo-500"
              initial={{ width: "0%" }}
              animate={{ width: `${progress}%` }}
              transition={{
                duration: 0.5,
                ease: "easeOut",
              }}
            />
          </div>
          <p className="text-xs text-gray-500 text-center">
            {error ? (
              <span className="text-red-600">{error}</span>
            ) : (
              "Syncing data… please keep the app open."
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

