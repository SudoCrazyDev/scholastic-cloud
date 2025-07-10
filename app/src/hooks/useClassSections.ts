import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { classSectionService } from '../services/classSectionService'
import type { ClassSection, CreateClassSectionData, UpdateClassSectionData } from '../types'

interface DeleteConfirmation {
  isOpen: boolean
  title: string
  message: string
  onConfirm: () => void
  loading: boolean
}

interface UseClassSectionsOptions {
  page?: number
  per_page?: number
  search?: string
  grade_level?: string
}

export const useClassSections = (options: UseClassSectionsOptions = {}) => {
  const queryClient = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingClassSection, setEditingClassSection] = useState<ClassSection | null>(null)
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

  // Query key for class sections
  const queryKey = ['class-sections', options]

  // Fetch class sections query
  const {
    data: classSectionsResponse,
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => classSectionService.getClassSections(options),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  })

  const classSections = classSectionsResponse?.data || []
  const pagination = classSectionsResponse?.pagination

  // Create class section mutation
  const createMutation = useMutation({
    mutationFn: async (data: CreateClassSectionData) => {
      const newClassSection = await classSectionService.createClassSection(data)
      refetch()
      return newClassSection
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['class-sections'] })
      setModalSuccess('Class section created successfully!')
      setModalError(null)
    },
    onError: (error: any) => {
      console.error('Error creating class section:', error)
      if (error.response?.data?.message) {
        setModalError(error.response.data.message)
      } else if (error.response?.data?.errors) {
        const errors = error.response.data.errors
        const errorMessages = Object.values(errors).flat().join(', ')
        setModalError(errorMessages)
      } else {
        setModalError('Failed to create class section. Please try again.')
      }
    },
  })

  // Update class section mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateClassSectionData }) =>
      classSectionService.updateClassSection(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['class-sections'] })
      setModalSuccess('Class section updated successfully!')
      setModalError(null)
    },
    onError: (error: any) => {
      console.error('Error updating class section:', error)
      if (error.response?.data?.message) {
        setModalError(error.response.data.message)
      } else if (error.response?.data?.errors) {
        const errors = error.response.data.errors
        const errorMessages = Object.values(errors).flat().join(', ')
        setModalError(errorMessages)
      } else {
        setModalError('Failed to update class section. Please try again.')
      }
    },
  })

  // Delete class section mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => classSectionService.deleteClassSection(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['class-sections'] })
      setDeleteConfirmation(prev => ({ ...prev, isOpen: false, loading: false }))
    },
    onError: (error: any) => {
      console.error('Error deleting class section:', error)
      setDeleteConfirmation(prev => ({ 
        ...prev, 
        loading: false,
        title: 'Error',
        message: error.response?.data?.message || 'Failed to delete class section. Please try again.',
        onConfirm: () => setDeleteConfirmation(prev => ({ ...prev, isOpen: false }))
      }))
    },
  })

  const [searchValue, setSearchValue] = useState(options.search || '')
  const [currentPage, setCurrentPage] = useState(options.page || 1)
  const [gradeFilter, setGradeFilter] = useState(options.grade_level || '')

  // Handler for search
  const handleSearchChange = useCallback((value: string) => {
    setSearchValue(value)
    queryClient.invalidateQueries({ queryKey: ['class-sections'] })
  }, [queryClient])

  // Handler for pagination
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page)
    queryClient.invalidateQueries({ queryKey: ['class-sections'] })
  }, [queryClient])

  // Handler for grade filter
  const handleGradeFilterChange = useCallback((grade: string) => {
    setGradeFilter(grade)
    queryClient.invalidateQueries({ queryKey: ['class-sections'] })
  }, [queryClient])

  const handleCreate = () => {
    setEditingClassSection(null)
    setModalError(null)
    setModalSuccess(null)
    setIsModalOpen(true)
  }

  const handleEdit = (classSection: ClassSection) => {
    setEditingClassSection(classSection)
    setModalError(null)
    setModalSuccess(null)
    setIsModalOpen(true)
  }

  const handleDelete = async (classSection: ClassSection) => {
    setDeleteConfirmation({
      isOpen: true,
      title: 'Delete Class Section',
      message: `Are you sure you want to delete "${classSection.title}"? This action cannot be undone.`,
      onConfirm: () => {
        setDeleteConfirmation(prev => ({ ...prev, loading: true }))
        deleteMutation.mutate(classSection.id)
      },
      loading: false,
    })
  }

  const handleModalSubmit = async (data: CreateClassSectionData) => {
    setModalLoading(true)
    setModalError(null)
    setModalSuccess(null)

    try {
      if (editingClassSection) {
        await updateMutation.mutateAsync({ id: editingClassSection.id, data })
      } else {
        await createMutation.mutateAsync(data)
      }
      setIsModalOpen(false)
    } catch (error) {
      // Error is handled in mutation onError
    } finally {
      setModalLoading(false)
    }
  }

  const handleModalClose = () => {
    setIsModalOpen(false)
    setEditingClassSection(null)
    setModalError(null)
    setModalSuccess(null)
  }

  const handleDeleteConfirmationClose = () => {
    setDeleteConfirmation(prev => ({ ...prev, isOpen: false }))
  }

  return {
    // Data
    classSections,
    pagination,
    loading,
    error,
    
    // Modal state
    isModalOpen,
    editingClassSection,
    modalLoading,
    modalError,
    modalSuccess,
    
    // Delete confirmation
    deleteConfirmation,
    
    // Search and filter state
    searchValue,
    currentPage,
    gradeFilter,
    
    // Handlers
    handleCreate,
    handleEdit,
    handleDelete,
    handleModalSubmit,
    handleModalClose,
    handleDeleteConfirmationClose,
    handleSearchChange,
    handlePageChange,
    handleGradeFilterChange,
    
    // Mutations
    createMutation,
    updateMutation,
    deleteMutation,
  }
} 