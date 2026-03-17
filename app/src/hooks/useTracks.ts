import { useQuery } from '@tanstack/react-query'
import { trackService } from '../services/trackService'

export function useTracks() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['tracks'],
    queryFn: () => trackService.getTracks(),
    staleTime: 5 * 60 * 1000,
  })

  return {
    tracks: data?.data || [],
    loading: isLoading,
    error,
  }
}
