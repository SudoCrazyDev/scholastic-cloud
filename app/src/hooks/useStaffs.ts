import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { staffService } from '../services/staffService'
import { roleService } from '../services/roleService'
import { toast } from 'react-hot-toast'
import type { User, CreateStaffData, UpdateStaffData, UpdateStaffRoleData } from '../types'

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

  // Change role modal state
  const [isChangeRoleModalOpen, setIsChangeRoleModalOpen] = useState(false)
  const [changingRoleStaff, setChangingRoleStaff] = useState<User | null>(null)
  const [changeRoleLoading, setChangeRoleLoading] = useState(false)
  const [changeRoleError, setChangeRoleError] = useState<string | null>(null)
  const [changeRoleSuccess, setChangeRoleSuccess] = useState<string | null>(null)

  // Reset password modal state
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState(false)
  const [resettingPasswordStaff, setResettingPasswordStaff] = useState<User | null>(null)
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false)
  const [resetPasswordError, setResetPasswordError] = useState<string | null>(null)
  const [resetPasswordSuccess, setResetPasswordSuccess] = useState<string | null>(null)
  const [resetPasswordTemporaryPassword, setResetPasswordTemporaryPassword] = useState<string | null>(null)

  // Search and pagination state
  const [searchValue, setSearchValue] = useState(options.search || '')
  const [currentPage, setCurrentPage] = useState(options.page || 1)

  // Build query parameters
  const queryParams = {
    page: currentPage,
    limit: options.limit || 15,
    search: searchValue,
    sortBy: options.sortBy,
    sortDirection: options.sortDirection,
  }

  // Query key for staffs - include search and pagination parameters
  const queryKey = ['staffs', queryParams]

  // Fetch staffs query
  const {
    data: staffsResponse,
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => staffService.getStaffs(queryParams),
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
      if (error.response?.data?.errors) {
        const errors = error.response.data.errors
        // Get the first error from the first field
        const firstErrorKey = Object.keys(errors)[0]
        const firstErrorArray = errors[firstErrorKey]
        if (Array.isArray(firstErrorArray) && firstErrorArray.length > 0) {
          setModalError(firstErrorArray[0])
        } else {
          setModalError('Validation failed. Please check your input.')
        }
      } else if (error.response?.data?.message) {
        setModalError(error.response.data.message)
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
      if (error.response?.data?.errors) {
        const errors = error.response.data.errors
        // Get the first error from the first field
        const firstErrorKey = Object.keys(errors)[0]
        const firstErrorArray = errors[firstErrorKey]
        if (Array.isArray(firstErrorArray) && firstErrorArray.length > 0) {
          setModalError(firstErrorArray[0])
        } else {
          setModalError('Validation failed. Please check your input.')
        }
      } else if (error.response?.data?.message) {
        setModalError(error.response.data.message)
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
      if (error.response?.data?.errors) {
        const errors = error.response.data.errors
        // Get the first error from the first field
        const firstErrorKey = Object.keys(errors)[0]
        const firstErrorArray = errors[firstErrorKey]
        if (Array.isArray(firstErrorArray) && firstErrorArray.length > 0) {
          setChangeRoleError(firstErrorArray[0])
        } else {
          setChangeRoleError('Validation failed. Please check your input.')
        }
      } else if (error.response?.data?.message) {
        setChangeRoleError(error.response.data.message)
      } else {
        setChangeRoleError('Failed to update staff role. Please try again.')
      }
    },
  })

  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: (id: string) => staffService.resetPassword(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['staffs'] })
      // The temporary password is random and returned exactly once, so it has
      // to reach the admin here — there is no way to look it up afterwards.
      const temporaryPassword = result?.data?.temporary_password ?? null
      setResetPasswordTemporaryPassword(temporaryPassword)
      setResetPasswordSuccess(
        temporaryPassword
          ? 'Password reset. Share the temporary password below with the staff member now — it will not be shown again.'
          : 'Password reset successfully!'
      )
      setResetPasswordError(null)
      
      // Show success toast notification
      toast.success('✅ Password reset successfully!', {
        duration: 4000,
        icon: '🔐',
        style: {
          background: '#10b981',
          color: 'white',
          fontWeight: '600',
        },
      })
    },
    onError: (error: any) => {
      console.error('Error resetting password:', error)
      if (error.response?.data?.errors) {
        const errors = error.response.data.errors
        // Get the first error from the first field
        const firstErrorKey = Object.keys(errors)[0]
        const firstErrorArray = errors[firstErrorKey]
        if (Array.isArray(firstErrorArray) && firstErrorArray.length > 0) {
          setResetPasswordError(firstErrorArray[0])
        } else {
          setResetPasswordError('Validation failed. Please check your input.')
        }
      } else if (error.response?.data?.message) {
        setResetPasswordError(error.response.data.message)
      } else {
        setResetPasswordError('Failed to reset password. Please try again.')
      }
    },
  })

  // Handler for search - reset to page 1 when searching
  const handleSearchChange = useCallback((value: string) => {
    setSearchValue(value)
    setCurrentPage(1) // Reset to first page when searching
  }, [])

  // Handler for pagination
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page)
  }, [])

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

  const handleChangeRole = (staff: User) => {
    setChangingRoleStaff(staff)
    setChangeRoleError(null)
    setChangeRoleSuccess(null)
    setIsChangeRoleModalOpen(true)
  }

  const handleResetPassword = (staff: User) => {
    setResettingPasswordStaff(staff)
    setResetPasswordError(null)
    setResetPasswordSuccess(null)
    setResetPasswordTemporaryPassword(null)
    setIsResetPasswordModalOpen(true)
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

  const handleResetPasswordSubmit = async () => {
    if (!resettingPasswordStaff) return
    
    setResetPasswordLoading(true)
    try {
      // The modal deliberately stays open: the API returns the temporary
      // password exactly once and there is nowhere to look it up afterwards,
      // so the admin has to read it off this screen before dismissing it.
      await resetPasswordMutation.mutateAsync(resettingPasswordStaff.id)
    } catch {
      // Already surfaced in the modal by the mutation's onError.
    } finally {
      setResetPasswordLoading(false)
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

  const handleResetPasswordModalClose = () => {
    setIsResetPasswordModalOpen(false)
    setResettingPasswordStaff(null)
    setResetPasswordError(null)
    setResetPasswordSuccess(null)
    setResetPasswordTemporaryPassword(null)
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
    
    // Reset password modal states
    isResetPasswordModalOpen,
    resettingPasswordStaff,
    resetPasswordLoading,
    resetPasswordError,
    resetPasswordSuccess,
    resetPasswordTemporaryPassword,
    
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
    handleChangeRole,
    handleResetPassword,
    handleModalSubmit,
    handleChangeRoleSubmit,
    handleResetPasswordSubmit,
    handleModalClose,
    handleChangeRoleModalClose,
    handleResetPasswordModalClose,

    // Mutations
    createMutation,
    updateMutation,
    updateRoleMutation,
    resetPasswordMutation,
  }
} 