import React, { useState, useEffect } from 'react';
import { Input } from '../../../components/input';
import { Button } from '../../../components/button';
import { Select } from '../../../components/select';
import { Dialog } from '../../../components/dialog';

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

interface StaffModalProps {
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'update';
  staff: Staff | null;
}

const genderOptions = [
  { label: 'Male', value: 'Male' },
  { label: 'Female', value: 'Female' },
  { label: 'Other', value: 'Other' },
];

const roleOptions = [
  { label: 'Teacher', value: 'Teacher' },
  { label: 'Admin', value: 'Admin' },
  { label: 'Staff', value: 'Staff' },
];

const StaffModal: React.FC<StaffModalProps> = ({ open, onClose, mode, staff }) => {
  const [form, setForm] = useState<Staff>({
    firstName: '',
    middleName: '',
    lastName: '',
    extName: '',
    gender: '',
    birthdate: '',
    email: '',
    role: '',
  });

  useEffect(() => {
    if (mode === 'update' && staff) {
      setForm(staff);
    } else {
      setForm({
        firstName: '',
        middleName: '',
        lastName: '',
        extName: '',
        gender: '',
        birthdate: '',
        email: '',
        role: '',
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
    // Placeholder: handle create or update
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in">
        <h2 className="text-xl font-semibold mb-2">{mode === 'create' ? 'Create Staff' : 'Update Staff'}</h2>
        <div className="grid grid-cols-2 gap-4">
          <Input label="First Name" name="firstName" value={form.firstName} onChange={handleChange} required />
          <Input label="Middle Name" name="middleName" value={form.middleName} onChange={handleChange} />
          <Input label="Last Name" name="lastName" value={form.lastName} onChange={handleChange} required />
          <Input label="Ext Name" name="extName" value={form.extName} onChange={handleChange} placeholder="Jr., Sr., III, etc." />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="gender" className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
            <Select
              name="gender"
              id="gender"
              value={form.gender}
              onChange={handleSelectChange}
              required
            >
              <option value="" disabled>Select gender</option>
              {genderOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
          </div>
          <Input label="Birthdate" name="birthdate" type="date" value={form.birthdate} onChange={handleChange} required />
        </div>
        <Input label="Email" name="email" type="email" value={form.email} onChange={handleChange} required />
        <div>
          <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">Role</label>
          <Select
            name="role"
            id="role"
            value={form.role}
            onChange={handleSelectChange}
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
            {mode === 'create' ? 'Create' : 'Update'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};

export default StaffModal; 