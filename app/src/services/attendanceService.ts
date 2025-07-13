import { api } from '../lib/api';
import type {
  TeacherAttendance,
  CreateAttendanceData,
  UpdateAttendanceData,
  AttendanceStats,
  TeacherAttendanceSummary,
  PaginatedResponse,
} from '../types';

export const attendanceService = {
  // Get attendance statistics
  getStats: async (institutionId: string): Promise<AttendanceStats> => {
    const response = await api.get(`/attendance/stats/${institutionId}`);
    return response.data;
  },

  // Get today's attendance summary for all teachers
  getTodayAttendance: async (institutionId: string): Promise<TeacherAttendanceSummary[]> => {
    const response = await api.get(`/attendance/today/${institutionId}`);
    return response.data;
  },

  // Get paginated attendance records
  getAttendanceRecords: async (
    institutionId: string,
    page: number = 1,
    perPage: number = 15,
    filters?: {
      date?: string;
      status?: string;
      user_id?: string;
    }
  ): Promise<PaginatedResponse<TeacherAttendance>> => {
    const params = new URLSearchParams({
      page: page.toString(),
      per_page: perPage.toString(),
      ...filters,
    });
    
    const response = await api.get(`/attendance/records/${institutionId}?${params}`);
    return response.data;
  },

  // Create new attendance record
  createAttendance: async (data: CreateAttendanceData): Promise<TeacherAttendance> => {
    const response = await api.post('/attendance', data);
    return response.data;
  },

  // Update attendance record
  updateAttendance: async (id: string, data: UpdateAttendanceData): Promise<TeacherAttendance> => {
    const response = await api.put(`/attendance/${id}`, data);
    return response.data;
  },

  // Check in teacher
  checkIn: async (userId: string, institutionId: string): Promise<TeacherAttendance> => {
    const response = await api.post('/attendance/check-in', {
      user_id: userId,
      institution_id: institutionId,
    });
    return response.data;
  },

  // Check out teacher
  checkOut: async (userId: string, institutionId: string): Promise<TeacherAttendance> => {
    const response = await api.post('/attendance/check-out', {
      user_id: userId,
      institution_id: institutionId,
    });
    return response.data;
  },

  // Break out teacher
  breakOut: async (userId: string, institutionId: string): Promise<TeacherAttendance> => {
    const response = await api.post('/attendance/break-out', {
      user_id: userId,
      institution_id: institutionId,
    });
    return response.data;
  },

  // Break in teacher
  breakIn: async (userId: string, institutionId: string): Promise<TeacherAttendance> => {
    const response = await api.post('/attendance/break-in', {
      user_id: userId,
      institution_id: institutionId,
    });
    return response.data;
  },

  // Get teacher's attendance history
  getTeacherHistory: async (
    userId: string,
    institutionId: string,
    page: number = 1,
    perPage: number = 30
  ): Promise<PaginatedResponse<TeacherAttendance>> => {
    const params = new URLSearchParams({
      page: page.toString(),
      per_page: perPage.toString(),
    });
    
    const response = await api.get(`/attendance/teacher/${userId}/${institutionId}?${params}`);
    return response.data;
  },
}; 