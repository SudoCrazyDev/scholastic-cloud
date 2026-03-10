import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { gradeLevelService } from '../services/gradeLevelService'
import type { CreateGradeLevelData, UpdateGradeLevelData } from '../types'
import { toast } from 'react-hot-toast'

const QUERY_KEY = ['grade-levels']

export function useGradeLevels() {
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => gradeLevelService.getGradeLevels(),
    staleTime: 5 * 60 * 1000,
  })

  return {
    gradeLevels: query.data ?? [],
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useGradeLevelMutations() {
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: (data: CreateGradeLevelData) => gradeLevelService.createGradeLevel(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      toast.success('Grade level created successfully')
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message ?? 'Failed to create grade level')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateGradeLevelData }) =>
      gradeLevelService.updateGradeLevel(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      toast.success('Grade level updated successfully')
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message ?? 'Failed to update grade level')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => gradeLevelService.deleteGradeLevel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      toast.success('Grade level deleted successfully')
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message ?? 'Failed to delete grade level')
    },
  })

  return {
    createMutation,
    updateMutation,
    deleteMutation,
  }
}
