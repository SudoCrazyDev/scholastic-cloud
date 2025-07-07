import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { userService } from '../services/userService'
import { roleService } from '../services/roleService'
import { institutionService } from '../services/institutionService'
import type { User, Role, Institution, CreateUserData, UpdateUserData } from '../types'

interface DeleteConfirmation {
  isOpen: boolean
  title: string
  message: string
  onConfirm: () => void
  loading: boolean
}

interface UseUsersOptions {
  page?: number
  limit?: number
  search?: string
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
}

export const useUsers = (options: UseUsersOptions = {}) => {
  const queryClient = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [selectedRows, setSelectedRows] = useState<User[]>([])
  
  // Delete confirmation modal state
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    loading: false,
  })

  // Query key for users
  const queryKey = ['users', options]

  // Fetch users query
  const {
    data: usersResponse,
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => userService.getUsers(options),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  })

  const users = usersResponse?.data || []
  const pagination = usersResponse?.pagination

  // Fetch roles query
  const { data: rolesResponse } = useQuery({
    queryKey: ['roles', { limit: 100 }],
    queryFn: () => roleService.getRoles({ limit: 100 }),
    staleTime: 10 * 60 * 1000, // 10 minutes
  })

  const roles = rolesResponse?.data || []

  // Fetch institutions query
  const { data: institutionsResponse } = useQuery({
    queryKey: ['institutions', { limit: 100 }],
    queryFn: () => institutionService.getInstitutions({ limit: 100 }),
    staleTime: 10 * 60 * 1000, // 10 minutes
  })

  const institutions = institutionsResponse?.data || []

  // Create user mutation
  const createMutation = useMutation({
    mutationFn: async (data: CreateUserData) => {
      const newUser = await userService.createUser(data)
      
      // If institutions are selected, assign them to the user
      if (data.institution_ids && data.institution_ids.length > 0) {
        await Promise.all(
          data.institution_ids.map((institutionId, index) => 
            userService.assignUserToInstitution(
              newUser.data.id, 
              institutionId, 
              index === 0 // First institution is default
            )
          )
        )
      }
      
      return newUser
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setIsModalOpen(false)
      setEditingUser(null)
      setModalError(null)
    },
    onError: (error: any) => {
      console.error('Error creating user:', error)
      if (error.response?.data?.message) {
        setModalError(error.response.data.message)
      } else if (error.response?.data?.errors) {
        const errors = error.response.data.errors
        const errorMessages = Object.values(errors).flat().join(', ')
        setModalError(errorMessages)
      } else {
        setModalError('Failed to create user. Please try again.')
      }
    },
  })

  // Update user mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserData }) =>
      userService.updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setIsModalOpen(false)
      setEditingUser(null)
      setModalError(null)
    },
    onError: (error: any) => {
      console.error('Error updating user:', error)
      if (error.response?.data?.message) {
        setModalError(error.response.data.message)
      } else if (error.response?.data?.errors) {
        const errors = error.response.data.errors
        const errorMessages = Object.values(errors).flat().join(', ')
        setModalError(errorMessages)
      } else {
        setModalError('Failed to update user. Please try again.')
      }
    },
  })

  // Delete user mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => userService.deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setDeleteConfirmation(prev => ({ ...prev, isOpen: false, loading: false }))
    },
    onError: (error: any) => {
      console.error('Error deleting user:', error)
      setDeleteConfirmation(prev => ({ 
        ...prev, 
        loading: false,
        title: 'Error',
        message: error.response?.data?.message || 'Failed to delete user. Please try again.',
        onConfirm: () => setDeleteConfirmation(prev => ({ ...prev, isOpen: false }))
      }))
    },
  })

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map(id => userService.deleteUser(id))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setSelectedRows([])
      setDeleteConfirmation(prev => ({ ...prev, isOpen: false, loading: false }))
    },
    onError: (error: any) => {
      console.error('Error deleting users:', error)
      setDeleteConfirmation(prev => ({ 
        ...prev, 
        loading: false,
        title: 'Error',
        message: error.response?.data?.message || 'Failed to delete some users. Please try again.',
        onConfirm: () => setDeleteConfirmation(prev => ({ ...prev, isOpen: false }))
      }))
    },
  })

  const handleCreate = () => {
    setEditingUser(null)
    setModalError(null)
    setIsModalOpen(true)
  }

  const handleEdit = (user: User) => {
    setEditingUser(user)
    setModalError(null)
    setIsModalOpen(true)
  }

  const handleDelete = async (user: User) => {
    const fullName = `${user.first_name} ${user.last_name}`.trim()
    setDeleteConfirmation({
      isOpen: true,
      title: 'Delete User',
      message: `Are you sure you want to delete the user "${fullName}"?\n\nThis action cannot be undone.`,
      onConfirm: async () => {
        setDeleteConfirmation(prev => ({ ...prev, loading: true }))
        deleteMutation.mutate(user.id)
      },
      loading: false,
    })
  }

  const handleBulkDelete = async () => {
    if (selectedRows.length === 0) return

    const userNames = selectedRows.map(user => `${user.first_name} ${user.last_name}`.trim()).join('\n• ')
    setDeleteConfirmation({
      isOpen: true,
      title: 'Delete Multiple Users',
      message: `Are you sure you want to delete the following ${selectedRows.length} user(s)?\n\n• ${userNames}\n\nThis action cannot be undone.`,
      onConfirm: async () => {
        setDeleteConfirmation(prev => ({ ...prev, loading: true }))
        bulkDeleteMutation.mutate(selectedRows.map(user => user.id))
      },
      loading: false,
    })
  }

  const handleModalSubmit = async (data: CreateUserData) => {
    setModalLoading(true)
    setModalError(null)

    if (editingUser) {
      // Update existing user
      updateMutation.mutate({ id: editingUser.id, data: data as UpdateUserData })
    } else {
      // Create new user
      createMutation.mutate(data)
    }
    
    setModalLoading(false)
  }

  const handleModalClose = () => {
    if (!modalLoading && !createMutation.isPending && !updateMutation.isPending) {
      setIsModalOpen(false)
      setEditingUser(null)
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
    users,
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
    roles,
    institutions,
    
    // Modal state
    isModalOpen,
    editingUser,
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