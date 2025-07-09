import { UserHeader, UserGrid, UserModal } from './Users/components'
import { ConfirmationModal } from '../components/ConfirmationModal'
import { useUsers } from '../hooks/useUsers'

export default function Users() {

  const {
    users,
    loading,
    error,
    pagination,
    search,
    selectedRows,
    roles,
    institutions,
    isModalOpen,
    editingUser,
    modalLoading,
    modalError,
    deleteConfirmation,
    handleCreate,
    handleEdit,
    handleDelete,
    handleBulkDelete,
    handleModalSubmit,
    handleModalClose,
    handleDeleteConfirmationClose,
    setSelectedRows,
    modalSuccess,
  } = useUsers()

  // Apply additional filters
  const filteredUsers = users;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Users</h1>
          <p className="mt-2 text-gray-600">
            Manage user accounts, roles, and institution assignments.
          </p>
        </div>

        {/* Header with search and filters */}
        <UserHeader
          search={search.value}
          onSearchChange={search.onSearch}
          selectedRows={selectedRows}
          onCreate={handleCreate}
          onBulkDelete={handleBulkDelete}
        />

        {/* Users Grid */}
        <UserGrid
          users={filteredUsers}
          loading={loading}
          error={error}
          selectedRows={selectedRows}
          onSelectionChange={setSelectedRows}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />

        {/* Pagination */}
        {pagination && pagination.totalItems > 0 && (
          <div className="mt-6 flex justify-center">
            <div className="flex items-center gap-2">
              <button
                onClick={() => pagination.onPageChange(pagination.currentPage - 1)}
                disabled={pagination.currentPage <= 1}
                className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="px-3 py-2 text-sm text-gray-700">
                Page {pagination.currentPage} of {pagination.totalPages}
              </span>
              <button
                onClick={() => pagination.onPageChange(pagination.currentPage + 1)}
                disabled={pagination.currentPage >= pagination.totalPages}
                className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* User Modal */}
        <UserModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          onSubmit={handleModalSubmit}
          user={editingUser}
          roles={roles}
          institutions={institutions}
          loading={modalLoading}
          error={modalError}
          success={modalSuccess}
        />

        {/* Delete Confirmation Modal */}
        <ConfirmationModal
          isOpen={deleteConfirmation.isOpen}
          onClose={handleDeleteConfirmationClose}
          onConfirm={deleteConfirmation.onConfirm}
          title={deleteConfirmation.title}
          message={deleteConfirmation.message}
          confirmText="Delete"
          cancelText="Cancel"
          variant="danger"
          loading={deleteConfirmation.loading}
        />
      </div>
    </div>
  )
} 