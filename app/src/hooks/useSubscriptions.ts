import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { subscriptionService } from '../services/subscriptionService'
import type { Subscription, CreateSubscriptionData, UpdateSubscriptionData } from '../types'

interface DeleteConfirmation {
  isOpen: boolean
  title: string
  message: string
  onConfirm: () => void
  loading: boolean
}

interface UseSubscriptionsOptions {
  page?: number
  limit?: number
  search?: string
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
}

export const useSubscriptions = (options: UseSubscriptionsOptions = {}) => {
  const queryClient = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingSubscription, setEditingSubscription] = useState<Subscription | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [selectedRows, setSelectedRows] = useState<Subscription[]>([])
  
  // Delete confirmation modal state
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    loading: false,
  })

  // Query key for subscriptions
  const queryKey = ['subscriptions', options]

  // Fetch subscriptions query
  const {
    data: subscriptionsResponse,
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => subscriptionService.getSubscriptions(options),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  })

  const subscriptions = subscriptionsResponse?.data || []
  const pagination = subscriptionsResponse?.pagination

  // Create subscription mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateSubscriptionData) => subscriptionService.createSubscription(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
      setIsModalOpen(false)
      setEditingSubscription(null)
      setModalError(null)
    },
    onError: (error: any) => {
      console.error('Error creating subscription:', error)
      if (error.response?.data?.message) {
        setModalError(error.response.data.message)
      } else if (error.response?.data?.errors) {
        const errors = error.response.data.errors
        const errorMessages = Object.values(errors).flat().join(', ')
        setModalError(errorMessages)
      } else {
        setModalError('Failed to create subscription. Please try again.')
      }
    },
  })

  // Update subscription mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSubscriptionData }) =>
      subscriptionService.updateSubscription(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
      setIsModalOpen(false)
      setEditingSubscription(null)
      setModalError(null)
    },
    onError: (error: any) => {
      console.error('Error updating subscription:', error)
      if (error.response?.data?.message) {
        setModalError(error.response.data.message)
      } else if (error.response?.data?.errors) {
        const errors = error.response.data.errors
        const errorMessages = Object.values(errors).flat().join(', ')
        setModalError(errorMessages)
      } else {
        setModalError('Failed to update subscription. Please try again.')
      }
    },
  })

  // Delete subscription mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => subscriptionService.deleteSubscription(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
      setDeleteConfirmation(prev => ({ ...prev, isOpen: false, loading: false }))
    },
    onError: (error: any) => {
      console.error('Error deleting subscription:', error)
      setDeleteConfirmation(prev => ({ 
        ...prev, 
        loading: false,
        title: 'Error',
        message: error.response?.data?.message || 'Failed to delete subscription. Please try again.',
        onConfirm: () => setDeleteConfirmation(prev => ({ ...prev, isOpen: false }))
      }))
    },
  })

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map(id => subscriptionService.deleteSubscription(id))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
      setSelectedRows([])
      setDeleteConfirmation(prev => ({ ...prev, isOpen: false, loading: false }))
    },
    onError: (error: any) => {
      console.error('Error deleting subscriptions:', error)
      setDeleteConfirmation(prev => ({ 
        ...prev, 
        loading: false,
        title: 'Error',
        message: error.response?.data?.message || 'Failed to delete some subscriptions. Please try again.',
        onConfirm: () => setDeleteConfirmation(prev => ({ ...prev, isOpen: false }))
      }))
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
    setDeleteConfirmation({
      isOpen: true,
      title: 'Delete Subscription',
      message: `Are you sure you want to delete the subscription "${subscription.title}"?\n\nThis action cannot be undone.`,
      onConfirm: async () => {
        setDeleteConfirmation(prev => ({ ...prev, loading: true }))
        deleteMutation.mutate(subscription.id)
      },
      loading: false,
    })
  }

  const handleBulkDelete = async () => {
    if (selectedRows.length === 0) return

    const subscriptionNames = selectedRows.map(subscription => subscription.title).join('\n• ')
    setDeleteConfirmation({
      isOpen: true,
      title: 'Delete Multiple Subscriptions',
      message: `Are you sure you want to delete the following ${selectedRows.length} subscription(s)?\n\n• ${subscriptionNames}\n\nThis action cannot be undone.`,
      onConfirm: async () => {
        setDeleteConfirmation(prev => ({ ...prev, loading: true }))
        bulkDeleteMutation.mutate(selectedRows.map(subscription => subscription.id))
      },
      loading: false,
    })
  }

  const handleModalSubmit = async (data: CreateSubscriptionData) => {
    setModalLoading(true)
    setModalError(null)

    if (editingSubscription) {
      // Update existing subscription
      updateMutation.mutate({ id: editingSubscription.id, data: data as UpdateSubscriptionData })
    } else {
      // Create new subscription
      createMutation.mutate(data)
    }
    
    setModalLoading(false)
  }

  const handleModalClose = () => {
    if (!modalLoading && !createMutation.isPending && !updateMutation.isPending) {
      setIsModalOpen(false)
      setEditingSubscription(null)
      setModalError(null)
    }
  }

  const handleDeleteConfirmationClose = () => {
    if (!deleteConfirmation.loading && !deleteMutation.isPending && !bulkDeleteMutation.isPending) {
      setDeleteConfirmation(prev => ({ ...prev, isOpen: false }))
    }
  }

  return {
    // Data
    subscriptions,
    loading,
    error: error?.message || null,
    pagination: {
      currentPage: pagination?.current_page || 1,
      totalPages: pagination?.last_page || 1,
      totalItems: pagination?.total || 0,
      itemsPerPage: pagination?.per_page || 10,
      onPageChange: () => {}, // This will be handled by the parent component
    },
    search: {
      value: options.search || '',
      onSearch: () => {}, // This will be handled by the parent component
    },
    sorting: {
      config: options.sortBy && options.sortDirection ? { key: options.sortBy, direction: options.sortDirection } : null,
      onSort: () => {}, // This will be handled by the parent component
    },
    selectedRows,
    
    // Modal state
    isModalOpen,
    editingSubscription,
    modalLoading: modalLoading || createMutation.isPending || updateMutation.isPending,
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
    refresh: refetch,
  }
} 