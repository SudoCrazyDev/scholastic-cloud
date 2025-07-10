import { useQuery } from '@tanstack/react-query'
import { staffService } from '../services/staffService'
import type { User } from '../types'

interface UseTeachersOptions {
  search?: string
  limit?: number
}

export const useTeachers = (options: UseTeachersOptions = {}) => {
  const {
    data: teachersResponse,
    isLoading: loading,
    error,
  } = useQuery({
    queryKey: ['teachers', options],
    queryFn: () => staffService.getStaffs({ 
      ...options, 
      limit: options.limit || 100,
      // You might want to filter by role here if you have specific teacher roles
    }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  })

  const teachers = teachersResponse?.data || []

  // Helper function to get full name
  const getFullName = (teacher: User) => {
    const parts = [teacher.first_name, teacher.middle_name, teacher.last_name, teacher.ext_name]
    return parts.filter(Boolean).join(' ')
  }

  // Helper function to search teachers by name
  const searchTeachers = (query: string) => {
    if (!query.trim()) return teachers
    
    const lowerQuery = query.toLowerCase()
    return teachers.filter(teacher => {
      const fullName = getFullName(teacher).toLowerCase()
      const email = teacher.email.toLowerCase()
      return fullName.includes(lowerQuery) || email.includes(lowerQuery)
    })
  }

  return {
    teachers,
    loading,
    error,
    getFullName,
    searchTeachers,
  }
} 