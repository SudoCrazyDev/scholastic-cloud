import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { subjectService } from '../services/subjectService'
import type { Subject, CreateSubjectData, UpdateSubjectData } from '../types'

interface UseSubjectsOptions {
  class_section_id?: string
  institution_id?: string
  search?: string
  page?: number
  per_page?: number
}

interface DeleteConfirmation {
  isOpen: boolean
  title: string
  message: string
  onConfirm: () => void
  loading: boolean
}

export const useSubjects = (options: UseSubjectsOptions = {}) => {
  const queryClient = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [modalSuccess, setModalSuccess] = useState<string | null>(null)
  
  // Delete confirmation modal state
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    loading: false,
  })

  // Query key for subjects
  const queryKey = ['subjects', options]

  // Fetch subjects query
  const {
    data: subjectsResponse,
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => subjectService.getSubjects(options),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  })

  const subjects = subjectsResponse?.data || []
  const pagination = subjectsResponse?.pagination

  // Create subject mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateSubjectData) => subjectService.createSubject(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subjects'] })
      setModalSuccess('Subject created successfully')
      setTimeout(() => setModalSuccess(null), 3000)
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to create subject'
      setModalError(message)
      setTimeout(() => setModalError(null), 5000)
    },
  })

  // Update subject mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSubjectData }) => 
      subjectService.updateSubject(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subjects'] })
      setModalSuccess('Subject updated successfully')
      setTimeout(() => setModalSuccess(null), 3000)
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to update subject'
      setModalError(message)
      setTimeout(() => setModalError(null), 5000)
    },
  })

  // Delete subject mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => subjectService.deleteSubject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subjects'] })
      setDeleteConfirmation(prev => ({ ...prev, isOpen: false, loading: false }))
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to delete subject'
      setModalError(message)
      setTimeout(() => setModalError(null), 5000)
      setDeleteConfirmation(prev => ({ ...prev, loading: false }))
    },
  })

  // Handlers
  const handleCreate = () => {
    setEditingSubject(null)
    setIsModalOpen(true)
  }

  const handleEdit = (subject: Subject) => {
    setEditingSubject(subject)
    setIsModalOpen(true)
  }

  const handleDelete = async (subject: Subject) => {
    setDeleteConfirmation({
      isOpen: true,
      title: 'Delete Subject',
      message: `Are you sure you want to delete "${subject.title}"? This action cannot be undone.`,
      onConfirm: () => {
        setDeleteConfirmation(prev => ({ ...prev, loading: true }))
        deleteMutation.mutate(subject.id)
      },
      loading: false,
    })
  }

  const handleModalSubmit = async (data: CreateSubjectData | UpdateSubjectData) => {
    setModalLoading(true)
    setModalError(null)
    setModalSuccess(null)

    try {
      let result: any
      if (editingSubject) {
        result = await updateMutation.mutateAsync({ id: editingSubject.id, data: data as UpdateSubjectData })
      } else {
        result = await createMutation.mutateAsync(data as CreateSubjectData)
      }
      setIsModalOpen(false)
      return result
    } catch {
      // Error is handled in mutation onError
    } finally {
      setModalLoading(false)
    }
  }

  const handleModalClose = () => {
    setIsModalOpen(false)
    setEditingSubject(null)
    setModalError(null)
    setModalSuccess(null)
  }

  const handleDeleteConfirmationClose = () => {
    setDeleteConfirmation(prev => ({ ...prev, isOpen: false }))
  }

  // Reorder subjects mutation
  const reorderMutation = useMutation({
    mutationFn: ({ classSectionId, subjectOrders }: { classSectionId: string; subjectOrders: Array<{ id: string; order: number }> }) => 
      subjectService.reorderSubjects(classSectionId, subjectOrders),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subjects'] })
    },
    onError: (error: any) => {
      console.error('Failed to reorder subjects:', error)
    },
  })

  return {
    // Data
    subjects,
    pagination,
    loading,
    error,
    
    // Modal state
    isModalOpen,
    editingSubject,
    modalLoading,
    modalError,
    modalSuccess,
    
    // Delete confirmation
    deleteConfirmation,
    
    // Handlers
    handleCreate,
    handleEdit,
    handleDelete,
    handleModalSubmit,
    handleModalClose,
    handleDeleteConfirmationClose,
    
    // Mutations
    createMutation,
    updateMutation,
    deleteMutation,
    reorderMutation,
    
    // Query utilities
    refetch,
  }
} 

// Hook for fetching a single subject by ID
export const useSubjectDetail = (id?: string) => {
  return useQuery({
    queryKey: ['subject-detail', id],
    queryFn: () => {
      if (!id) throw new Error('No subject ID provided')
      return subjectService.getSubject(id)
    },
    enabled: !!id,
    staleTime: 0, // Changed from 5 minutes to 0 to ensure immediate refetching
    retry: 1,
  })
} 