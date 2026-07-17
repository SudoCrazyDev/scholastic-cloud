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
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => userService.getMyClassSections(options),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
    // Keep the current list visible while a larger page is being fetched
    placeholderData: (previousData) => previousData,
  })

  const classSections = classSectionsResponse?.data || []
  const pagination = classSectionsResponse?.pagination

  return {
    classSections,
    pagination,
    loading,
    isFetching,
    error,
    refetch,
  }
} 