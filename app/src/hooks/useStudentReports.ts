import { useMutation, useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { toast } from 'react-hot-toast'
import { studentReportService } from '../services/studentReportService'
import type { StudentRosterGroupBy, StudentRosterSort } from '../types'

/**
 * Male/female headcounts per section and per grade level for one school year.
 *
 * Also carries the years the school has enrolments for, so the year picker on
 * both the Printing and Statistics tabs is filled from this one request.
 */
export function useStudentStatistics(academicYear?: string) {
  const query = useQuery({
    queryKey: ['student-statistics', academicYear ?? 'current'],
    queryFn: () => studentReportService.getStatistics(academicYear),
    staleTime: 60 * 1000,
    // Keep the previous year's numbers on screen while the next year loads,
    // rather than blanking the tables on every change of the year picker.
    placeholderData: (previous) => previous,
  })

  return {
    statistics: query.data?.data ?? null,
    loading: query.isLoading,
    fetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  }
}

/**
 * Class lists, fetched on demand.
 *
 * A mutation rather than a query because the roster is wanted at the moment
 * Print is pressed and nowhere else — nothing on screen renders it, so there is
 * no cache worth keeping and no reason to fetch every student's name up front.
 */
export function useStudentRoster() {
  return useMutation({
    mutationFn: (params: {
      academic_year?: string
      group_by?: StudentRosterGroupBy
      sort?: StudentRosterSort
      section_ids?: string[]
      grade_levels?: string[]
    }) => studentReportService.getRoster(params),
    onError: (error) => {
      const message = isAxiosError(error) ? error.response?.data?.message : undefined
      toast.error(message ?? 'Failed to build the class list')
    },
  })
}
