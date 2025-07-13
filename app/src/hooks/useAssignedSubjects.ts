import { useState, useMemo } from 'react'
import type { AssignedSubject } from '../types'

// Placeholder data for assigned subjects
const placeholderAssignedSubjects: AssignedSubject[] = [
  {
    id: '1',
    institution_id: '1',
    class_section_id: '1',
    adviser: '1',
    adviser_user: {
      id: '1',
      first_name: 'John',
      last_name: 'Doe',
      gender: 'male',
      birthdate: '1990-01-01',
      email: 'john.doe@example.com',
      is_new: false,
      is_active: true,
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    },
    subject_type: 'parent',
    title: 'Mathematics',
    variant: 'Advanced Algebra',
    start_time: '08:00',
    end_time: '09:30',
    is_limited_student: false,
    order: 1,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    class_section: {
      id: '1',
      institution_id: '1',
      grade_level: 'Grade 10',
      title: 'Section A',
      academic_year: '2024-2025',
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    },
    institution: {
      id: '1',
      title: 'Sample High School',
      abbr: 'SHS',
      address: '123 Main St',
      division: 'Division A',
      region: 'Region I',
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    },
    student_count: 25,
    total_students: 30,
  },
  {
    id: '2',
    institution_id: '1',
    class_section_id: '1',
    adviser: '1',
    adviser_user: {
      id: '1',
      first_name: 'John',
      last_name: 'Doe',
      gender: 'male',
      birthdate: '1990-01-01',
      email: 'john.doe@example.com',
      is_new: false,
      is_active: true,
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    },
    subject_type: 'parent',
    title: 'Science',
    variant: 'Physics',
    start_time: '10:00',
    end_time: '11:30',
    is_limited_student: false,
    order: 2,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    class_section: {
      id: '1',
      institution_id: '1',
      grade_level: 'Grade 10',
      title: 'Section A',
      academic_year: '2024-2025',
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    },
    institution: {
      id: '1',
      title: 'Sample High School',
      abbr: 'SHS',
      address: '123 Main St',
      division: 'Division A',
      region: 'Region I',
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    },
    student_count: 28,
    total_students: 30,
  },
  {
    id: '3',
    institution_id: '1',
    class_section_id: '2',
    adviser: '1',
    adviser_user: {
      id: '1',
      first_name: 'John',
      last_name: 'Doe',
      gender: 'male',
      birthdate: '1990-01-01',
      email: 'john.doe@example.com',
      is_new: false,
      is_active: true,
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    },
    subject_type: 'parent',
    title: 'English',
    variant: 'Literature',
    start_time: '13:00',
    end_time: '14:30',
    is_limited_student: false,
    order: 1,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    class_section: {
      id: '2',
      institution_id: '1',
      grade_level: 'Grade 11',
      title: 'Section B',
      academic_year: '2024-2025',
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    },
    institution: {
      id: '1',
      title: 'Sample High School',
      abbr: 'SHS',
      address: '123 Main St',
      division: 'Division A',
      region: 'Region I',
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    },
    student_count: 22,
    total_students: 25,
  },
]

export const useAssignedSubjects = () => {
  const [search, setSearch] = useState('')
  const [sorting, setSorting] = useState<{ field: string; direction: 'asc' | 'desc' }>({
    field: 'title',
    direction: 'asc',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filter and sort subjects
  const assignedSubjects = useMemo(() => {
    let filtered = placeholderAssignedSubjects

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
    filtered.sort((a, b) => {
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
  }, [search, sorting])

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
    error,
    search,
    sorting,

    // Actions
    handleSearch,
    handleSort,
  }
} 