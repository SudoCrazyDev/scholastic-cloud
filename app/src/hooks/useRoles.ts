import { useState } from 'react'
import { useDataTable } from './useDataTable'
import { roleService } from '../services/roleService'
import type { Role, CreateRoleData, UpdateRoleData } from '../types'

export const useRoles = () => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  const {
    data: roles,
    loading,
    error,
    pagination,
    search,
    sorting,
    refresh,
    selectedRows,
    setSelectedRows,
  } = useDataTable<Role>({
    endpoint: '/roles',
    searchFields: ['title', 'slug'],
    onError: (error) => {
      console.error('Roles error:', error)
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
    if (window.confirm(`Are you sure you want to delete the role "${role.title}"?`)) {
      try {
        await roleService.deleteRole(role.id)
        refresh()
      } catch (error: any) {
        console.error('Error deleting role:', error)
        alert('Failed to delete role. Please try again.')
      }
    }
  }

  const handleBulkDelete = async () => {
    if (selectedRows.length === 0) return

    const roleNames = selectedRows.map(role => role.title).join(', ')
    if (window.confirm(`Are you sure you want to delete the following roles?\n\n${roleNames}`)) {
      try {
        await Promise.all(selectedRows.map(role => roleService.deleteRole(role.id)))
        setSelectedRows([])
        refresh()
      } catch (error: any) {
        console.error('Error deleting roles:', error)
        alert('Failed to delete some roles. Please try again.')
      }
    }
  }

  const handleModalSubmit = async (data: CreateRoleData) => {
    setModalLoading(true)
    setModalError(null)

    try {
      if (editingRole) {
        // Update existing role
        await roleService.updateRole(editingRole.id, data as UpdateRoleData)
      } else {
        // Create new role
        await roleService.createRole(data)
      }
      
      refresh()
      setIsModalOpen(false)
    } catch (error: any) {
      console.error('Error saving role:', error)
      
      if (error.response?.data?.message) {
        setModalError(error.response.data.message)
      } else if (error.response?.data?.errors) {
        // Handle validation errors
        const errors = error.response.data.errors
        const errorMessages = Object.values(errors).flat().join(', ')
        setModalError(errorMessages)
      } else {
        setModalError('Failed to save role. Please try again.')
      }
    } finally {
      setModalLoading(false)
    }
  }

  const handleModalClose = () => {
    if (!modalLoading) {
      setIsModalOpen(false)
      setEditingRole(null)
      setModalError(null)
    }
  }

  return {
    // Data
    roles,
    loading,
    error,
    pagination,
    search,
    sorting,
    selectedRows,
    
    // Modal state
    isModalOpen,
    editingRole,
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