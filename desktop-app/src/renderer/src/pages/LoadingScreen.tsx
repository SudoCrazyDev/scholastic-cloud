import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Download, CheckCircle, AlertCircle, Database, Users, BookOpen, School } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface LoadingStep {
  id: string;
  label: string;
  icon: React.ReactNode;
  status: 'pending' | 'loading' | 'completed' | 'error';
  count?: number;
  error?: string;
}

export const LoadingScreen: React.FC = () => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [steps, setSteps] = useState<LoadingStep[]>([
    {
      id: 'sections',
      label: 'Fetching class sections',
      icon: <School className="w-5 h-5" />,
      status: 'pending'
    },
    {
      id: 'subjects',
      label: 'Fetching subjects',
      icon: <BookOpen className="w-5 h-5" />,
      status: 'pending'
    },
    {
      id: 'students',
      label: 'Fetching students',
      icon: <Users className="w-5 h-5" />,
      status: 'pending'
    },
    {
      id: 'assignments',
      label: 'Setting up assignments',
      icon: <Database className="w-5 h-5" />,
      status: 'pending'
    }
  ]);
  const [overallProgress, setOverallProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    const apiUrl = localStorage.getItem('apiUrl') || 'http://localhost:3000/api';
    
    try {
      // Update step status
      const updateStep = (id: string, status: LoadingStep['status'], count?: number, error?: string) => {
        setSteps(prev => prev.map(step => 
          step.id === id 
            ? { ...step, status, count, error }
            : step
        ));
      };

      // Start fetching data
      updateStep('sections', 'loading');
      setOverallProgress(10);

      const result = await window.api.sync.importInitialData(apiUrl, token);
      
      if (result.success) {
        // Update steps based on results
        updateStep('sections', 'completed', result.sections);
        setOverallProgress(30);
        
        updateStep('subjects', result.subjects > 0 ? 'completed' : 'error', result.subjects);
        setOverallProgress(50);
        
        updateStep('students', result.students > 0 ? 'completed' : 'error', result.students);
        setOverallProgress(70);
        
        updateStep('assignments', result.assignments > 0 ? 'completed' : 'error', result.assignments);
        setOverallProgress(100);
        
        // Mark initial data as fetched
        localStorage.setItem('initialDataFetched', 'true');
        localStorage.setItem('lastSync', new Date().toISOString());
        
        // Navigate to dashboard after a short delay
        setTimeout(() => {
          navigate('/dashboard');
        }, 1500);
      } else {
        throw new Error('Failed to fetch initial data');
      }
    } catch (err: any) {
      console.error('Error fetching initial data:', err);
      setError(err.message || 'Failed to fetch initial data');
      
      // Update all pending steps to error
      setSteps(prev => prev.map(step => 
        step.status === 'pending' || step.status === 'loading'
          ? { ...step, status: 'error', error: err.message }
          : step
      ));
    }
  };

  const handleSkip = () => {
    localStorage.setItem('initialDataFetched', 'true');
    navigate('/dashboard');
  };

  const handleRetry = () => {
    setError(null);
    setOverallProgress(0);
    setSteps(prev => prev.map(step => ({ ...step, status: 'pending', count: undefined, error: undefined })));
    fetchInitialData();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-2xl"
      >
        <div className="text-center mb-8">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="inline-block mb-4"
          >
            <Download className="w-12 h-12 text-blue-600" />
          </motion.div>
          
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Setting Up Your Workspace
          </h1>
          <p className="text-gray-600">
            We're downloading your data for offline use. This may take a few moments.
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>Progress</span>
            <span>{Math.round(overallProgress)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-600"
              initial={{ width: 0 }}
              animate={{ width: `${overallProgress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>

        {/* Loading Steps */}
        <div className="space-y-4 mb-8">
          {steps.map((step) => (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div className="flex items-center space-x-3">
                <div className={`
                  ${step.status === 'completed' ? 'text-green-600' : ''}
                  ${step.status === 'loading' ? 'text-blue-600' : ''}
                  ${step.status === 'error' ? 'text-red-600' : ''}
                  ${step.status === 'pending' ? 'text-gray-400' : ''}
                `}>
                  {step.icon}
                </div>
                <div>
                  <p className="font-medium text-gray-900">{step.label}</p>
                  {step.error && (
                    <p className="text-xs text-red-600 mt-1">{step.error}</p>
                  )}
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                {step.count !== undefined && step.count > 0 && (
                  <span className="text-sm text-gray-600 bg-white px-2 py-1 rounded">
                    {step.count} items
                  </span>
                )}
                
                {step.status === 'completed' && (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                )}
                {step.status === 'loading' && (
                  <svg
                    className="animate-spin h-5 w-5 text-blue-600"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                )}
                {step.status === 'error' && (
                  <AlertCircle className="w-5 h-5 text-red-600" />
                )}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Error State */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg"
          >
            <div className="flex items-start">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-900">
                  Setup Failed
                </p>
                <p className="text-sm text-red-700 mt-1">
                  {error}
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Actions */}
        <div className="flex justify-between">
          <button
            onClick={handleSkip}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            Skip Setup
          </button>
          
          {error ? (
            <button
              onClick={handleRetry}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Retry
            </button>
          ) : overallProgress === 100 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-green-600 font-medium flex items-center"
            >
              <CheckCircle className="w-5 h-5 mr-2" />
              Setup Complete!
            </motion.div>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
};