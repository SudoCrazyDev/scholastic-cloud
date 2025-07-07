import React from 'react'
import { motion } from 'framer-motion'
import { RoleHeader, RoleTable, RoleModal } from './components'
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
    
    // Actions
    handleCreate,
    handleEdit,
    handleDelete,
    handleBulkDelete,
    handleModalSubmit,
    handleModalClose,
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
    </motion.div>
  )
}

export default Roles 