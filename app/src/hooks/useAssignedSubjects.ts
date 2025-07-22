import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { userService } from '../services/userService'

export const useAssignedSubjects = () => {
  const [search, setSearch] = useState('')
  const [sorting, setSorting] = useState<{ field: string; direction: 'asc' | 'desc' }>({
    field: 'title',
    direction: 'asc',
  })

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

  // Filter and sort subjects
  const assignedSubjects = useMemo(() => {
    let filtered = assignedSubjectsRaw

    // Apply search filter
    if (search) {
      filtered = filtered.filter(subject =>
        subject.title.toLowerCase().includes(search.toLowerCase()) ||
        subject.variant?.toLowerCase().includes(search.toLowerCase()) ||
        subject.class_section.title.toLowerCase().includes(search.toLowerCase()) ||
        subject.institution.title.toLowerCase().includes(search.toLowerCase())
      )
    }

    // Apply sorting
    filtered = [...filtered].sort((a, b) => {
      let aValue: any
      let bValue: any

      switch (sorting.field) {
        case 'title':
          aValue = a.title
          bValue = b.title
          break
        case 'class_section':
          aValue = a.class_section.title
          bValue = b.class_section.title
          break
        case 'institution':
          aValue = a.institution.title
          bValue = b.institution.title
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
  }, [assignedSubjectsRaw, search, sorting])

  const handleSearch = (value: string) => {
    setSearch(value)
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
    loading,
    error: error?.message || null,
    search,
    sorting,

    // Actions
    handleSearch,
    handleSort,
    refetch,
  }
} 