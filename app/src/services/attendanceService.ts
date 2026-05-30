import { api } from '../lib/api';
import type { PaginatedResponse, AttendanceLog } from '../types';

export interface AttendanceLogParams {
  device_id?: string;
  user_id?: string;
  date?: string;
  from?: string;
  to?: string;
  page?: number;
  per_page?: number;
}

export interface AttendanceEntry {
  'check-in'?: string;
  'break-out'?: string;
  'break-in'?: string;
  'check-out'?: string;
}

export interface AttendancePerson {
  person_name: string;
  entries: AttendanceEntry[];
}

export interface AttendanceResponse {
  data: AttendancePerson[];
  total_check_ins: number;
  total_break_outs: number;
}

export const attendanceLogService = {
  async getLogs(params?: AttendanceLogParams) {
    const query = new URLSearchParams();
    if (params?.device_id) query.append('device_id', params.device_id);
    if (params?.user_id)   query.append('user_id',   params.user_id);
    if (params?.date)      query.append('date',      params.date);
    if (params?.from)      query.append('from',      params.from);
    if (params?.to)        query.append('to',        params.to);
    if (params?.page)      query.append('page',      String(params.page));
    if (params?.per_page)  query.append('per_page',  String(params.per_page));
    const url = `/attendance/logs${query.toString() ? `?${query}` : ''}`;
    const response = await api.get<PaginatedResponse<AttendanceLog>>(url);
    return response.data;
  },
};

export const attendanceService = {
  getRealtimeAttendance: async (
    authDate: string,
    deviceName: string,
    personName?: string
  ): Promise<AttendanceResponse> => {
    const params = new URLSearchParams({
      auth_date: authDate,
      device_name: deviceName,
    });

    if (personName) {
      params.append('person_name', personName);
    }

    const response = await api.get(`/realtime-attendance?${params.toString()}`);
    return response.data;
  },
}; 