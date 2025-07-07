import React from 'react'
import { motion } from 'framer-motion'
import { InstitutionHeader, InstitutionGrid, InstitutionModal } from './Institutions/components'
import { ConfirmationModal } from '../components/ConfirmationModal'
import { useInstitutions } from '@hooks'

const Institutions: React.FC = () => {
  const {
    // Data
    institutions,
    loading,
    error,
    pagination,
    search,
    sorting,
    selectedRows,
    subscriptions,

    // Modal state
    isModalOpen,
    editingInstitution,
    modalLoading,
    modalError,
    deleteConfirmation,

    // Actions
    handleCreate,
    handleEdit,
    handleDelete,
    handleBulkDelete,
    handleModalSubmit,
    handleModalClose,
    handleDeleteConfirmationClose,
    setSelectedRows,
  } = useInstitutions()

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Header */}
      <InstitutionHeader
        selectedRows={selectedRows}
        onCreate={handleCreate}
        onBulkDelete={handleBulkDelete}
      />

      {/* Grid */}
      <InstitutionGrid
        institutions={institutions}
        loading={loading}
        error={error}
        selectedRows={selectedRows}
        onSelectionChange={setSelectedRows}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {/* Institution Modal */}
      <InstitutionModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSubmit={handleModalSubmit}
        institution={editingInstitution}
        subscriptions={subscriptions}
        loading={modalLoading}
        error={modalError}
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
    </motion.div>
  )
}

export default Institutions