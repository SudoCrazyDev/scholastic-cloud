import { useState } from 'react'
import { useDataTable } from './useDataTable'
import { subscriptionService } from '../services/subscriptionService'
import type { Subscription, CreateSubscriptionData, UpdateSubscriptionData } from '../types'

export const useSubscriptions = () => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingSubscription, setEditingSubscription] = useState<Subscription | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  const {
    data: subscriptions,
    loading,
    error,
    pagination,
    search,
    sorting,
    refresh,
    selectedRows,
    setSelectedRows,
  } = useDataTable<Subscription>({
    endpoint: '/subscriptions',
    searchFields: ['title', 'description'],
    onError: (error) => {
      console.error('Subscriptions error:', error)
    },
  })

  const handleCreate = () => {
    setEditingSubscription(null)
    setModalError(null)
    setIsModalOpen(true)
  }

  const handleEdit = (subscription: Subscription) => {
    setEditingSubscription(subscription)
    setModalError(null)
    setIsModalOpen(true)
  }

  const handleDelete = async (subscription: Subscription) => {
    if (window.confirm(`Are you sure you want to delete the subscription "${subscription.title}"?`)) {
      try {
        await subscriptionService.deleteSubscription(subscription.id)
        refresh()
      } catch (error: any) {
        console.error('Error deleting subscription:', error)
        alert('Failed to delete subscription. Please try again.')
      }
    }
  }

  const handleBulkDelete = async () => {
    if (selectedRows.length === 0) return

    const subscriptionNames = selectedRows.map(subscription => subscription.title).join(', ')
    if (window.confirm(`Are you sure you want to delete the following subscriptions?\n\n${subscriptionNames}`)) {
      try {
        await Promise.all(selectedRows.map(subscription => subscriptionService.deleteSubscription(subscription.id)))
        setSelectedRows([])
        refresh()
      } catch (error: any) {
        console.error('Error deleting subscriptions:', error)
        alert('Failed to delete some subscriptions. Please try again.')
      }
    }
  }

  const handleModalSubmit = async (data: CreateSubscriptionData) => {
    setModalLoading(true)
    setModalError(null)

    try {
      if (editingSubscription) {
        // Update existing subscription
        await subscriptionService.updateSubscription(editingSubscription.id, data as UpdateSubscriptionData)
      } else {
        // Create new subscription
        await subscriptionService.createSubscription(data)
      }
      
      refresh()
      setIsModalOpen(false)
    } catch (error: any) {
      console.error('Error saving subscription:', error)
      
      if (error.response?.data?.message) {
        setModalError(error.response.data.message)
      } else if (error.response?.data?.errors) {
        // Handle validation errors
        const errors = error.response.data.errors
        const errorMessages = Object.values(errors).flat().join(', ')
        setModalError(errorMessages)
      } else {
        setModalError('Failed to save subscription. Please try again.')
      }
    } finally {
      setModalLoading(false)
    }
  }

  const handleModalClose = () => {
    if (!modalLoading) {
      setIsModalOpen(false)
      setEditingSubscription(null)
      setModalError(null)
    }
  }

  return {
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
  }
} 