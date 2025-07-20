import { useQuery } from '@tanstack/react-query'
import { consolidatedGradesService } from '../services/consolidatedGradesService'

export const useConsolidatedGrades = (sectionId: string, quarter: number) => {
  const {
    data: consolidatedGradesResponse,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['consolidated-grades', sectionId, quarter],
    queryFn: () => consolidatedGradesService.getSectionConsolidatedGrades(sectionId, quarter),
    enabled: !!sectionId && !!quarter,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  })

  return {
    data: consolidatedGradesResponse?.data,
    isLoading,
    error,
    refetch,
  }
} 