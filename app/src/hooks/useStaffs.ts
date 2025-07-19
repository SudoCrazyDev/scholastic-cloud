import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { staffService } from '../services/staffService'
import { roleService } from '../services/roleService'
import type { User, CreateStaffData, UpdateStaffData, UpdateStaffRoleData } from '../types'

interface DeleteConfirmation {
  isOpen: boolean
  title: string
  message: string
  onConfirm: () => void
  loading: boolean
}

interface UseStaffsOptions {
  page?: number
  limit?: number
  search?: string
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
}

export const useStaffs = (options: UseStaffsOptions = {}) => {
  const queryClient = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingStaff, setEditingStaff] = useState<User | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [modalSuccess, setModalSuccess] = useState<string | null>(null)
  const [selectedRows, setSelectedRows] = useState<User[]>([])
  
  // Delete confirmation modal state
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    loading: false,
  })

  // Change role modal state
  const [isChangeRoleModalOpen, setIsChangeRoleModalOpen] = useState(false)
  const [changingRoleStaff, setChangingRoleStaff] = useState<User | null>(null)
  const [changeRoleLoading, setChangeRoleLoading] = useState(false)
  const [changeRoleError, setChangeRoleError] = useState<string | null>(null)
  const [changeRoleSuccess, setChangeRoleSuccess] = useState<string | null>(null)

  // Query key for staffs
  const queryKey = ['staffs', options]

  // Fetch staffs query
  const {
    data: staffsResponse,
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => staffService.getStaffs(options),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  })

  const staffs = staffsResponse?.data || []
  const pagination = staffsResponse?.pagination

  // Fetch roles query
  const { data: rolesResponse } = useQuery({
    queryKey: ['roles', { limit: 100 }],
    queryFn: () => roleService.getRoles({ limit: 100 }),
    staleTime: 10 * 60 * 1000, // 10 minutes
  })

  const roles = rolesResponse?.data || []

  // Create staff mutation
  const createMutation = useMutation({
    mutationFn: async (data: CreateStaffData) => {
      const newStaff = await staffService.createStaff(data)
      refetch();
      return newStaff
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staffs'] })
      setModalSuccess('Staff member created successfully!')
      setModalError(null)
    },
    onError: (error: any) => {
      console.error('Error creating staff:', error)
      if (error.response?.data?.message) {
        setModalError(error.response.data.message)
      } else if (error.response?.data?.errors) {
        const errors = error.response.data.errors
        const errorMessages = Object.values(errors).flat().join(', ')
        setModalError(errorMessages)
      } else {
        setModalError('Failed to create staff member. Please try again.')
      }
    },
  })

  // Update staff mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateStaffData }) =>
      staffService.updateStaff(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staffs'] })
      setModalSuccess('Staff member updated successfully!')
      setModalError(null)
    },
    onError: (error: any) => {
      console.error('Error updating staff:', error)
      if (error.response?.data?.message) {
        setModalError(error.response.data.message)
      } else if (error.response?.data?.errors) {
        const errors = error.response.data.errors
        const errorMessages = Object.values(errors).flat().join(', ')
        setModalError(errorMessages)
      } else {
        setModalError('Failed to update staff member. Please try again.')
      }
    },
  })

  // Update staff role mutation
  const updateRoleMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateStaffRoleData }) =>
      staffService.updateStaffRole(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staffs'] })
      setChangeRoleSuccess('Staff role updated successfully!')
      setChangeRoleError(null)
    },
    onError: (error: any) => {
      console.error('Error updating staff role:', error)
      if (error.response?.data?.message) {
        setChangeRoleError(error.response.data.message)
      } else if (error.response?.data?.errors) {
        const errors = error.response.data.errors
        const errorMessages = Object.values(errors).flat().join(', ')
        setChangeRoleError(errorMessages)
      } else {
        setChangeRoleError('Failed to update staff role. Please try again.')
      }
    },
  })

  // Delete staff mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => staffService.deleteStaff(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staffs'] })
      setDeleteConfirmation(prev => ({ ...prev, isOpen: false, loading: false }))
    },
    onError: (error: any) => {
      console.error('Error deleting staff:', error)
      setDeleteConfirmation(prev => ({ 
        ...prev, 
        loading: false,
        title: 'Error',
        message: error.response?.data?.message || 'Failed to delete staff member. Please try again.',
        onConfirm: () => setDeleteConfirmation(prev => ({ ...prev, isOpen: false }))
      }))
    },
  })

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map(id => staffService.deleteStaff(id))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staffs'] })
      setSelectedRows([])
      setDeleteConfirmation(prev => ({ ...prev, isOpen: false, loading: false }))
    },
    onError: (error: any) => {
      console.error('Error deleting staffs:', error)
      setDeleteConfirmation(prev => ({ 
        ...prev, 
        loading: false,
        title: 'Error',
        message: error.response?.data?.message || 'Failed to delete some staff members. Please try again.',
        onConfirm: () => setDeleteConfirmation(prev => ({ ...prev, isOpen: false }))
      }))
    },
  })

  const [searchValue, setSearchValue] = useState(options.search || '')
  const [currentPage, setCurrentPage] = useState(options.page || 1)

  // Handler for search
  const handleSearchChange = useCallback((value: string) => {
    setSearchValue(value)
    queryClient.invalidateQueries({ queryKey: ['staffs'] })
  }, [queryClient])

  // Handler for pagination
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page)
    queryClient.invalidateQueries({ queryKey: ['staffs'] })
  }, [queryClient])

  const handleCreate = () => {
    setEditingStaff(null)
    setModalError(null)
    setModalSuccess(null)
    setIsModalOpen(true)
  }

  const handleEdit = (staff: User) => {
    setEditingStaff(staff)
    setModalError(null)
    setModalSuccess(null)
    setIsModalOpen(true)
  }

  const handleDelete = async (staff: User) => {
    setDeleteConfirmation({
      isOpen: true,
      title: 'Delete Staff Member',
      message: `Are you sure you want to delete ${staff.first_name} ${staff.last_name}? This action cannot be undone.`,
      onConfirm: async () => {
        setDeleteConfirmation(prev => ({ ...prev, loading: true }))
        await deleteMutation.mutateAsync(staff.id)
      },
      loading: false,
    })
  }

  const handleBulkDelete = async () => {
    if (selectedRows.length === 0) return

    setDeleteConfirmation({
      isOpen: true,
      title: 'Delete Multiple Staff Members',
      message: `Are you sure you want to delete ${selectedRows.length} staff member(s)? This action cannot be undone.`,
      onConfirm: async () => {
        setDeleteConfirmation(prev => ({ ...prev, loading: true }))
        await bulkDeleteMutation.mutateAsync(selectedRows.map(staff => staff.id))
      },
      loading: false,
    })
  }

  const handleChangeRole = (staff: User) => {
    setChangingRoleStaff(staff)
    setChangeRoleError(null)
    setChangeRoleSuccess(null)
    setIsChangeRoleModalOpen(true)
  }

  const handleModalSubmit = async (data: CreateStaffData) => {
    setModalLoading(true)
    try {
      if (editingStaff) {
        await updateMutation.mutateAsync({ id: editingStaff.id, data })
      } else {
        await createMutation.mutateAsync(data)
      }
      setIsModalOpen(false)
    } finally {
      setModalLoading(false)
    }
  }

  const handleChangeRoleSubmit = async (data: UpdateStaffRoleData) => {
    if (!changingRoleStaff) return
    
    setChangeRoleLoading(true)
    try {
      await updateRoleMutation.mutateAsync({ id: changingRoleStaff.id, data })
      setIsChangeRoleModalOpen(false)
    } finally {
      setChangeRoleLoading(false)
    }
  }

  const handleModalClose = () => {
    setIsModalOpen(false)
    setEditingStaff(null)
    setModalError(null)
    setModalSuccess(null)
  }

  const handleChangeRoleModalClose = () => {
    setIsChangeRoleModalOpen(false)
    setChangingRoleStaff(null)
    setChangeRoleError(null)
    setChangeRoleSuccess(null)
  }

  const handleDeleteConfirmationClose = () => {
    setDeleteConfirmation(prev => ({ ...prev, isOpen: false }))
  }

  return {
    // Data
    staffs,
    roles,
    pagination,
    loading,
    error,
    
    // Modal states
    isModalOpen,
    editingStaff,
    modalLoading,
    modalError,
    modalSuccess,
    
    // Change role modal states
    isChangeRoleModalOpen,
    changingRoleStaff,
    changeRoleLoading,
    changeRoleError,
    changeRoleSuccess,
    
    // Delete confirmation
    deleteConfirmation,
    
    // Selection
    selectedRows,
    setSelectedRows,
    
    // Search and pagination
    searchValue,
    currentPage,
    handleSearchChange,
    handlePageChange,
    
    // Handlers
    handleCreate,
    handleEdit,
    handleDelete,
    handleBulkDelete,
    handleChangeRole,
    handleModalSubmit,
    handleChangeRoleSubmit,
    handleModalClose,
    handleChangeRoleModalClose,
    handleDeleteConfirmationClose,
    
    // Mutations
    createMutation,
    updateMutation,
    updateRoleMutation,
    deleteMutation,
    bulkDeleteMutation,
  }
} 