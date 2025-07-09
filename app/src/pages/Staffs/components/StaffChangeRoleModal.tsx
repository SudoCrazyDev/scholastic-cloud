import React, { useState, useEffect } from 'react';
import { Dialog } from '../../../components/dialog';
import { Button } from '../../../components/button';
import { Select } from '../../../components/select';

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

interface StaffChangeRoleModalProps {
  open: boolean;
  onClose: () => void;
  staff: Staff | null;
}

const roleOptions = [
  { label: 'Teacher', value: 'Teacher' },
  { label: 'Admin', value: 'Admin' },
  { label: 'Staff', value: 'Staff' },
];

const StaffChangeRoleModal: React.FC<StaffChangeRoleModalProps> = ({ open, onClose, staff }) => {
  const [role, setRole] = useState('');

  useEffect(() => {
    if (staff) setRole(staff.role);
    else setRole('');
  }, [staff, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Placeholder: handle role change
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in min-w-[300px]">
        <h2 className="text-xl font-semibold mb-2">Change Role</h2>
        <div>
          <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">Role</label>
          <Select
            name="role"
            id="role"
            value={role}
            onChange={e => setRole(e.target.value)}
            required
          >
            <option value="" disabled>Select role</option>
            {roleOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="solid" color="primary">
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
};

export default StaffChangeRoleModal; 