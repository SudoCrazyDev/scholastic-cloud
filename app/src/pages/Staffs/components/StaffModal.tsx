import React, { useState, useEffect } from 'react';
import * as Headless from '@headlessui/react';
import clsx from 'clsx';
import { Input } from '../../../components/input';
import { Button } from '../../../components/button';
import { Select } from '../../../components/select';
import { Alert } from '../../../components/alert';
import type { User, Role, CreateStaffData } from '../../../types';

interface StaffModalProps {
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'update';
  staff: User | null;
  roles: Role[];
  loading?: boolean;
  error?: string | null;
  success?: string | null;
  onSubmit: (data: CreateStaffData) => void;
}

const genderOptions = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'Other', value: 'other' },
];

const StaffModal: React.FC<StaffModalProps> = ({ 
  open, 
  onClose, 
  mode, 
  staff, 
  roles, 
  loading = false,
  error,
  success,
  onSubmit 
}) => {
  const [form, setForm] = useState<CreateStaffData>({
    first_name: '',
    middle_name: '',
    last_name: '',
    ext_name: '',
    gender: 'male',
    birthdate: '',
    email: '',
    password: 'password',
    role_id: '',
  });

  useEffect(() => {
    if (mode === 'update' && staff) {
      setForm({
        first_name: staff.first_name,
        middle_name: staff.middle_name || '',
        last_name: staff.last_name,
        ext_name: staff.ext_name || '',
        gender: staff.gender,
        birthdate: staff.birthdate,
        email: staff.email,
        password: '',
        role_id: staff.role?.id || '',
      });
    } else {
      setForm({
        first_name: '',
        middle_name: '',
        last_name: '',
        ext_name: '',
        gender: 'male',
        birthdate: '',
        email: '',
        password: 'password',
        role_id: '',
      });
    }
  }, [open, mode, staff]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  const isFormValid = () => {
    return (
      form.first_name.trim() !== '' &&
      form.last_name.trim() !== '' &&
      form.birthdate !== '' &&
      form.email.trim() !== '' &&
      form.role_id !== ''
    );
  };

  return (
    <Headless.Dialog open={open} onClose={onClose}>
      <Headless.DialogBackdrop
        transition
        className="fixed inset-0 flex w-screen justify-center overflow-y-auto bg-zinc-950/25 px-2 py-2 transition duration-100 focus:outline-0 data-closed:opacity-0 data-enter:ease-out data-leave:ease-in sm:px-6 sm:py-8 lg:px-8 lg:py-16"
      />

      <div className="fixed inset-0 w-screen overflow-y-auto pt-6 sm:pt-0">
        <div className="grid min-h-full grid-rows-[1fr_auto] justify-items-center sm:grid-rows-[1fr_auto_3fr] sm:p-4">
          <Headless.DialogPanel
            transition
            className={clsx(
              'row-start-2 w-full min-w-0 rounded-t-3xl bg-white p-8 shadow-lg ring-1 ring-zinc-950/10 sm:mb-auto sm:rounded-2xl sm:max-w-2xl',
              'transition duration-100 will-change-transform data-closed:translate-y-12 data-closed:opacity-0 data-enter:ease-out data-leave:ease-in sm:data-closed:translate-y-0 sm:data-closed:data-enter:scale-95'
            )}
          >
            {/* Header */}
            <Headless.DialogTitle className="text-xl font-semibold text-gray-900 mb-6">
              {mode === 'create' ? 'Create New Staff Member' : 'Update Staff Member'}
            </Headless.DialogTitle>
            
            {/* Body */}
            <div className="space-y-6">
              {/* Alerts */}
              {error && (
                <Alert
                  type="error"
                  message={error}
                  onClose={() => {}} // Error will be cleared by parent component
                />
              )}
              
              {success && (
                <Alert
                  type="success"
                  message={success}
                  onClose={() => {}} // Success will be cleared by parent component
                />
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Personal Information Section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900 border-b border-gray-200 pb-2">
                    Personal Information
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input 
                      label="First Name" 
                      name="first_name" 
                      value={form.first_name} 
                      onChange={handleChange} 
                      required 
                      placeholder="Enter first name"
                    />
                    <Input 
                      label="Middle Name" 
                      name="middle_name" 
                      value={form.middle_name} 
                      onChange={handleChange} 
                      placeholder="Enter middle name (optional)"
                    />
                    <Input 
                      label="Last Name" 
                      name="last_name" 
                      value={form.last_name} 
                      onChange={handleChange} 
                      required 
                      placeholder="Enter last name"
                    />
                    <Input 
                      label="Extension Name" 
                      name="ext_name" 
                      value={form.ext_name} 
                      onChange={handleChange} 
                      placeholder="Jr., Sr., III, etc."
                      helperText="Optional suffix or title"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="gender" className="block text-sm font-medium text-gray-700 mb-2">
                        Gender <span className="text-red-500">*</span>
                      </label>
                      <Select
                        name="gender"
                        id="gender"
                        value={form.gender}
                        onChange={handleSelectChange}
                        required
                        placeholder="Select gender"
                        options={genderOptions}
                      />
                    </div>
                    <Input 
                      label="Birthdate" 
                      name="birthdate" 
                      type="date" 
                      value={form.birthdate} 
                      onChange={handleChange} 
                      required 
                    />
                  </div>
                </div>

                {/* Account Information Section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900 border-b border-gray-200 pb-2">
                    Account Information
                  </h3>
                  
                  <Input 
                    label="Email Address" 
                    name="email" 
                    type="email" 
                    value={form.email} 
                    onChange={handleChange} 
                    required 
                    placeholder="Enter email address"
                  />



                  <div>
                    <label htmlFor="role_id" className="block text-sm font-medium text-gray-700 mb-2">
                      Role <span className="text-red-500">*</span>
                    </label>
                    <Select
                      name="role_id"
                      id="role_id"
                      value={form.role_id}
                      onChange={handleSelectChange}
                      required
                      placeholder="Select a role"
                      options={roles.map(role => ({
                        value: role.id.toString(),
                        label: role.title
                      }))}
                    />
                  </div>
                </div>
              </form>
            </div>

            {/* Actions */}
            <div className="mt-8 flex flex-col-reverse items-center justify-end gap-3 sm:flex-row sm:*:w-auto">
              <Button 
                type="button" 
                variant="ghost" 
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                variant="solid" 
                color="primary"
                disabled={loading || !isFormValid()}
                onClick={handleSubmit}
              >
                {loading ? 'Saving...' : (mode === 'create' ? 'Create Staff Member' : 'Update Staff Member')}
              </Button>
            </div>
          </Headless.DialogPanel>
        </div>
      </div>
    </Headless.Dialog>
  );
};

export default StaffModal; 