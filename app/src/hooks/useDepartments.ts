import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { departmentService } from '../services/departmentService'
import type { Department, CreateDepartmentData, UpdateDepartmentData } from '../types'
import { useAuth } from './useAuth'
import { toast } from 'react-hot-toast'

interface UseDepartmentsOptions {
  institutionId?: string | null
  enabled?: boolean
}

export function useDepartments(options: UseDepartmentsOptions = {}) {
  const { user } = useAuth()
  const institutionId = options.institutionId ?? user?.user_institutions?.[0]?.institution_id ?? null
  const queryClient = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null)

  const query = useQuery({
    queryKey: ['departments', institutionId],
    queryFn: () => departmentService.getDepartments(institutionId ?? undefined),
    enabled: (options.enabled !== false) && !!institutionId,
  })

  const createMutation = useMutation({
    mutationFn: (data: CreateDepartmentData) =>
      departmentService.createDepartment(data, institutionId ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] })
      setIsModalOpen(false)
      setEditingDepartment(null)
      toast.success('Department created successfully')
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || err.response?.data?.errors?.slug?.[0] || 'Failed to create department'
      toast.error(msg)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateDepartmentData }) =>
      departmentService.updateDepartment(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] })
      setIsModalOpen(false)
      setEditingDepartment(null)
      toast.success('Department updated successfully')
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || err.response?.data?.errors?.slug?.[0] || 'Failed to update department'
      toast.error(msg)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => departmentService.deleteDepartment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] })
      toast.success('Department deleted')
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to delete department')
    },
  })

  const departments = (query.data as { data?: Department[] })?.data ?? []
  const handleCreate = () => {
    setEditingDepartment(null)
    setIsModalOpen(true)
  }
  const handleEdit = (d: Department) => {
    setEditingDepartment(d)
    setIsModalOpen(true)
  }
  const handleModalSubmit = (data: CreateDepartmentData) => {
    if (editingDepartment) {
      updateMutation.mutate({ id: editingDepartment.id, data })
    } else {
      createMutation.mutate(data)
    }
  }
  const handleModalClose = () => {
    setIsModalOpen(false)
    setEditingDepartment(null)
  }

  return {
    departments,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    isModalOpen,
    editingDepartment,
    modalLoading: createMutation.isPending || updateMutation.isPending,
    handleCreate,
    handleEdit,
    handleModalSubmit,
    handleModalClose,
    deleteDepartment: deleteMutation.mutateAsync,
    institutionId,
  }
}
