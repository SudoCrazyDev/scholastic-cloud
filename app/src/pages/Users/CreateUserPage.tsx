import React, { useState } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '../../components/button';
import { Input } from '../../components/input';
import { Fieldset, Field, Label, ErrorMessage } from '../../components/fieldset';
import { Select } from '../../components/select'; // Assuming this component exists
import { Heading } from '../../components/heading';
import { motion } from 'framer-motion';
import { UserCreatePayload, Role } from 'shared/src/types/user'; // API types
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
// import { Alert } from '../../components/alert'; // For success/error messages

// Mock roles data - in a real app, this would come from an API
const mockRoles: Role[] = [
  { id: '1', name: 'Admin' },
  { id: '2', name: 'Editor' },
  { id: '3', name: 'Viewer' },
];

// Mock API call function
const mockCreateUserApi = async (userData: UserCreatePayload): Promise<UserCreatePayload & { id: string }> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log('Mock API: Creating user', userData);
      resolve({ ...userData, id: Math.random().toString(36).substr(2, 9) });
    }, 1000);
  });
};

const CreateUserPage: React.FC = () => {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const formik = useFormik<UserCreatePayload>({
    initialValues: {
      name: '',
      email: '',
      password: '',
      roleId: '', // Changed from role to roleId to match UserCreatePayload
      // status: 'invited', // Default status, if applicable
    },
    validationSchema: Yup.object({
      name: Yup.string().required('Name is required'),
      email: Yup.string().email('Invalid email address').required('Email is required'),
      password: Yup.string().min(8, 'Password must be at least 8 characters').required('Password is required'),
      roleId: Yup.string().required('Role is required'),
      // status: Yup.string().oneOf(['active', 'invited', 'inactive']).required('Status is required'),
    }),
    onSubmit: async (values, { setSubmitting, resetForm }) => {
      setFormError(null);
      setFormSuccess(null);
      try {
        await mockCreateUserApi(values);
        setFormSuccess('User created successfully! Redirecting to users list...');
        resetForm();
        setTimeout(() => navigate('/users'), 2000);
      } catch (error) {
        setFormError(error instanceof Error ? error.message : 'Failed to create user.');
      } finally {
        setSubmitting(false);
      }
    },
  });

  return (
    <motion.div
      initial={{ opacity: 0, x: -50 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
      className="max-w-2xl mx-auto p-4 sm:p-6 lg:p-8"
    >
      <div className="mb-6">
        <Link to="/users" className="inline-flex items-center text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white">
          <ArrowLeftIcon className="h-5 w-5 mr-2" />
          Back to Users
        </Link>
      </div>
      <Heading level={1} className="mb-6">Create New User</Heading>

      {/* {formError && <Alert variant="error" title="Error" description={formError} onClose={() => setFormError(null)} />}
      {formSuccess && <Alert variant="success" title="Success" description={formSuccess} />} */}
      {/* Simple text alerts for now */}
      {formError && <div className="mb-4 p-3 text-red-700 bg-red-100 rounded">{formError}</div>}
      {formSuccess && <div className="mb-4 p-3 text-green-700 bg-green-100 rounded">{formSuccess}</div>}


      <form onSubmit={formik.handleSubmit} className="space-y-6">
        <Fieldset>
          <Field>
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              name="name"
              type="text"
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              value={formik.values.name}
              aria-invalid={formik.touched.name && !!formik.errors.name}
              aria-describedby="name-error"
            />
            {formik.touched.name && formik.errors.name ? (
              <ErrorMessage id="name-error">{formik.errors.name}</ErrorMessage>
            ) : null}
          </Field>

          <Field>
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              name="email"
              type="email"
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              value={formik.values.email}
              aria-invalid={formik.touched.email && !!formik.errors.email}
              aria-describedby="email-error"
            />
            {formik.touched.email && formik.errors.email ? (
              <ErrorMessage id="email-error">{formik.errors.email}</ErrorMessage>
            ) : null}
          </Field>

          <Field>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              value={formik.values.password}
              aria-invalid={formik.touched.password && !!formik.errors.password}
              aria-describedby="password-error"
            />
            {formik.touched.password && formik.errors.password ? (
              <ErrorMessage id="password-error">{formik.errors.password}</ErrorMessage>
            ) : null}
          </Field>

          <Field>
            <Label htmlFor="roleId">Role</Label>
            <Select
              id="roleId"
              name="roleId"
              value={formik.values.roleId}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              aria-invalid={formik.touched.roleId && !!formik.errors.roleId}
              aria-describedby="roleId-error"
            >
              <option value="" disabled>Select a role</option>
              {mockRoles.map(role => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </Select>
            {formik.touched.roleId && formik.errors.roleId ? (
              <ErrorMessage id="roleId-error">{formik.errors.roleId}</ErrorMessage>
            ) : null}
          </Field>

          {/* Example for status if it were part of UserCreatePayload
          <Field>
            <Label htmlFor="status">Status</Label>
            <Select
              id="status"
              name="status"
              value={formik.values.status}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
            >
              <option value="invited">Invited</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
            {formik.touched.status && formik.errors.status ? (
              <ErrorMessage>{formik.errors.status}</ErrorMessage>
            ) : null}
          </Field>
          */}

        </Fieldset>
        <div className="flex justify-end gap-3">
            <Link to="/users">
                <Button type="button" variant="outline" disabled={formik.isSubmitting}>
                    Cancel
                </Button>
            </Link>
            <Button type="submit" disabled={formik.isSubmitting || !!formSuccess}>
                {formik.isSubmitting ? 'Creating User...' : 'Create User'}
            </Button>
        </div>
      </form>
    </motion.div>
  );
};

export default CreateUserPage;
