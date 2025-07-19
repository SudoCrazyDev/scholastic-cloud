import { useQuery } from '@tanstack/react-query'
import { userService } from '../services/userService'

interface UseMyClassSectionsOptions {
  page?: number
  per_page?: number
  search?: string
  institution_id?: string
}

export const useMyClassSections = (options: UseMyClassSectionsOptions = {}) => {
  // Query key for user's class sections
  const queryKey = ['my-class-sections', options]

  // Fetch user's class sections query
  const {
    data: classSectionsResponse,
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => userService.getMyClassSections(options),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  })

  const classSections = classSectionsResponse?.data || []
  const pagination = classSectionsResponse?.pagination

  return {
    classSections,
    pagination,
    loading,
    error,
    refetch,
  }
} 