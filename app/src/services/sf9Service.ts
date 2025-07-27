import { api } from '../lib/api';
import type { ApiResponse } from '../types';

export interface SF9Data {
  student: {
    id: string;
    lrn: string;
    first_name: string;
    middle_name?: string;
    last_name: string;
    ext_name?: string;
    gender: 'male' | 'female' | 'other';
    birthdate: string;
    religion: string;
  };
  institution: {
    id: string;
    title: string;
    abbr: string;
    address?: string;
    division?: string;
    region?: string;
    gov_id?: string;
  };
  current_academic_year: string;
  current_sections: Array<{
    section_id: string;
    grade_level: string;
    section_title: string;
    academic_year: string;
    is_promoted: boolean;
  }>;
  academic_performance: Record<string, Array<{
    subject_id: string;
    subject_title: string;
    quarter: string;
    grade: number | null;
    final_grade: number | null;
  }>>;
  core_values: Record<string, Array<{
    core_value: string;
    behavior_statement: string;
    marking: string;
    quarter: string;
  }>>;
  attendance_summary: {
    total_days: number;
    present_days: number;
    absent_days: number;
    late_days: number;
    attendance_rate: number;
  };
  enrollment_history: Record<string, Array<{
    academic_year: string;
    grade_level: string;
    section_title: string;
    institution_name: string;
    is_promoted: boolean;
  }>>;
}

export interface GenerateSF9Request {
  student_id: string;
  academic_year: string;
  institution_id: string;
}

export const sf9Service = {
  /**
   * Generate SF9 data for a student
   */
  generate: async (data: GenerateSF9Request): Promise<ApiResponse<SF9Data>> => {
    const response = await api.post('/sf9/generate', data);
    return response.data;
  },

  /**
   * Get available academic years for a student
   */
  getAcademicYears: async (studentId: string): Promise<ApiResponse<string[]>> => {
    const response = await api.get(`/sf9/academic-years/${studentId}`);
    return response.data;
  },
}; 