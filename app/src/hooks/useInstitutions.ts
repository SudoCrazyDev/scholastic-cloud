import { useState } from 'react'
import { useDataTable } from './useDataTable'
import { institutionService } from '../services/institutionService'
import { subscriptionService } from '../services/subscriptionService'
import type { Institution, CreateInstitutionData, UpdateInstitutionData, Subscription } from '../types'

export const useInstitutions = () => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingInstitution, setEditingInstitution] = useState<Institution | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])

  const {
    data: institutions,
    loading,
    error,
    pagination,
    search,
    sorting,
    refresh,
    selectedRows,
    setSelectedRows,
  } = useDataTable<Institution>({
    endpoint: '/institutions',
    searchFields: ['title', 'abbr', 'address', 'division', 'region'],
    onError: (error) => {
      console.error('Institutions error:', error)
    },
  })

  // Load subscriptions for the modal
  const loadSubscriptions = async () => {
    try {
      const response = await subscriptionService.getSubscriptions({ limit: 100 })
      setSubscriptions(response.data || [])
    } catch (error) {
      console.error('Error loading subscriptions:', error)
    }
  }

  const handleCreate = async () => {
    setEditingInstitution(null)
    setModalError(null)
    await loadSubscriptions()
    setIsModalOpen(true)
  }

  const handleEdit = async (institution: Institution) => {
    setEditingInstitution(institution)
    setModalError(null)
    await loadSubscriptions()
    setIsModalOpen(true)
  }

  const handleDelete = async (institution: Institution) => {
    if (window.confirm(`Are you sure you want to delete the institution "${institution.title}"?`)) {
      try {
        await institutionService.deleteInstitution(institution.id)
        refresh()
      } catch (error: any) {
        console.error('Error deleting institution:', error)
        alert('Failed to delete institution. Please try again.')
      }
    }
  }

  const handleBulkDelete = async () => {
    if (selectedRows.length === 0) return

    const institutionNames = selectedRows.map(institution => institution.title).join(', ')
    if (window.confirm(`Are you sure you want to delete the following institutions?\n\n${institutionNames}`)) {
      try {
        await Promise.all(selectedRows.map(institution => institutionService.deleteInstitution(institution.id)))
        setSelectedRows([])
        refresh()
      } catch (error: any) {
        console.error('Error deleting institutions:', error)
        alert('Failed to delete some institutions. Please try again.')
      }
    }
  }

  const handleModalSubmit = async (data: CreateInstitutionData) => {
    setModalLoading(true)
    setModalError(null)

    try {
      if (editingInstitution) {
        // Update existing institution
        await institutionService.updateInstitution(editingInstitution.id, data as UpdateInstitutionData)
      } else {
        // Create new institution
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
      }
      
      refresh()
      setIsModalOpen(false)
    } catch (error: any) {
      console.error('Error saving institution:', error)
      
      if (error.response?.data?.message) {
        setModalError(error.response.data.message)
      } else if (error.response?.data?.errors) {
        // Handle validation errors
        const errors = error.response.data.errors
        const errorMessages = Object.values(errors).flat().join(', ')
        setModalError(errorMessages)
      } else {
        setModalError('Failed to save institution. Please try again.')
      }
    } finally {
      setModalLoading(false)
    }
  }

  const handleModalClose = () => {
    if (!modalLoading) {
      setIsModalOpen(false)
      setEditingInstitution(null)
      setModalError(null)
    }
  }

  return {
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