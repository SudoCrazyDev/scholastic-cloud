import React from 'react'
import { motion } from 'framer-motion'
import { SubscriptionHeader, SubscriptionTable, SubscriptionModal } from './components'
import { useSubscriptions } from '@hooks'

const Subscriptions: React.FC = () => {
  const {
    // Data
    subscriptions,
    loading,
    error,
    pagination,
    search,
    sorting,
    selectedRows,
    
    // Modal state
    isModalOpen,
    editingSubscription,
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
  } = useSubscriptions()

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Header */}
      <SubscriptionHeader
        selectedRows={selectedRows}
        onCreate={handleCreate}
        onBulkDelete={handleBulkDelete}
      />

      {/* DataTable */}
      <SubscriptionTable
        subscriptions={subscriptions}
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

      {/* Subscription Modal */}
      <SubscriptionModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSubmit={handleModalSubmit}
        subscription={editingSubscription}
        loading={modalLoading}
        error={modalError}
      />
    </motion.div>
  )
}

export default Subscriptions 