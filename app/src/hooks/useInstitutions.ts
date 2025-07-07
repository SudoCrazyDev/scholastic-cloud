import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { institutionService } from '../services/institutionService'
import { subscriptionService } from '../services/subscriptionService'
import type { Institution, CreateInstitutionData, UpdateInstitutionData, Subscription } from '../types'

interface DeleteConfirmation {
  isOpen: boolean
  title: string
  message: string
  onConfirm: () => void
  loading: boolean
}

interface UseInstitutionsOptions {
  page?: number
  limit?: number
  search?: string
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
}

export const useInstitutions = (options: UseInstitutionsOptions = {}) => {
  const queryClient = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingInstitution, setEditingInstitution] = useState<Institution | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [selectedRows, setSelectedRows] = useState<Institution[]>([])
  
  // Delete confirmation modal state
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    loading: false,
  })

  // Query key for institutions
  const queryKey = ['institutions', options]

  // Fetch institutions query
  const {
    data: institutionsResponse,
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => institutionService.getInstitutions(options),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  })

  const institutions = institutionsResponse?.data || []
  const pagination = institutionsResponse?.pagination

  // Fetch subscriptions query
  const { data: subscriptionsResponse } = useQuery({
    queryKey: ['subscriptions', { limit: 100 }],
    queryFn: () => subscriptionService.getSubscriptions({ limit: 100 }),
    staleTime: 10 * 60 * 1000, // 10 minutes
  })

  const subscriptions = subscriptionsResponse?.data || []

  // Create institution mutation
  const createMutation = useMutation({
    mutationFn: async (data: CreateInstitutionData) => {
      const newInstitution = await institutionService.createInstitution(data)
      
      // If subscription is selected, assign it to the institution
      if (data.subscription_id) {
        const expirationDate = new Date()
        expirationDate.setFullYear(expirationDate.getFullYear() + 1) // Default to 1 year
        await institutionService.assignSubscription(
          newInstitution.data.id,
          data.subscription_id,
          expirationDate.toISOString()
        )
      }
      
      return newInstitution
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['institutions'] })
      setIsModalOpen(false)
      setEditingInstitution(null)
      setModalError(null)
    },
    onError: (error: any) => {
      console.error('Error creating institution:', error)
      if (error.response?.data?.message) {
        setModalError(error.response.data.message)
      } else if (error.response?.data?.errors) {
        const errors = error.response.data.errors
        const errorMessages = Object.values(errors).flat().join(', ')
        setModalError(errorMessages)
      } else {
        setModalError('Failed to create institution. Please try again.')
      }
    },
  })

  // Update institution mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateInstitutionData }) =>
      institutionService.updateInstitution(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['institutions'] })
      setIsModalOpen(false)
      setEditingInstitution(null)
      setModalError(null)
    },
    onError: (error: any) => {
      console.error('Error updating institution:', error)
      if (error.response?.data?.message) {
        setModalError(error.response.data.message)
      } else if (error.response?.data?.errors) {
        const errors = error.response.data.errors
        const errorMessages = Object.values(errors).flat().join(', ')
        setModalError(errorMessages)
      } else {
        setModalError('Failed to update institution. Please try again.')
      }
    },
  })

  // Delete institution mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => institutionService.deleteInstitution(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['institutions'] })
      setDeleteConfirmation(prev => ({ ...prev, isOpen: false, loading: false }))
    },
    onError: (error: any) => {
      console.error('Error deleting institution:', error)
      setDeleteConfirmation(prev => ({ 
        ...prev, 
        loading: false,
        title: 'Error',
        message: error.response?.data?.message || 'Failed to delete institution. Please try again.',
        onConfirm: () => setDeleteConfirmation(prev => ({ ...prev, isOpen: false }))
      }))
    },
  })

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map(id => institutionService.deleteInstitution(id))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['institutions'] })
      setSelectedRows([])
      setDeleteConfirmation(prev => ({ ...prev, isOpen: false, loading: false }))
    },
    onError: (error: any) => {
      console.error('Error deleting institutions:', error)
      setDeleteConfirmation(prev => ({ 
        ...prev, 
        loading: false,
        title: 'Error',
        message: error.response?.data?.message || 'Failed to delete some institutions. Please try again.',
        onConfirm: () => setDeleteConfirmation(prev => ({ ...prev, isOpen: false }))
      }))
    },
  })

  const handleCreate = () => {
    setEditingInstitution(null)
    setModalError(null)
    setIsModalOpen(true)
  }

  const handleEdit = (institution: Institution) => {
    setEditingInstitution(institution)
    setModalError(null)
    setIsModalOpen(true)
  }

  const handleDelete = async (institution: Institution) => {
    setDeleteConfirmation({
      isOpen: true,
      title: 'Delete Institution',
      message: `Are you sure you want to delete the institution "${institution.title}"?\n\nThis action cannot be undone.`,
      onConfirm: async () => {
        setDeleteConfirmation(prev => ({ ...prev, loading: true }))
        deleteMutation.mutate(institution.id)
      },
      loading: false,
    })
  }

  const handleBulkDelete = async () => {
    if (selectedRows.length === 0) return

    const institutionNames = selectedRows.map(institution => institution.title).join('\n• ')
    setDeleteConfirmation({
      isOpen: true,
      title: 'Delete Multiple Institutions',
      message: `Are you sure you want to delete the following ${selectedRows.length} institution(s)?\n\n• ${institutionNames}\n\nThis action cannot be undone.`,
      onConfirm: async () => {
        setDeleteConfirmation(prev => ({ ...prev, loading: true }))
        bulkDeleteMutation.mutate(selectedRows.map(institution => institution.id))
      },
      loading: false,
    })
  }

  const handleModalSubmit = async (data: CreateInstitutionData) => {
    setModalLoading(true)
    setModalError(null)

    if (editingInstitution) {
      // Update existing institution
      updateMutation.mutate({ id: editingInstitution.id, data: data as UpdateInstitutionData })
    } else {
      // Create new institution
      createMutation.mutate(data)
    }
    
    setModalLoading(false)
  }

  const handleModalClose = () => {
    if (!modalLoading && !createMutation.isPending && !updateMutation.isPending) {
      setIsModalOpen(false)
      setEditingInstitution(null)
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
    institutions,
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
    subscriptions,
    
    // Modal state
    isModalOpen,
    editingInstitution,
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