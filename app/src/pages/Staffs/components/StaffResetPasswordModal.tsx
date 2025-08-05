import React from 'react';
import { X, AlertTriangle } from 'lucide-react';
import type { User } from '../../../types';

interface StaffResetPasswordModalProps {
  open: boolean;
  onClose: () => void;
  staff: User | null;
  loading: boolean;
  error: string | null;
  success: string | null;
  onSubmit: () => void;
}

const StaffResetPasswordModal: React.FC<StaffResetPasswordModalProps> = ({
  open,
  onClose,
  staff,
  loading,
  error,
  success,
  onSubmit,
}) => {
  console.log('StaffResetPasswordModal props:', { open, staff, loading, error, success });
  
  if (!open) return null;

  const getFullName = (staff: User) => {
    const parts = [
      staff.last_name,
      staff.first_name,
      staff.middle_name,
      staff.ext_name
    ].filter(Boolean);
    return parts.join(', ');
  };

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div 
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        />

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full relative z-[10000] border-4 border-red-500">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <AlertTriangle className="h-6 w-6 text-yellow-500" />
                </div>
                <div className="ml-3">
                  <h3 className="text-lg font-medium text-gray-900">
                    Reset Password
                  </h3>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Content */}
            <div className="mt-2">
              <div className="text-sm text-gray-500 mb-4">
                Are you sure you want to reset the password for{' '}
                <span className="font-medium text-gray-900">
                  {staff ? getFullName(staff) : ''}
                </span>?
              </div>
              
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-4">
                <div className="flex">
                  <AlertTriangle className="h-5 w-5 text-yellow-400" />
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-yellow-800">
                      Password Reset Warning
                    </h3>
                    <div className="mt-2 text-sm text-yellow-700">
                      <ul className="list-disc pl-5 space-y-1">
                        <li>The password will be reset to "password"</li>
                        <li>The staff member will be prompted to change their password on next login</li>
                        <li>This action cannot be undone</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-4">
                  <div className="flex">
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">
                        Error
                      </h3>
                      <div className="mt-2 text-sm text-red-700">
                        {error}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Success Message */}
              {success && (
                <div className="mb-4 bg-green-50 border border-green-200 rounded-md p-4">
                  <div className="flex">
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-green-800">
                        Success
                      </h3>
                      <div className="mt-2 text-sm text-green-700">
                        {success}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={onSubmit}
              disabled={loading}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Resetting...
                </>
              ) : (
                'Reset Password'
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StaffResetPasswordModal; 