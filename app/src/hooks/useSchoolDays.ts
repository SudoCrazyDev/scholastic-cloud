import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { schoolDayService } from '../services/schoolDayService'
import type { CreateSchoolDayData, UpdateSchoolDayData, BulkUpsertSchoolDayData } from '../types'
import { toast } from 'react-hot-toast'

interface UseSchoolDaysOptions {
  institutionId: string
  academicYear?: string
  month?: number
  year?: number
  enabled?: boolean
}

export const useSchoolDays = (options: UseSchoolDaysOptions) => {
  const { institutionId, academicYear, month, year, enabled = true } = options
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['school-days', { institutionId, academicYear, month, year }],
    queryFn: () => schoolDayService.getSchoolDays({
      institution_id: institutionId,
      academic_year: academicYear,
      month,
      year,
    }),
    enabled: enabled && !!institutionId,
  })

  const createMutation = useMutation({
    mutationFn: (data: CreateSchoolDayData) => schoolDayService.createSchoolDay(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['school-days'] })
      toast.success('School days record created successfully!', {
        duration: 3000,
        position: 'top-right',
      })
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to create school days record'
      toast.error(message, {
        duration: 4000,
        position: 'top-right',
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSchoolDayData }) =>
      schoolDayService.updateSchoolDay(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['school-days'] })
      toast.success('School days record updated successfully!', {
        duration: 3000,
        position: 'top-right',
      })
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to update school days record'
      toast.error(message, {
        duration: 4000,
        position: 'top-right',
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => schoolDayService.deleteSchoolDay(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['school-days'] })
      toast.success('School days record deleted successfully!', {
        duration: 3000,
        position: 'top-right',
      })
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to delete school days record'
      toast.error(message, {
        duration: 4000,
        position: 'top-right',
      })
    },
  })

  const bulkUpsertMutation = useMutation({
    mutationFn: (data: BulkUpsertSchoolDayData) => schoolDayService.bulkUpsert(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['school-days'] })
      toast.success('School days records saved successfully!', {
        duration: 3000,
        position: 'top-right',
      })
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to save school days records'
      toast.error(message, {
        duration: 4000,
        position: 'top-right',
      })
    },
  })

  return {
    schoolDays: query.data?.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    createSchoolDay: createMutation.mutateAsync,
    updateSchoolDay: updateMutation.mutateAsync,
    deleteSchoolDay: deleteMutation.mutateAsync,
    bulkUpsert: bulkUpsertMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isBulkUpserting: bulkUpsertMutation.isPending,
  }
}

