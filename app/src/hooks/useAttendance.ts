import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mockAttendanceService } from '../services/mockAttendanceService';
import type { CreateAttendanceData, UpdateAttendanceData } from '../types';

export const useAttendanceStats = (institutionId: string) => {
  return useQuery({
    queryKey: ['attendance', 'stats', institutionId],
    queryFn: () => mockAttendanceService.getStats(institutionId),
    enabled: !!institutionId,
    refetchInterval: 30000, // Refetch every 30 seconds for real-time updates
  });
};

export const useTodayAttendance = (
  institutionId: string,
  page: number = 1,
  perPage: number = 20,
  search?: string,
  statusFilter?: string
) => {
  return useQuery({
    queryKey: ['attendance', 'today', institutionId, page, perPage, search, statusFilter],
    queryFn: () => mockAttendanceService.getTodayAttendance(institutionId, page, perPage, search, statusFilter),
    enabled: !!institutionId,
    refetchInterval: 15000, // Refetch every 15 seconds for real-time updates
  });
};

export const useAttendanceRecords = (
  institutionId: string,
  page: number = 1,
  perPage: number = 15,
  filters?: {
    date?: string;
    status?: string;
    user_id?: string;
  }
) => {
  return useQuery({
    queryKey: ['attendance', 'records', institutionId, page, perPage, filters],
    queryFn: () => mockAttendanceService.getAttendanceRecords(institutionId, page, perPage, filters),
    enabled: !!institutionId,
  });
};

export const useTeacherHistory = (
  userId: string,
  institutionId: string,
  page: number = 1,
  perPage: number = 30
) => {
  return useQuery({
    queryKey: ['attendance', 'teacher-history', userId, institutionId, page, perPage],
    queryFn: () => mockAttendanceService.getAttendanceRecords(institutionId, page, perPage),
    enabled: !!userId && !!institutionId,
  });
};

export const useCheckIn = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ userId, institutionId }: { userId: string; institutionId: string }) =>
      mockAttendanceService.checkIn(userId, institutionId),
    onSuccess: (_, { institutionId }) => {
      // Invalidate and refetch relevant queries
      queryClient.invalidateQueries({ queryKey: ['attendance', 'stats', institutionId] });
      queryClient.invalidateQueries({ queryKey: ['attendance', 'today', institutionId] });
    },
  });
};

export const useCheckOut = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ userId, institutionId }: { userId: string; institutionId: string }) =>
      mockAttendanceService.checkOut(userId, institutionId),
    onSuccess: (_, { institutionId }) => {
      queryClient.invalidateQueries({ queryKey: ['attendance', 'stats', institutionId] });
      queryClient.invalidateQueries({ queryKey: ['attendance', 'today', institutionId] });
    },
  });
};

export const useBreakOut = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ userId, institutionId }: { userId: string; institutionId: string }) =>
      mockAttendanceService.breakOut(userId, institutionId),
    onSuccess: (_, { institutionId }) => {
      queryClient.invalidateQueries({ queryKey: ['attendance', 'stats', institutionId] });
      queryClient.invalidateQueries({ queryKey: ['attendance', 'today', institutionId] });
    },
  });
};

export const useBreakIn = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ userId, institutionId }: { userId: string; institutionId: string }) =>
      mockAttendanceService.breakIn(userId, institutionId),
    onSuccess: (_, { institutionId }) => {
      queryClient.invalidateQueries({ queryKey: ['attendance', 'stats', institutionId] });
      queryClient.invalidateQueries({ queryKey: ['attendance', 'today', institutionId] });
    },
  });
};

export const useCreateAttendance = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: CreateAttendanceData) => mockAttendanceService.getStats(data.institution_id),
    onSuccess: (_, data) => {
      queryClient.invalidateQueries({ queryKey: ['attendance', 'stats', data.institution_id] });
      queryClient.invalidateQueries({ queryKey: ['attendance', 'today', data.institution_id] });
    },
  });
};

export const useUpdateAttendance = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: () => mockAttendanceService.getStats('mock-institution'),
    onSuccess: (updatedAttendance: any) => {
      if (updatedAttendance.institution_id) {
        queryClient.invalidateQueries({ queryKey: ['attendance', 'stats', updatedAttendance.institution_id] });
        queryClient.invalidateQueries({ queryKey: ['attendance', 'today', updatedAttendance.institution_id] });
      }
    },
  });
}; 