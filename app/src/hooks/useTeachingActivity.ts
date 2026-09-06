import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { teachingActivityService } from '../services/teachingActivityService'
import { useAuth } from './useAuth'
import type { TeachingActivityFilters } from '../types'

export type TeachingActivitySort = NonNullable<TeachingActivityFilters['sort']>

/**
 * The Teaching Activity overview, with its filters.
 *
 * The academic year starts as the institution's current one and the quarter
 * starts as "all": a principal opening the screen wants the year to date, not
 * whichever quarter today happens to fall in.
 */
export const useTeachingActivity = () => {
  const { currentAcademicYear } = useAuth()

  const [academicYear, setAcademicYear] = useState<string>(currentAcademicYear ?? '')
  const [quarter, setQuarter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<TeachingActivitySort>('name')

  const filters = useMemo<TeachingActivityFilters>(
    () => ({
      academic_year: academicYear || undefined,
      quarter: quarter === 'all' ? undefined : quarter,
      sort,
    }),
    [academicYear, quarter, sort]
  )

  const query = useQuery({
    queryKey: ['teaching-activity', 'overview', filters],
    queryFn: () => teachingActivityService.getOverview(filters),
    staleTime: 60 * 1000,
  })

  const data = query.data?.data

  // Memoised so the `?? []` fallback is not a fresh array on every render,
  // which would re-run the search filter below for nothing.
  const teachers = useMemo(() => data?.teachers ?? [], [data?.teachers])

  // Searched here rather than on the server: the row set is one row per
  // teacher, so filtering it locally keeps typing instant and does not
  // re-aggregate a whole school's lessons on every keystroke.
  const filteredTeachers = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return teachers

    return teachers.filter(
      (teacher) =>
        teacher.name.toLowerCase().includes(term) ||
        (teacher.email ?? '').toLowerCase().includes(term) ||
        (teacher.role ?? '').toLowerCase().includes(term)
    )
  }, [teachers, search])

  // The selector offers the years the school actually has sections for, and
  // stays usable before the first response arrives.
  const academicYearOptions = useMemo(() => {
    const years = new Set<string>(data?.available_academic_years ?? [])
    if (currentAcademicYear) years.add(currentAcademicYear)
    if (academicYear) years.add(academicYear)

    return Array.from(years)
      .sort()
      .reverse()
      .map((year) => ({ value: year, label: year }))
  }, [data?.available_academic_years, currentAcademicYear, academicYear])

  return {
    overview: data,
    totals: data?.totals,
    teachers: filteredTeachers,
    teacherCount: teachers.length,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,

    academicYear: data?.academic_year ?? academicYear,
    setAcademicYear,
    academicYearOptions,
    quarter,
    setQuarter,
    search,
    setSearch,
    sort,
    setSort,
  }
}

/** One teacher's lessons, assessments and per-subject breakdown. */
export const useTeacherActivity = (
  userId: string | undefined,
  academicYear: string | undefined,
  quarter: string
) => {
  const query = useQuery({
    queryKey: ['teaching-activity', 'teacher', userId, academicYear, quarter],
    queryFn: () =>
      teachingActivityService.getTeacher(userId!, {
        academic_year: academicYear || undefined,
        quarter: quarter === 'all' ? undefined : quarter,
      }),
    enabled: Boolean(userId),
    staleTime: 60 * 1000,
  })

  return {
    detail: query.data?.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}

/** Who has and has not submitted one assessment. Loaded only when opened. */
export const useAssessmentSubmissionRoster = (itemId: string | null) => {
  const query = useQuery({
    queryKey: ['teaching-activity', 'assessment-submissions', itemId],
    queryFn: () => teachingActivityService.getAssessmentSubmissions(itemId!),
    enabled: Boolean(itemId),
  })

  return {
    roster: query.data?.data,
    isLoading: query.isLoading,
    error: query.error,
  }
}
