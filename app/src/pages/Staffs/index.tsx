// Staffs Page - Grid, Search, CRUD Modals (Placeholder, no API)
// Follows Users page layout and reuses components
// TODO: Integrate with API and implement real CRUD logic
import React, { useState } from 'react';
import { StaffHeader, StaffGrid, StaffModal, StaffDeleteModal, StaffChangeRoleModal } from './components';

// Placeholder data for staff
const initialStaffs = [
  {
    id: 1,
    firstName: 'John',
    middleName: 'A.',
    lastName: 'Doe',
    extName: 'Jr.',
    gender: 'Male',
    birthdate: '1990-01-01',
    email: 'john.doe@example.com',
    role: 'Teacher',
  },
  {
    id: 2,
    firstName: 'Jane',
    middleName: 'B.',
    lastName: 'Smith',
    extName: '',
    gender: 'Female',
    birthdate: '1985-05-15',
    email: 'jane.smith@example.com',
    role: 'Admin',
  },
];

const Staffs: React.FC = () => {
  const [staffs, setStaffs] = useState(initialStaffs);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [modalMode, setModalMode] = useState<'create' | 'update'>('create');
  const [changeRoleModalOpen, setChangeRoleModalOpen] = useState(false);
  const [roleStaff, setRoleStaff] = useState(null);

  const handleCreate = () => {
    setModalMode('create');
    setSelectedStaff(null);
    setModalOpen(true);
  };

  const handleEdit = (staff: any) => {
    setModalMode('update');
    setSelectedStaff(staff);
    setModalOpen(true);
  };

  const handleDelete = (staff: any) => {
    setSelectedStaff(staff);
    setDeleteModalOpen(true);
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setSelectedStaff(null);
  };

  const handleDeleteModalClose = () => {
    setDeleteModalOpen(false);
    setSelectedStaff(null);
  };

  const handleChangeRole = (staff: any) => {
    setRoleStaff(staff);
    setChangeRoleModalOpen(true);
  };

  const handleChangeRoleModalClose = () => {
    setChangeRoleModalOpen(false);
    setRoleStaff(null);
  };

  // Placeholder filter logic
  const filteredStaffs = staffs.filter((staff) => {
    const fullName = `${staff.firstName} ${staff.middleName} ${staff.lastName} ${staff.extName}`.toLowerCase();
    return fullName.includes(search.toLowerCase()) || staff.email.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="p-6">
      <StaffHeader onSearch={setSearch} onCreate={handleCreate} search={search} />
      <StaffGrid staffs={filteredStaffs} onEdit={handleEdit} onDelete={handleDelete} onChangeRole={handleChangeRole} />
      <StaffModal open={modalOpen} onClose={handleModalClose} mode={modalMode} staff={selectedStaff} />
      <StaffDeleteModal open={deleteModalOpen} onClose={handleDeleteModalClose} staff={selectedStaff} />
      <StaffChangeRoleModal open={changeRoleModalOpen} onClose={handleChangeRoleModalClose} staff={roleStaff} />
    </div>
  );
};

export { Staffs };
export default Staffs; 