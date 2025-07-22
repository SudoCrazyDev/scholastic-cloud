import { useQuery } from '@tanstack/react-query';
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
  // This hook is no longer needed as real-time attendance handles check-ins
  // Keeping it for now, but it will always return a resolved promise
  return {
    mutate: async (data: { userId: string; institutionId: string }) => {
      console.log('Check-in triggered (mock):', data);
      return Promise.resolve({ success: true, message: 'Check-in successful (mock)' });
    },
    isLoading: false,
    isError: false,
    error: null,
  };
};

export const useCheckOut = () => {
  // This hook is no longer needed as real-time attendance handles check-outs
  // Keeping it for now, but it will always return a resolved promise
  return {
    mutate: async (data: { userId: string; institutionId: string }) => {
      console.log('Check-out triggered (mock):', data);
      return Promise.resolve({ success: true, message: 'Check-out successful (mock)' });
    },
    isLoading: false,
    isError: false,
    error: null,
  };
};

export const useBreakOut = () => {
  // This hook is no longer needed as real-time attendance handles breaks
  // Keeping it for now, but it will always return a resolved promise
  return {
    mutate: async (data: { userId: string; institutionId: string }) => {
      console.log('Break-out triggered (mock):', data);
      return Promise.resolve({ success: true, message: 'Break-out successful (mock)' });
    },
    isLoading: false,
    isError: false,
    error: null,
  };
};

export const useBreakIn = () => {
  // This hook is no longer needed as real-time attendance handles breaks
  // Keeping it for now, but it will always return a resolved promise
  return {
    mutate: async (data: { userId: string; institutionId: string }) => {
      console.log('Break-in triggered (mock):', data);
      return Promise.resolve({ success: true, message: 'Break-in successful (mock)' });
    },
    isLoading: false,
    isError: false,
    error: null,
  };
};

export const useCreateAttendance = () => {
  // This hook is no longer needed as real-time attendance handles attendance creation
  // Keeping it for now, but it will always return a resolved promise
  return {
    mutate: async (data: any) => {
      console.log('Create attendance triggered (mock):', data);
      return Promise.resolve({ success: true, message: 'Attendance created (mock)' });
    },
    isLoading: false,
    isError: false,
    error: null,
  };
};

export const useUpdateAttendance = () => {
  // This hook is no longer needed as real-time attendance handles attendance updates
  // Keeping it for now, but it will always return a resolved promise
  return {
    mutate: async (data: any) => {
      console.log('Update attendance triggered (mock):', data);
      return Promise.resolve({ success: true, message: 'Attendance updated (mock)' });
    },
    isLoading: false,
    isError: false,
    error: null,
  };
}; 