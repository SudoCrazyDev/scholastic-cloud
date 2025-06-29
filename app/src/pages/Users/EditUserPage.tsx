import React, { useState, useEffect } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Button } from '../../components/button';
import { Input } from '../../components/input';
import { Fieldset, Field, Label, ErrorMessage } from '../../components/fieldset';
import { Select } from '../../components/select';
import { Heading } from '../../components/heading';
import { motion } from 'framer-motion';
import { User, UserUpdatePayload, Role } from 'shared/src/types/user'; // API types
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

// Mock roles data
const mockRoles: Role[] = [
  { id: '1', name: 'Admin' },
  { id: '2', name: 'Editor' },
  { id: '3', name: 'Viewer' },
];

// Mock users data to find a user by ID
const mockUsers: User[] = [
  { id: '1', name: 'Alice Wonderland', email: 'alice@example.com', status: 'active', role: { id: '1', name: 'Admin' }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: '2', name: 'Bob The Builder', email: 'bob@example.com', status: 'invited', role: { id: '2', name: 'Editor' }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

// Mock API call functions
const mockGetUserByIdApi = async (userId: string): Promise<User | undefined> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const user = mockUsers.find(u => u.id === userId);
      console.log('Mock API: Fetching user by ID', userId, user);
      resolve(user);
    }, 500);
  });
};

const mockUpdateUserApi = async (userId: string, userData: UserUpdatePayload): Promise<User> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log('Mock API: Updating user', userId, userData);
      const userIndex = mockUsers.findIndex(u => u.id === userId);
      if (userIndex !== -1) {
        // This is a shallow update for mock purposes
        const updatedUser = { ...mockUsers[userIndex], ...userData, updatedAt: new Date().toISOString() } as User;
         if(userData.roleId) {
            const role = mockRoles.find(r => r.id === userData.roleId);
            if(role) updatedUser.role = role;
        }
        mockUsers[userIndex] = updatedUser;
        resolve(updatedUser);
      } else {
        throw new Error("User not found");
      }
    }, 1000);
  });
};


const EditUserPage: React.FC = () => {
  const navigate = useNavigate();
  const { userId } = useParams<{ userId: string }>();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const formik = useFormik<UserUpdatePayload>({
    initialValues: {
      name: '',
      email: '',
      roleId: '',
      status: 'active', // Default or fetched status
    },
    enableReinitialize: true, // Important for re-initializing form with fetched data
    validationSchema: Yup.object({
      name: Yup.string().required('Name is required'),
      email: Yup.string().email('Invalid email address').required('Email is required'),
      roleId: Yup.string().required('Role is required'),
      status: Yup.string().oneOf(['active', 'invited', 'inactive', 'archived', undefined] as const).required('Status is required'),
    }),
    onSubmit: async (values, { setSubmitting }) => {
      if (!userId) return;
      setFormError(null);
      setFormSuccess(null);
      try {
        await mockUpdateUserApi(userId, values);
        setFormSuccess('User updated successfully! Redirecting to users list...');
        setTimeout(() => navigate('/users'), 2000);
      } catch (error) {
        setFormError(error instanceof Error ? error.message : 'Failed to update user.');
      } finally {
        setSubmitting(false);
      }
    },
  });

  useEffect(() => {
    if (userId) {
      const fetchUser = async () => {
        setIsLoading(true);
        try {
          const fetchedUser = await mockGetUserByIdApi(userId);
          if (fetchedUser) {
            setUser(fetchedUser);
            // Set formik initial values after fetching user data
            formik.setValues({
              name: fetchedUser.name,
              email: fetchedUser.email,
              roleId: fetchedUser.role?.id || '',
              status: fetchedUser.status || 'active',
            });
          } else {
            setFormError('User not found.');
          }
        } catch (error) {
          setFormError('Failed to fetch user data.');
        } finally {
          setIsLoading(false);
        }
      };
      fetchUser();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]); // formik is not added to dependency array to avoid re-running effect on formik instance change

  if (isLoading) {
    return <div className="text-center py-10">Loading user data...</div>;
  }

  if (!user && !isLoading) {
     return (
        <div className="text-center py-10 max-w-2xl mx-auto">
            <Heading level={2} className="mb-4">User Not Found</Heading>
            <p className="mb-6">{formError || "The user you are looking for does not exist or could not be loaded."}</p>
            <Link to="/users">
                <Button variant="outline">
                    <ArrowLeftIcon className="h-5 w-5 mr-2" />
                    Back to Users List
                </Button>
            </Link>
        </div>
     );
  }


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
      <Heading level={1} className="mb-6">Edit User: {user?.name}</Heading>

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
            />
            {formik.touched.name && formik.errors.name ? (
              <ErrorMessage>{formik.errors.name}</ErrorMessage>
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
            />
            {formik.touched.email && formik.errors.email ? (
              <ErrorMessage>{formik.errors.email}</ErrorMessage>
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
            >
              <option value="" disabled>Select a role</option>
              {mockRoles.map(role => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </Select>
            {formik.touched.roleId && formik.errors.roleId ? (
              <ErrorMessage>{formik.errors.roleId}</ErrorMessage>
            ) : null}
          </Field>

          <Field>
            <Label htmlFor="status">Status</Label>
            <Select
              id="status"
              name="status"
              value={formik.values.status}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              aria-invalid={formik.touched.status && !!formik.errors.status}
            >
              <option value="active">Active</option>
              <option value="invited">Invited</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </Select>
            {formik.touched.status && formik.errors.status ? (
              <ErrorMessage>{formik.errors.status}</ErrorMessage>
            ) : null}
          </Field>

        </Fieldset>
        <div className="flex justify-end gap-3">
           <Link to="/users">
                <Button type="button" variant="outline" disabled={formik.isSubmitting}>
                    Cancel
                </Button>
            </Link>
            <Button type="submit" disabled={formik.isSubmitting || !!formSuccess}>
                {formik.isSubmitting ? 'Updating User...' : 'Save Changes'}
            </Button>
        </div>
      </form>
    </motion.div>
  );
};

export default EditUserPage;
