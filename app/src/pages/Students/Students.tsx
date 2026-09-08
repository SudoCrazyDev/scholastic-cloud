import { useState } from 'react'
import { ChartBarIcon, PrinterIcon, UserGroupIcon } from '@heroicons/react/24/outline'
import {
  StudentHeader,
  StudentGrid,
  StudentModal,
  StudentPasswordResetModal,
  StudentPrintingTab,
  StudentStatisticsTab,
} from './components'
import { ConfirmationModal } from '../../components/ConfirmationModal'
import { useStudents } from '../../hooks/useStudents'
import { Toaster } from 'react-hot-toast'

type StudentsTab = 'records' | 'printing' | 'statistics'

const TABS: { id: StudentsTab; label: string; icon: typeof UserGroupIcon }[] = [
  { id: 'records', label: 'Records', icon: UserGroupIcon },
  { id: 'printing', label: 'Printing', icon: PrinterIcon },
  { id: 'statistics', label: 'Statistics', icon: ChartBarIcon },
]

export default function Students() {
  const [activeTab, setActiveTab] = useState<StudentsTab>('records')

  const {
    students,
    loading,
    error,
    pagination,
    search,
    sectionFilter,
    selectedRows,
    isModalOpen,
    editingStudent,
    modalLoading,
    modalError,
    deleteConfirmation,
    handleCreate,
    handleView,
    handleEdit,
    handlePasswordReset,
    handlePasswordResetClose,
    passwordResetStudent,
    handleDelete,
    handleBulkDelete,
    handleModalSubmit,
    handleModalClose,
    handleDeleteConfirmationClose,
    setSelectedRows,
  } = useStudents()

  /**
   * What the grid says when it comes back empty. A search or a filter is the
   * usual reason, and each wants different words — only a genuinely empty
   * school should be told to create its first student record.
   */
  const gridEmptyState = (() => {
    if (search.value) {
      return { title: undefined, message: 'No student matches your search.' }
    }
    if (sectionFilter.value === 'unassigned') {
      return {
        title: 'Everyone has a section',
        message: 'No student is waiting to be assigned to a section.',
      }
    }
    if (sectionFilter.value === 'assigned') {
      return { title: undefined, message: 'No student has been assigned to a section yet.' }
    }

    return { title: undefined, message: undefined }
  })()

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#363636',
            color: '#fff',
          },
          success: {
            duration: 3000,
            iconTheme: {
              primary: '#10B981',
              secondary: '#fff',
            },
          },
          error: {
            duration: 5000,
            iconTheme: {
              primary: '#EF4444',
              secondary: '#fff',
            },
          },
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Students</h1>
          <p className="mt-2 text-gray-600">
            Manage student records, personal information, and academic details.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          {TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {activeTab === 'records' && (
          <>
            {/* Header with search and filters */}
            <StudentHeader
              search={search.value}
              onSearchChange={search.onSearch}
              sectionStatus={sectionFilter.value}
              onSectionStatusChange={sectionFilter.onChange}
              totalItems={pagination?.totalItems}
              selectedRows={selectedRows}
              onCreate={handleCreate}
              onBulkDelete={handleBulkDelete}
            />

            {/* Students Grid */}
            <StudentGrid
              students={students}
              loading={loading}
              error={error}
              emptyTitle={gridEmptyState.title}
              emptyMessage={gridEmptyState.message}
              selectedRows={selectedRows}
              onSelectionChange={setSelectedRows}
              onView={handleView}
              onEdit={handleEdit}
              onPasswordReset={handlePasswordReset}
              onDelete={handleDelete}
            />

            {/* Pagination */}
            {pagination && pagination.totalItems > 0 && (
              <div className="mt-6 flex justify-center">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => pagination.onPageChange(pagination.currentPage - 1)}
                    disabled={pagination.currentPage <= 1}
                    className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-2 text-sm text-gray-700">
                    Page {pagination.currentPage} of {pagination.totalPages}
                  </span>
                  <button
                    onClick={() => pagination.onPageChange(pagination.currentPage + 1)}
                    disabled={pagination.currentPage >= pagination.totalPages}
                    className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'printing' && <StudentPrintingTab />}

        {activeTab === 'statistics' && <StudentStatisticsTab />}

        {/* Student Modal */}
        <StudentModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          onSubmit={handleModalSubmit}
          student={editingStudent}
          loading={modalLoading}
          error={modalError}
        />

        {/* Password Reset Modal */}
        <StudentPasswordResetModal
          isOpen={Boolean(passwordResetStudent)}
          onClose={handlePasswordResetClose}
          student={passwordResetStudent}
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
