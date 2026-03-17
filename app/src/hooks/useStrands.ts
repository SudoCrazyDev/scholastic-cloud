import { useQuery } from '@tanstack/react-query'
import { strandService } from '../services/strandService'

export function useStrands(trackId?: string) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['strands', trackId],
    queryFn: () => strandService.getStrands(trackId ? { track_id: trackId } : undefined),
    staleTime: 5 * 60 * 1000,
  })

  return {
    strands: data?.data || [],
    loading: isLoading,
    error,
  }
}
