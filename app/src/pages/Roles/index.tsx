import React from 'react'
import { motion } from 'framer-motion'
import { RoleHeader, RoleTable, RoleModal } from './components'
import { ConfirmationModal } from '../../components/ConfirmationModal'
import { useRoles } from '@hooks'

const Roles: React.FC = () => {
  const {
    // Data
    roles,
    loading,
    error,
    pagination,
    search,
    sorting,
    selectedRows,
    
    // Modal state
    isModalOpen,
    editingRole,
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
  } = useRoles()

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Header */}
      <RoleHeader
        selectedRows={selectedRows}
        onCreate={handleCreate}
        onBulkDelete={handleBulkDelete}
      />

      {/* DataTable */}
      <RoleTable
        roles={roles}
        loading={loading}
        error={error}
        pagination={pagination}
        search={search}
        sorting={sorting}
        selectedRows={selectedRows}
        onSelectionChange={setSelectedRows}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {/* Role Modal */}
      <RoleModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSubmit={handleModalSubmit}
        role={editingRole}
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

export default Roles 