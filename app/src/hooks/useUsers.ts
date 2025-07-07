import { useState } from 'react'
import { useDataTable } from './useDataTable'
import { userService } from '../services/userService'
import { roleService } from '../services/roleService'
import { institutionService } from '../services/institutionService'
import type { User, Role, Institution, CreateUserData, UpdateUserData } from '../types'

export const useUsers = () => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [roles, setRoles] = useState<Role[]>([])
  const [institutions, setInstitutions] = useState<Institution[]>([])

  const {
    data: users,
    loading,
    error,
    pagination,
    search,
    sorting,
    refresh,
    selectedRows,
    setSelectedRows,
  } = useDataTable<User>({
    endpoint: '/users',
    searchFields: ['first_name', 'last_name', 'email'],
    onError: (error) => {
      console.error('Users error:', error)
    },
  })

  // Load roles and institutions for the modal
  const loadModalData = async () => {
    try {
      const [rolesResponse, institutionsResponse] = await Promise.all([
        roleService.getRoles({ limit: 100 }),
        institutionService.getInstitutions({ limit: 100 })
      ])
      
      setRoles(rolesResponse.data || [])
      setInstitutions(institutionsResponse.data || [])
    } catch (error) {
      console.error('Error loading modal data:', error)
    }
  }

  const handleCreate = async () => {
    setEditingUser(null)
    setModalError(null)
    await loadModalData()
    setIsModalOpen(true)
  }

  const handleEdit = async (user: User) => {
    setEditingUser(user)
    setModalError(null)
    await loadModalData()
    setIsModalOpen(true)
  }

  const handleDelete = async (user: User) => {
    const fullName = `${user.first_name} ${user.last_name}`.trim()
    if (window.confirm(`Are you sure you want to delete the user "${fullName}"?`)) {
      try {
        await userService.deleteUser(user.id)
        refresh()
      } catch (error: any) {
        console.error('Error deleting user:', error)
        alert('Failed to delete user. Please try again.')
      }
    }
  }

  const handleBulkDelete = async () => {
    if (selectedRows.length === 0) return

    const userNames = selectedRows.map(user => `${user.first_name} ${user.last_name}`.trim()).join(', ')
    if (window.confirm(`Are you sure you want to delete the following users?\n\n${userNames}`)) {
      try {
        await Promise.all(selectedRows.map(user => userService.deleteUser(user.id)))
        setSelectedRows([])
        refresh()
      } catch (error: any) {
        console.error('Error deleting users:', error)
        alert('Failed to delete some users. Please try again.')
      }
    }
  }

  const handleModalSubmit = async (data: CreateUserData) => {
    setModalLoading(true)
    setModalError(null)

    try {
      if (editingUser) {
        // Update existing user
        await userService.updateUser(editingUser.id, data as UpdateUserData)
      } else {
        // Create new user
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
      }
      
      refresh()
      setIsModalOpen(false)
    } catch (error: any) {
      console.error('Error saving user:', error)
      
      if (error.response?.data?.message) {
        setModalError(error.response.data.message)
      } else if (error.response?.data?.errors) {
        // Handle validation errors
        const errors = error.response.data.errors
        const errorMessages = Object.values(errors).flat().join(', ')
        setModalError(errorMessages)
      } else {
        setModalError('Failed to save user. Please try again.')
      }
    } finally {
      setModalLoading(false)
    }
  }

  const handleModalClose = () => {
    if (!modalLoading) {
      setIsModalOpen(false)
      setEditingUser(null)
      setModalError(null)
    }
  }

  return {
    // Data
    users,
    loading,
    error,
    pagination,
    search,
    sorting,
    selectedRows,
    roles,
    institutions,
    
    // Modal state
    isModalOpen,
    editingUser,
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