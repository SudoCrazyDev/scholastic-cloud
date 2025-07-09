import React from 'react';
import { ConfirmationModal } from '../../../components/ConfirmationModal';

interface Staff {
  id?: number;
  firstName: string;
  middleName: string;
  lastName: string;
  extName: string;
  gender: string;
  birthdate: string;
  email: string;
  role: string;
}

interface StaffDeleteModalProps {
  open: boolean;
  onClose: () => void;
  staff: Staff | null;
}

const StaffDeleteModal: React.FC<StaffDeleteModalProps> = ({ open, onClose, staff }) => {
  return (
    <ConfirmationModal
      isOpen={open}
      onClose={onClose}
      title="Delete Staff"
      message={
        staff
          ? `Are you sure you want to delete ${staff.lastName}, ${staff.firstName} ${staff.middleName}${staff.extName ? ' ' + staff.extName : ''}? This action cannot be undone.`
          : ''
      }
      onConfirm={onClose} // Placeholder: replace with actual delete logic
      confirmText="Delete"
      cancelText="Cancel"
      variant="danger"
    />
  );
};

export default StaffDeleteModal; 