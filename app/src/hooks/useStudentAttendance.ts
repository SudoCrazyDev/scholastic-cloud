import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { studentAttendanceService } from '../services/studentAttendanceService'
import type { CreateStudentAttendanceData, UpdateStudentAttendanceData, BulkUpsertStudentAttendanceData } from '../types'
import { toast } from 'react-hot-toast'

interface UseStudentAttendanceOptions {
  classSectionId: string
  academicYear?: string
  month?: number
  year?: number
  enabled?: boolean
}

export const useStudentAttendance = (options: UseStudentAttendanceOptions) => {
  const { classSectionId, academicYear, month, year, enabled = true } = options
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['student-attendances', { classSectionId, academicYear, month, year }],
    queryFn: () => studentAttendanceService.getAttendances({
      class_section_id: classSectionId,
      academic_year: academicYear,
      month,
      year,
    }),
    enabled: enabled && !!classSectionId,
  })

  const createMutation = useMutation({
    mutationFn: (data: CreateStudentAttendanceData) => studentAttendanceService.createAttendance(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-attendances'] })
      toast.success('Attendance record created successfully!', {
        duration: 3000,
        position: 'top-right',
      })
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to create attendance record'
      toast.error(message, {
        duration: 4000,
        position: 'top-right',
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateStudentAttendanceData }) =>
      studentAttendanceService.updateAttendance(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-attendances'] })
      toast.success('Attendance record updated successfully!', {
        duration: 3000,
        position: 'top-right',
      })
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to update attendance record'
      toast.error(message, {
        duration: 4000,
        position: 'top-right',
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => studentAttendanceService.deleteAttendance(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-attendances'] })
      toast.success('Attendance record deleted successfully!', {
        duration: 3000,
        position: 'top-right',
      })
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to delete attendance record'
      toast.error(message, {
        duration: 4000,
        position: 'top-right',
      })
    },
  })

  const bulkUpsertMutation = useMutation({
    mutationFn: (data: BulkUpsertStudentAttendanceData) => studentAttendanceService.bulkUpsert(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-attendances'] })
      toast.success('Attendance records saved successfully!', {
        duration: 3000,
        position: 'top-right',
      })
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to save attendance records'
      toast.error(message, {
        duration: 4000,
        position: 'top-right',
      })
    },
  })

  return {
    attendances: query.data?.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    createAttendance: createMutation.mutateAsync,
    updateAttendance: updateMutation.mutateAsync,
    deleteAttendance: deleteMutation.mutateAsync,
    bulkUpsert: bulkUpsertMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isBulkUpserting: bulkUpsertMutation.isPending,
  }
}

