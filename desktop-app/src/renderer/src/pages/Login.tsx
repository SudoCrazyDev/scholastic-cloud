import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Formik, Form, Field } from 'formik';
import * as Yup from 'yup';
import { User, Lock, Wifi, WifiOff, AlertCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

const validationSchema = Yup.object({
  email: Yup.string()
    .email('Invalid email address')
    .required('Email is required'),
  password: Yup.string()
    .min(6, 'Password must be at least 6 characters')
    .required('Password is required'),
  apiUrl: Yup.string()
    .url('Invalid URL')
    .required('API URL is required')
});

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const isOnline = useOnlineStatus();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (values: any) => {
    setError(null);
    setIsLoading(true);
    
    try {
      const result = await window.api.auth.login(
        values.email,
        values.password,
        values.apiUrl
      );
      
      if (result.success) {
        login(result.user, result.token);
        
        // If online and first login, fetch initial data
        if (result.isOnline && !localStorage.getItem('initialDataFetched')) {
          navigate('/loading');
        } else {
          navigate('/dashboard');
        }
      } else {
        setError('Invalid credentials');
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md"
      >
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Scholastic Desktop
          </h1>
          <p className="text-gray-600">Sign in to continue</p>
          
          <div className="mt-4 flex items-center justify-center">
            {isOnline ? (
              <div className="flex items-center text-green-600">
                <Wifi className="w-4 h-4 mr-2" />
                <span className="text-sm">Online Mode</span>
              </div>
            ) : (
              <div className="flex items-center text-orange-600">
                <WifiOff className="w-4 h-4 mr-2" />
                <span className="text-sm">Offline Mode</span>
              </div>
            )}
          </div>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center text-red-700"
          >
            <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </motion.div>
        )}

        <Formik
          initialValues={{
            email: localStorage.getItem('lastEmail') || '',
            password: '',
            apiUrl: localStorage.getItem('apiUrl') || 'http://localhost:3000/api'
          }}
          validationSchema={validationSchema}
          onSubmit={handleSubmit}
        >
          {({ errors, touched }) => (
            <Form className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <Field
                    name="email"
                    type="email"
                    className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.email && touched.email
                        ? 'border-red-500'
                        : 'border-gray-300'
                    }`}
                    placeholder="teacher@school.edu"
                  />
                </div>
                {errors.email && touched.email && (
                  <p className="mt-1 text-xs text-red-500">{errors.email}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <Field
                    name="password"
                    type="password"
                    className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.password && touched.password
                        ? 'border-red-500'
                        : 'border-gray-300'
                    }`}
                    placeholder="••••••••"
                  />
                </div>
                {errors.password && touched.password && (
                  <p className="mt-1 text-xs text-red-500">{errors.password}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  API Server URL
                </label>
                <Field
                  name="apiUrl"
                  type="url"
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.apiUrl && touched.apiUrl
                      ? 'border-red-500'
                      : 'border-gray-300'
                  }`}
                  placeholder="https://api.school.edu"
                />
                {errors.apiUrl && touched.apiUrl && (
                  <p className="mt-1 text-xs text-red-500">{errors.apiUrl}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {isLoading ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
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
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </button>
            </Form>
          )}
        </Formik>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            {isOnline 
              ? 'Connected to server. Data will be synced automatically.'
              : 'Working offline. Data will be synced when connection is restored.'}
          </p>
        </div>
      </motion.div>
    </div>
  );
};