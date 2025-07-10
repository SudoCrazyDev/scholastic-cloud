import { StudentHeader, StudentGrid, StudentModal } from './components'
import { ConfirmationModal } from '../../components/ConfirmationModal'
import { useStudents } from '../../hooks/useStudents'

export default function Students() {
  const {
    students,
    loading,
    error,
    pagination,
    search,
    selectedRows,
    isModalOpen,
    editingStudent,
    modalLoading,
    modalError,
    deleteConfirmation,
    handleCreate,
    handleView,
    handleDelete,
    handleBulkDelete,
    handleModalSubmit,
    handleModalClose,
    handleDeleteConfirmationClose,
    setSelectedRows,
    modalSuccess,
  } = useStudents()

  // Apply additional filters
  const filteredStudents = students;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Students</h1>
          <p className="mt-2 text-gray-600">
            Manage student records, personal information, and academic details.
          </p>
        </div>

        {/* Header with search and filters */}
        <StudentHeader
          search={search.value}
          onSearchChange={search.onSearch}
          selectedRows={selectedRows}
          onCreate={handleCreate}
          onBulkDelete={handleBulkDelete}
        />

        {/* Students Grid */}
        <StudentGrid
          students={filteredStudents}
          loading={loading}
          error={error}
          selectedRows={selectedRows}
          onSelectionChange={setSelectedRows}
          onView={handleView}
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

        {/* Student Modal */}
        <StudentModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          onSubmit={handleModalSubmit}
          student={editingStudent}
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