import React, { useState, useEffect } from 'react';
import { Dialog as HeadlessDialog } from '@headlessui/react';
import { Button } from '../../../components/button';
import { Select } from '../../../components/select';
import { Alert } from '../../../components/alert';
import type { User, Role, UpdateStaffRoleData } from '../../../types';

interface StaffChangeRoleModalProps {
  open: boolean;
  onClose: () => void;
  staff: User | null;
  roles: Role[];
  loading?: boolean;
  error?: string | null;
  success?: string | null;
  onSubmit: (data: UpdateStaffRoleData) => void;
}

const StaffChangeRoleModal: React.FC<StaffChangeRoleModalProps> = ({ 
  open, 
  onClose, 
  staff, 
  roles,
  loading = false,
  error,
  success,
  onSubmit 
}) => {
  const [roleId, setRoleId] = useState('');

  useEffect(() => {
    if (staff && staff.role) {
      setRoleId(staff.role.id);
    } else {
      setRoleId('');
    }
  }, [staff, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (roleId) {
      onSubmit({ role_id: roleId });
    }
  };

  const isFormValid = () => {
    return roleId !== '';
  };

  // Transform roles into options format for Select component
  const roleOptions = roles.map(role => ({
    value: role.id,
    label: role.title
  }));

  return (
    <HeadlessDialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <HeadlessDialog.Panel className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            Change Staff Role
          </h2>
          {staff && (
            <p className="text-sm text-gray-600 mt-1">
              {staff.first_name} {staff.last_name}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
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

          {/* Form Fields */}
          <div>
            <label htmlFor="role_id" className="block text-sm font-medium text-gray-700 mb-1">
              Role
            </label>
            <Select
              name="role_id"
              id="role_id"
              value={roleId}
              onChange={e => setRoleId(e.target.value)}
              options={roleOptions}
              placeholder="Select role"
              required
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
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
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
        </HeadlessDialog.Panel>
      </div>
    </HeadlessDialog>
  );
};

export default StaffChangeRoleModal; 