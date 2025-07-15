import { api } from '../lib/api';

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