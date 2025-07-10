import React from 'react';
import { Button } from '../../../components/button';
import { EnvelopeIcon, CakeIcon, UserIcon } from '@heroicons/react/24/outline';
import { Pencil, Trash2, UserCog } from 'lucide-react';
import type { User } from '../../../types';

interface StaffGridProps {
  staffs: User[];
  onEdit: (staff: User) => void;
  onDelete: (staff: User) => void;
  onChangeRole: (staff: User) => void;
}

const genderAvatar = (gender: string) => (
  <div className="flex items-center justify-center w-10 h-10 rounded-full border border-gray-200 bg-white">
    <UserIcon className="w-6 h-6 text-gray-400" />
  </div>
);

const iconBtnClass =
  'inline-flex items-center justify-center w-8 h-8 rounded-full border border-transparent text-gray-400 hover:text-blue-500 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-200';

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

const getFullName = (staff: User) => {
  const parts = [
    staff.last_name,
    staff.first_name,
    staff.middle_name,
    staff.ext_name
  ].filter(Boolean);
  return parts.join(', ');
};

const StaffGrid: React.FC<StaffGridProps> = ({ staffs, onEdit, onDelete, onChangeRole }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in-up">
      {staffs.length === 0 ? (
        <div className="col-span-full text-center text-gray-400 py-12">No staff found.</div>
      ) : (
        staffs.map(staff => (
          <div
            key={staff.id}
            className="bg-white border border-gray-200 rounded-xl p-5 flex gap-4 items-center transition-transform hover:scale-[1.01] hover:border-gray-300 animate-fade-in min-h-[120px]"
          >
            {/* Avatar */}
            {genderAvatar(staff.gender)}
            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-base truncate text-gray-900">
                {getFullName(staff)}
              </div>
              <div className="text-xs text-gray-500 mb-1">
                {staff.role?.title || 'No role assigned'}
              </div>
              <div className="flex items-center text-xs text-gray-500 gap-1">
                <EnvelopeIcon className="w-4 h-4 text-gray-400" />
                <span className="truncate">{staff.email}</span>
              </div>
              <div className="flex items-center text-xs text-gray-400 gap-1 mt-0.5">
                <CakeIcon className="w-4 h-4" />
                <span>{formatDate(staff.birthdate)}</span>
              </div>
            </div>
            {/* Actions */}
            <div className="flex flex-col gap-1 ml-2">
              <button className={iconBtnClass} title="Edit" onClick={() => onEdit(staff)}>
                <Pencil size={18} />
              </button>
              <button className={iconBtnClass} title="Delete" onClick={() => onDelete(staff)}>
                <Trash2 size={18} />
              </button>
              <button className={iconBtnClass} title="Change Role" onClick={() => onChangeRole(staff)}>
                <UserCog size={18} />
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default StaffGrid; 