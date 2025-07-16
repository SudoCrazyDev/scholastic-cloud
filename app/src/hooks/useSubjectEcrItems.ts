import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { subjectEcrItemService } from '../services/subjectEcrItemService';
import type { SubjectEcrItem } from '../services/subjectEcrItemService';
import { subjectEcrService } from '../services/subjectEcrService';

// Accepts subject_ecr_id as string or string[] for multiple IDs
export function useSubjectEcrItems(params?: { subject_ecr_id?: string | string[]; type?: string }) {
  return useQuery({
    queryKey: ['subjectEcrItems', params],
    queryFn: () => subjectEcrItemService.list(params),
  });
}

export function useSubjectEcrItem(id: string) {
  return useQuery({
    queryKey: ['subjectEcrItem', id],
    queryFn: () => subjectEcrItemService.get(id),
    enabled: !!id,
  });
}

export function useCreateSubjectEcrItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<SubjectEcrItem, 'id'>) => subjectEcrItemService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subjectEcrItems'] });
    },
  });
}

export function useUpdateSubjectEcrItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Omit<SubjectEcrItem, 'id'>> }) => subjectEcrItemService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subjectEcrItems'] });
    },
  });
}

export function useDeleteSubjectEcrItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => subjectEcrItemService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subjectEcrItems'] });
    },
  });
}

// Fetch all SubjectEcrs for a given subjectId
export function useSubjectEcrs(subjectId?: string) {
  return useQuery({
    queryKey: ['subjectEcrs', subjectId],
    queryFn: () => {
      if (!subjectId) throw new Error('No subject ID provided');
      return subjectEcrService.getBySubject(subjectId);
    },
    enabled: !!subjectId,
  });
} 