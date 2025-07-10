import React from 'react';
import { ConfirmationModal } from '../../../components/ConfirmationModal';
import type { User } from '../../../types';

interface StaffDeleteModalProps {
  open: boolean;
  onClose: () => void;
  staff: User | null;
  onConfirm: () => void;
  loading?: boolean;
}

const StaffDeleteModal: React.FC<StaffDeleteModalProps> = ({ 
  open, 
  onClose, 
  staff, 
  onConfirm,
  loading = false 
}) => {
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
    <ConfirmationModal
      isOpen={open}
      onClose={onClose}
      title="Delete Staff Member"
      message={
        staff
          ? `Are you sure you want to delete ${getFullName(staff)}? This action cannot be undone.`
          : ''
      }
      onConfirm={onConfirm}
      confirmText={loading ? 'Deleting...' : 'Delete'}
      cancelText="Cancel"
      variant="danger"
      loading={loading}
    />
  );
};

export default StaffDeleteModal; 