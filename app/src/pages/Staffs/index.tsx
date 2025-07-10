// Staffs Page - Grid, Search, CRUD Modals (Placeholder, no API)
// Follows Users page layout and reuses components
// TODO: Integrate with API and implement real CRUD logic
import React from 'react';
import { StaffHeader, StaffGrid, StaffModal, StaffDeleteModal, StaffChangeRoleModal } from './components';
import { useStaffs } from '../../hooks/useStaffs';
import { Alert } from '../../components/alert';

const Staffs: React.FC = () => {
  const {
    // Data
    staffs,
    roles,
    pagination,
    loading,
    error,
    
    // Modal states
    isModalOpen,
    editingStaff,
    modalLoading,
    modalError,
    modalSuccess,
    
    // Change role modal states
    isChangeRoleModalOpen,
    changingRoleStaff,
    changeRoleLoading,
    changeRoleError,
    changeRoleSuccess,
    
    // Delete confirmation
    deleteConfirmation,
    
    // Search and pagination
    searchValue,
    currentPage,
    handleSearchChange,
    handlePageChange,
    
    // Handlers
    handleCreate,
    handleEdit,
    handleDelete,
    handleChangeRole,
    handleModalSubmit,
    handleChangeRoleSubmit,
    handleModalClose,
    handleChangeRoleModalClose,
    handleDeleteConfirmationClose,
  } = useStaffs({
    search: '',
    page: 1,
    limit: 15,
  });

  return (
    <div className="p-6">
      {/* Global Error Alert */}
      {error && (
        <Alert
          type="error"
          message="Failed to load staff members. Please try refreshing the page."
          className="mb-4"
        />
      )}

      {/* Header */}
      <StaffHeader 
        search={searchValue} 
        onSearch={handleSearchChange} 
        onCreate={handleCreate} 
      />

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">Loading staff members...</span>
        </div>
      )}

      {/* Staff Grid */}
      {!loading && (
        <StaffGrid 
          staffs={staffs} 
          onEdit={handleEdit} 
          onDelete={handleDelete} 
          onChangeRole={handleChangeRole} 
        />
      )}

      {/* Pagination */}
      {pagination && pagination.last_page > 1 && (
        <div className="mt-6 flex justify-center">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="px-3 py-2 text-sm text-gray-700">
              Page {currentPage} of {pagination.last_page}
            </span>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === pagination.last_page}
              className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Create/Edit Staff Modal */}
      <StaffModal
        open={isModalOpen}
        onClose={handleModalClose}
        mode={editingStaff ? 'update' : 'create'}
        staff={editingStaff}
        roles={roles}
        loading={modalLoading}
        error={modalError}
        success={modalSuccess}
        onSubmit={handleModalSubmit}
      />

      {/* Delete Confirmation Modal */}
      <StaffDeleteModal
        open={deleteConfirmation.isOpen}
        onClose={handleDeleteConfirmationClose}
        staff={editingStaff}
        onConfirm={deleteConfirmation.onConfirm}
        loading={deleteConfirmation.loading}
      />

      {/* Change Role Modal */}
      <StaffChangeRoleModal
        open={isChangeRoleModalOpen}
        onClose={handleChangeRoleModalClose}
        staff={changingRoleStaff}
        roles={roles}
        loading={changeRoleLoading}
        error={changeRoleError}
        success={changeRoleSuccess}
        onSubmit={handleChangeRoleSubmit}
      />
    </div>
  );
};

export { Staffs };
export default Staffs; 