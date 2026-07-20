import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { userService } from '../services/userService'
import { useAuth } from './useAuth'

const INSTITUTION_OVERVIEW_ROLES = ['principal', 'institution-admin', 'institution-administrator', 'department-head']

export const useAssignedSubjects = () => {
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [sectionFilter, setSectionFilter] = useState('all')
  const [sorting, setSorting] = useState<{ field: string; direction: 'asc' | 'desc' }>({
    field: 'title',
    direction: 'asc',
  })

  // Principals and institution admins see every subject in the institution
  const isInstitutionOverview = INSTITUTION_OVERVIEW_ROLES.includes(user?.role?.slug || '')

  const {
    data: assignedSubjectsRaw = [],
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['my-assigned-subjects'],
    queryFn: () => userService.getMySubjects(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  // Unique class sections available for filtering
  const sections = useMemo(() => {
    const map = new Map<string, { id: string; title: string; gradeLevel: string }>()
    assignedSubjectsRaw.forEach(subject => {
      const section = subject.class_section
      if (section?.id && !map.has(section.id)) {
        map.set(section.id, {
          id: section.id,
          title: section.title,
          gradeLevel: section.grade_level || '',
        })
      }
    })
    return Array.from(map.values()).sort((a, b) => {
      const gradeA = parseInt(a.gradeLevel) || 0
      const gradeB = parseInt(b.gradeLevel) || 0
      if (gradeA !== gradeB) return gradeA - gradeB
      return a.title.localeCompare(b.title)
    })
  }, [assignedSubjectsRaw])

  // Filter and sort subjects
  const assignedSubjects = useMemo(() => {
    let filtered = assignedSubjectsRaw

    // Apply section filter
    if (sectionFilter !== 'all') {
      filtered = filtered.filter(subject => subject.class_section?.id === sectionFilter)
    }

    // Apply search filter (matches subject or section)
    if (search) {
      const term = search.toLowerCase()
      filtered = filtered.filter(subject =>
        subject.title.toLowerCase().includes(term) ||
        subject.variant?.toLowerCase().includes(term) ||
        subject.class_section?.title?.toLowerCase().includes(term) ||
        subject.class_section?.grade_level?.toLowerCase().includes(term) ||
        subject.institution?.title?.toLowerCase().includes(term)
      )
    }

    // Apply sorting
    filtered = [...filtered].sort((a, b) => {
      let aValue: string
      let bValue: string

      switch (sorting.field) {
        case 'title':
          aValue = a.title
          bValue = b.title
          break
        case 'class_section':
          aValue = a.class_section?.title || ''
          bValue = b.class_section?.title || ''
          break
        case 'institution':
          aValue = a.institution?.title || ''
          bValue = b.institution?.title || ''
          break
        case 'start_time':
          aValue = a.start_time || ''
          bValue = b.start_time || ''
          break
        default:
          aValue = a.title
          bValue = b.title
      }

      if (sorting.direction === 'asc') {
        return aValue.localeCompare(bValue)
      } else {
        return bValue.localeCompare(aValue)
      }
    })

    return filtered
  }, [assignedSubjectsRaw, search, sectionFilter, sorting])

  const handleSearch = (value: string) => {
    setSearch(value)
  }

  const handleSectionFilter = (sectionId: string) => {
    setSectionFilter(sectionId)
  }

  const handleSort = (field: string) => {
    setSorting(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  return {
    // Data
    assignedSubjects,
    sections,
    loading,
    error: error?.message || null,
    search,
    sectionFilter,
    sorting,
    isInstitutionOverview,

    // Actions
    handleSearch,
    handleSectionFilter,
    handleSort,
    refetch,
  }
}
