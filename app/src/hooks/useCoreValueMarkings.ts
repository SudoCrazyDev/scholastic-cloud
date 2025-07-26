import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { coreValueMarkingService } from '../services/coreValueMarkingService';
import { toast } from 'react-hot-toast';

export const useCoreValueMarkings = (params: any, options: any = {}) => {
  return useQuery({
    queryKey: ['core-value-markings', params],
    queryFn: () => coreValueMarkingService.get(params),
    staleTime: 0,
    retry: 1,
    retryDelay: 1000,
    ...options,
  });
};

export const useCreateCoreValueMarking = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => coreValueMarkingService.create(data),
    onSuccess: () => {
      toast.success('Core value marking saved!', { icon: '✅' });
      queryClient.invalidateQueries({ queryKey: ['core-value-markings'] });
    },
    onError: (error: any) => {
      toast.error(`Failed to save: ${error?.response?.data?.message || 'Unknown error'}`);
    },
  });
};

export const useUpdateCoreValueMarking = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => coreValueMarkingService.update(id, data),
    onSuccess: () => {
      toast.success('Core value marking updated!', { icon: '✅' });
      queryClient.invalidateQueries({ queryKey: ['core-value-markings'] });
    },
    onError: (error: any) => {
      toast.error(`Failed to update: ${error?.response?.data?.message || 'Unknown error'}`);
    },
  });
};

export const useDeleteCoreValueMarking = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => coreValueMarkingService.delete(id),
    onSuccess: () => {
      toast.success('Core value marking deleted!', { icon: '🗑️' });
      queryClient.invalidateQueries({ queryKey: ['core-value-markings'] });
    },
    onError: (error: any) => {
      toast.error(`Failed to delete: ${error?.response?.data?.message || 'Unknown error'}`);
    },
  });
}; 