import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { roleService } from '../services/roleService'
import type { Role, CreateRoleData, UpdateRoleData } from '../types'

interface DeleteConfirmation {
  isOpen: boolean
  title: string
  message: string
  onConfirm: () => void
  loading: boolean
}

interface UseRolesOptions {
  page?: number
  limit?: number
  search?: string
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
}

export const useRoles = (options: UseRolesOptions = {}) => {
  const queryClient = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [selectedRows, setSelectedRows] = useState<Role[]>([])
  
  // Delete confirmation modal state
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    loading: false,
  })

  // Query key for roles
  const queryKey = ['roles', options]

  // Fetch roles query
  const {
    data: rolesResponse,
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => roleService.getRoles(options),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  })

  const roles = rolesResponse?.data || []
  const pagination = rolesResponse?.pagination

  // Create role mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateRoleData) => roleService.createRole(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      setIsModalOpen(false)
      setEditingRole(null)
      setModalError(null)
    },
    onError: (error: any) => {
      console.error('Error creating role:', error)
      if (error.response?.data?.message) {
        setModalError(error.response.data.message)
      } else if (error.response?.data?.errors) {
        const errors = error.response.data.errors
        const errorMessages = Object.values(errors).flat().join(', ')
        setModalError(errorMessages)
      } else {
        setModalError('Failed to create role. Please try again.')
      }
    },
  })

  // Update role mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateRoleData }) =>
      roleService.updateRole(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      setIsModalOpen(false)
      setEditingRole(null)
      setModalError(null)
    },
    onError: (error: any) => {
      console.error('Error updating role:', error)
      if (error.response?.data?.message) {
        setModalError(error.response.data.message)
      } else if (error.response?.data?.errors) {
        const errors = error.response.data.errors
        const errorMessages = Object.values(errors).flat().join(', ')
        setModalError(errorMessages)
      } else {
        setModalError('Failed to update role. Please try again.')
      }
    },
  })

  // Delete role mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => roleService.deleteRole(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      setDeleteConfirmation(prev => ({ ...prev, isOpen: false, loading: false }))
    },
    onError: (error: any) => {
      console.error('Error deleting role:', error)
      setDeleteConfirmation(prev => ({ 
        ...prev, 
        loading: false,
        title: 'Error',
        message: error.response?.data?.message || 'Failed to delete role. Please try again.',
        onConfirm: () => setDeleteConfirmation(prev => ({ ...prev, isOpen: false }))
      }))
    },
  })

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map(id => roleService.deleteRole(id))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      setSelectedRows([])
      setDeleteConfirmation(prev => ({ ...prev, isOpen: false, loading: false }))
    },
    onError: (error: any) => {
      console.error('Error deleting roles:', error)
      setDeleteConfirmation(prev => ({ 
        ...prev, 
        loading: false,
        title: 'Error',
        message: error.response?.data?.message || 'Failed to delete some roles. Please try again.',
        onConfirm: () => setDeleteConfirmation(prev => ({ ...prev, isOpen: false }))
      }))
    },
  })

  const handleCreate = () => {
    setEditingRole(null)
    setModalError(null)
    setIsModalOpen(true)
  }

  const handleEdit = (role: Role) => {
    setEditingRole(role)
    setModalError(null)
    setIsModalOpen(true)
  }

  const handleDelete = async (role: Role) => {
    setDeleteConfirmation({
      isOpen: true,
      title: 'Delete Role',
      message: `Are you sure you want to delete the role "${role.title}"?\n\nThis action cannot be undone.`,
      onConfirm: async () => {
        setDeleteConfirmation(prev => ({ ...prev, loading: true }))
        deleteMutation.mutate(role.id)
      },
      loading: false,
    })
  }

  const handleBulkDelete = async () => {
    if (selectedRows.length === 0) return

    const roleNames = selectedRows.map(role => role.title).join('\n• ')
    setDeleteConfirmation({
      isOpen: true,
      title: 'Delete Multiple Roles',
      message: `Are you sure you want to delete the following ${selectedRows.length} role(s)?\n\n• ${roleNames}\n\nThis action cannot be undone.`,
      onConfirm: async () => {
        setDeleteConfirmation(prev => ({ ...prev, loading: true }))
        bulkDeleteMutation.mutate(selectedRows.map(role => role.id))
      },
      loading: false,
    })
  }

  const handleModalSubmit = async (data: CreateRoleData) => {
    setModalLoading(true)
    setModalError(null)

    if (editingRole) {
      // Update existing role
      updateMutation.mutate({ id: editingRole.id, data: data as UpdateRoleData })
    } else {
      // Create new role
      createMutation.mutate(data)
    }
    
    setModalLoading(false)
  }

  const handleModalClose = () => {
    if (!modalLoading && !createMutation.isPending && !updateMutation.isPending) {
      setIsModalOpen(false)
      setEditingRole(null)
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
    roles,
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
    editingRole,
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