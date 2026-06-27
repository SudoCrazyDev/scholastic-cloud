import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { gradingScaleService } from '../services/gradingScaleService'
import type { CreateGradingScaleData, UpdateGradingScaleData } from '../types'
import { toast } from 'react-hot-toast'

const QUERY_KEY = ['grading-scales']

interface ApiError {
  response?: { data?: { message?: string } }
}

export function useGradingScales() {
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => gradingScaleService.getGradingScales(),
    staleTime: 5 * 60 * 1000,
  })

  return {
    gradingScales: query.data ?? [],
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useGradingScaleMutations() {
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: (data: CreateGradingScaleData) => gradingScaleService.createGradingScale(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      toast.success('Grading scale created successfully')
    },
    onError: (err: ApiError) => {
      toast.error(err.response?.data?.message ?? 'Failed to create grading scale')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateGradingScaleData }) =>
      gradingScaleService.updateGradingScale(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      toast.success('Grading scale updated successfully')
    },
    onError: (err: ApiError) => {
      toast.error(err.response?.data?.message ?? 'Failed to update grading scale')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => gradingScaleService.deleteGradingScale(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      toast.success('Grading scale deleted successfully')
    },
    onError: (err: ApiError) => {
      toast.error(err.response?.data?.message ?? 'Failed to delete grading scale')
    },
  })

  return {
    createMutation,
    updateMutation,
    deleteMutation,
  }
}
