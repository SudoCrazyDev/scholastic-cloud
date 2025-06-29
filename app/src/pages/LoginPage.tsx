import React, { useState } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
// import axios from 'axios'; // Commented out for now, using mock
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/button';
import { Input } from '../components/input';
import { Fieldset, Field, Label, ErrorMessage } from '../components/fieldset';
import { Alert as HeadlessUiAlert, AlertActions, AlertDescription, AlertTitle } from '../components/alert'; // Renamed to avoid conflict
import { AuthLayout } from '../components/auth-layout';
import { motion } from 'framer-motion';
import { UserLoginCredentials } from 'shared/src/types/auth';

// Simple Alert component for inline messages (not modal)
const SimpleAlert: React.FC<{variant?: 'error' | 'success', title: string, description: string, onClose?: () => void}> = ({ variant = 'error', title, description, onClose }) => {
  const baseClasses = "p-4 mb-4 text-sm rounded-lg";
  const variantClasses = variant === 'error'
    ? "bg-red-100 text-red-700 dark:bg-red-200 dark:text-red-800"
    : "bg-green-100 text-green-700 dark:bg-green-200 dark:text-green-800";

  return (
    <div className={`${baseClasses} ${variantClasses}`} role="alert">
      <span className="font-medium">{title}</span> {description}
      {onClose && (
        <button type="button" className="ml-auto -mx-1.5 -my-1.5 rounded-lg p-1.5 inline-flex h-8 w-8" onClick={onClose} aria-label="Close">
          <span className="sr-only">Close</span>
          <svg className="w-3 h-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14">
            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"/>
          </svg>
        </button>
      )}
    </div>
  );
};


// Mock API call function
const mockLoginApi = async (values: UserLoginCredentials): Promise<{ token: string }> => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (values.email === 'test@example.com' && values.password === 'password') {
        resolve({ token: 'fake-jwt-token' });
      } else {
        reject(new Error('Invalid credentials. Try test@example.com and password.'));
      }
    }, 1000);
  });
};

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const formik = useFormik<UserLoginCredentials>({
    initialValues: {
      email: '',
      password: '',
    },
    validationSchema: Yup.object({
      email: Yup.string().email('Invalid email address').required('Required'),
      password: Yup.string().min(8, 'Password must be at least 8 characters').required('Required'),
    }),
    onSubmit: async (values, { setSubmitting }) => {
      setError(null);
      setSuccess(null);
      try {
        // const response = await axios.post('/api/auth/login', values); // Real API call
        const response = await mockLoginApi(values); // Mock API call
        login(response.token);
        setSuccess('Login successful! Redirecting to dashboard...');
        setTimeout(() => navigate('/dashboard'), 1500);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred during login.');
      } finally {
        setSubmitting(false);
      }
    },
  });

  return (
    <AuthLayout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md space-y-6" // Reduced space-y-8 to space-y-6
      >
        <div className="text-center"> {/* Centered the logo and title */}
          <svg className="mx-auto h-10 w-auto text-indigo-600" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"> {/* Reduced logo size */}
            <path
              fillRule="evenodd"
              d="M11.25 4.5A6.75 6.75 0 1018 11.25a.75.75 0 01-1.5 0A5.25 5.25 0 116.75 6h.523a.75.75 0 01.624.931l-.601 2.548a.75.75 0 01-1.46-.348l.417-1.756A6.723 6.723 0 004.5 11.25c0 3.728 3.022 6.75 6.75 6.75s6.75-3.022 6.75-6.75a.75.75 0 011.5 0A8.25 8.25 0 112.972 7.618a.75.75 0 01.624-.932l2.551-.601A.75.75 0 016.75 6H11.25V4.5z"
              clipRule="evenodd"
            />
          </svg>
          <h2 className="mt-4 text-2xl font-bold tracking-tight text-gray-900 dark:text-white"> {/* Adjusted heading style */}
            Sign in to your account
          </h2>
        </div>

        {error && (
          <SimpleAlert
            variant="error"
            title="Login Failed!"
            description={error}
            onClose={() => setError(null)}
          />
        )}

        {success && (
           <SimpleAlert
            variant="success"
            title="Success!"
            description={success}
          />
        )}

        <form onSubmit={formik.handleSubmit} className="space-y-6">
          <Fieldset>
            <Field>
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                value={formik.values.email}
                className={formik.touched.email && formik.errors.email ? 'border-red-500' : ''}
                aria-invalid={formik.touched.email && !!formik.errors.email}
                aria-describedby="email-error"
              />
              {formik.touched.email && formik.errors.email ? (
                <ErrorMessage id="email-error" className="mt-1 text-xs text-red-600">{formik.errors.email}</ErrorMessage>
              ) : null}
            </Field>
            <Field>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                value={formik.values.password}
                className={formik.touched.password && formik.errors.password ? 'border-red-500' : ''}
                aria-invalid={formik.touched.password && !!formik.errors.password}
                aria-describedby="password-error"
              />
              {formik.touched.password && formik.errors.password ? (
                <ErrorMessage id="password-error" className="mt-1 text-xs text-red-600">{formik.errors.password}</ErrorMessage>
              ) : null}
            </Field>
          </Fieldset>
          <div>
            <Button type="submit" disabled={formik.isSubmitting || !!success} className="w-full">
              {formik.isSubmitting ? 'Signing in...' : 'Sign in'}
            </Button>
          </div>
        </form>
      </motion.div>
    </AuthLayout>
  );
};

export default LoginPage;
