import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { attendanceService } from '../services/attendanceService';

export const useRealtimeAttendance = (
  authDate: string,
  deviceName: string,
  personName?: string
) => {
  return useQuery({
    queryKey: ['realtime-attendance', authDate, deviceName, personName],
    queryFn: () => attendanceService.getRealtimeAttendance(authDate, deviceName, personName),
    enabled: !!authDate && !!deviceName,
    refetchInterval: 10000, // Refetch every 10 seconds for more responsive real-time updates
  });
};

// Legacy hooks for backward compatibility (if needed)
export const useAttendanceStats = (institutionId: string) => {
  return useQuery({
    queryKey: ['attendance-stats', institutionId],
    queryFn: () => Promise.resolve({ data: null }),
    enabled: false, // Disabled since we're using realtime attendance now
  });
};

export const useTodayAttendance = (
  institutionId: string,
  page: number = 1,
  perPage: number = 20,
  searchValue: string = '',
  filter?: string
) => {
  return useQuery({
    queryKey: ['today-attendance', institutionId, page, perPage, searchValue, filter],
    queryFn: () => Promise.resolve({ data: [], pagination: null }),
    enabled: false, // Disabled since we're using realtime attendance now
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
    queryFn: () => Promise.resolve({ data: [], pagination: null }),
    enabled: false, // Disabled since we're using realtime attendance now
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
    queryFn: () => Promise.resolve({ data: [], pagination: null }),
    enabled: false, // Disabled since we're using realtime attendance now
  });
};

export const useCheckIn = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { userId: string; institutionId: string }) => {
      console.log('Check-in triggered (mock):', data);
      // TODO: Replace with actual API call when backend is ready
      return Promise.resolve({ success: true, message: 'Check-in successful (mock)' });
    },
    onSuccess: () => {
      // Invalidate relevant queries to refetch data
      queryClient.invalidateQueries({ queryKey: ['realtime-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['today-attendance'] });
    },
  });
};

export const useCheckOut = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { userId: string; institutionId: string }) => {
      console.log('Check-out triggered (mock):', data);
      // TODO: Replace with actual API call when backend is ready
      return Promise.resolve({ success: true, message: 'Check-out successful (mock)' });
    },
    onSuccess: () => {
      // Invalidate relevant queries to refetch data
      queryClient.invalidateQueries({ queryKey: ['realtime-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['today-attendance'] });
    },
  });
};

export const useBreakOut = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { userId: string; institutionId: string }) => {
      console.log('Break-out triggered (mock):', data);
      // TODO: Replace with actual API call when backend is ready
      return Promise.resolve({ success: true, message: 'Break-out successful (mock)' });
    },
    onSuccess: () => {
      // Invalidate relevant queries to refetch data
      queryClient.invalidateQueries({ queryKey: ['realtime-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['today-attendance'] });
    },
  });
};

export const useBreakIn = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { userId: string; institutionId: string }) => {
      console.log('Break-in triggered (mock):', data);
      // TODO: Replace with actual API call when backend is ready
      return Promise.resolve({ success: true, message: 'Break-in successful (mock)' });
    },
    onSuccess: () => {
      // Invalidate relevant queries to refetch data
      queryClient.invalidateQueries({ queryKey: ['realtime-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['today-attendance'] });
    },
  });
};

export const useCreateAttendance = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: any) => {
      console.log('Create attendance triggered (mock):', data);
      // TODO: Replace with actual API call when backend is ready
      return Promise.resolve({ success: true, message: 'Attendance created (mock)' });
    },
    onSuccess: () => {
      // Invalidate relevant queries to refetch data
      queryClient.invalidateQueries({ queryKey: ['realtime-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['today-attendance'] });
    },
  });
};

export const useUpdateAttendance = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: any) => {
      console.log('Update attendance triggered (mock):', data);
      // TODO: Replace with actual API call when backend is ready
      return Promise.resolve({ success: true, message: 'Attendance updated (mock)' });
    },
    onSuccess: () => {
      // Invalidate relevant queries to refetch data
      queryClient.invalidateQueries({ queryKey: ['realtime-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['today-attendance'] });
    },
  });
}; 