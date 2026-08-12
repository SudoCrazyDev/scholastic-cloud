import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { disbursementService } from '../services/disbursementService'
import { userService } from '../services/userService'
import type { Disbursement, DisbursementComponentType, DisbursementFormData } from '../types'
import { toast } from 'react-hot-toast'

export function useDisbursements() {
  const queryClient = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<Disbursement | null>(null)

  const disbursementsQuery = useQuery({
    queryKey: ['disbursements'],
    queryFn: () => disbursementService.getDisbursements(),
  })

  const typesQuery = useQuery({
    queryKey: ['disbursement-types'],
    queryFn: () => disbursementService.getTypes(),
  })

  const componentTypesQuery = useQuery({
    queryKey: ['disbursement-component-types'],
    queryFn: () => disbursementService.getComponentTypes(),
  })

  // Users for the "In-Charge of" dropdown (optional field).
  const usersQuery = useQuery({
    queryKey: ['users', 'disbursement-in-charge'],
    queryFn: () => userService.getUsers({ limit: 200 }),
    staleTime: 5 * 60 * 1000,
  })

  const createMutation = useMutation({
    mutationFn: (data: DisbursementFormData) => disbursementService.createDisbursement(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disbursements'] })
      setIsModalOpen(false)
      setEditing(null)
      toast.success('Disbursement recorded')
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to record disbursement')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: DisbursementFormData }) =>
      disbursementService.updateDisbursement(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disbursements'] })
      setIsModalOpen(false)
      setEditing(null)
      toast.success('Disbursement updated')
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to update disbursement')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => disbursementService.deleteDisbursement(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disbursements'] })
      toast.success('Disbursement deleted')
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to delete disbursement')
    },
  })

  const createTypeMutation = useMutation({
    mutationFn: (name: string) => disbursementService.createType(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disbursement-types'] })
      toast.success('Type added')
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.response?.data?.errors?.name?.[0] || 'Failed to add type')
    },
  })

  const deleteTypeMutation = useMutation({
    mutationFn: (id: string) => disbursementService.deleteType(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disbursement-types'] })
      queryClient.invalidateQueries({ queryKey: ['disbursements'] })
      toast.success('Type deleted')
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to delete type')
    },
  })

  const createComponentTypeMutation = useMutation({
    mutationFn: (name: string) => disbursementService.createComponentType(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disbursement-component-types'] })
      toast.success('Component type added')
    },
    onError: (err: any) => {
      toast.error(
        err.response?.data?.message ||
          err.response?.data?.errors?.name?.[0] ||
          'Failed to add component type'
      )
    },
  })

  const deleteComponentTypeMutation = useMutation({
    mutationFn: (id: string) => disbursementService.deleteComponentType(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disbursement-component-types'] })
      queryClient.invalidateQueries({ queryKey: ['disbursements'] })
      toast.success('Component type deleted')
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to delete component type')
    },
  })

  const disbursements = (disbursementsQuery.data as { data?: Disbursement[] })?.data ?? []
  const types = (typesQuery.data as { data?: any[] })?.data ?? []
  const componentTypes =
    (componentTypesQuery.data as { data?: DisbursementComponentType[] })?.data ?? []
  const users = usersQuery.data?.data ?? []

  const handleCreate = () => {
    setEditing(null)
    setIsModalOpen(true)
  }
  const handleEdit = (d: Disbursement) => {
    setEditing(d)
    setIsModalOpen(true)
  }
  const handleModalClose = () => {
    setIsModalOpen(false)
    setEditing(null)
  }
  const handleModalSubmit = (data: DisbursementFormData) => {
    if (editing) {
      updateMutation.mutate({ id: editing.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  return {
    disbursements,
    types,
    componentTypes,
    users,
    isLoading: disbursementsQuery.isLoading,
    error: disbursementsQuery.error,
    isModalOpen,
    editing,
    modalLoading: createMutation.isPending || updateMutation.isPending,
    handleCreate,
    handleEdit,
    handleModalClose,
    handleModalSubmit,
    deleteDisbursement: deleteMutation.mutateAsync,
    createType: createTypeMutation.mutateAsync,
    deleteType: deleteTypeMutation.mutateAsync,
    typeMutationLoading: createTypeMutation.isPending || deleteTypeMutation.isPending,
    createComponentType: createComponentTypeMutation.mutateAsync,
    deleteComponentType: deleteComponentTypeMutation.mutateAsync,
    componentTypeMutationLoading:
      createComponentTypeMutation.isPending || deleteComponentTypeMutation.isPending,
  }
}
