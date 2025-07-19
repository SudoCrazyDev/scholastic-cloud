import { api } from '../lib/api';

export interface StudentRunningGrade {
  id?: string;
  student_id: string;
  subject_id: string;
  quarter: '1' | '2' | '3' | '4';
  grade: number;
  final_grade?: number;
  academic_year: string;
  created_at?: string;
  updated_at?: string;
  student?: {
    id: string;
    lrn: string;
    first_name: string;
    middle_name?: string;
    last_name: string;
    ext_name?: string;
    gender: 'male' | 'female' | 'other';
  };
  subject?: {
    id: string;
    title: string;
    code: string;
  };
}

export interface StudentRunningGradeCreateData {
  student_id: string;
  subject_id: string;
  quarter: '1' | '2' | '3' | '4';
  grade: number;
  final_grade?: number;
  academic_year: string;
}

export interface StudentRunningGradeUpdateData {
  grade?: number;
  final_grade?: number;
  academic_year?: string;
}

export interface StudentRunningGradeListParams {
  subject_id?: string;
  student_id?: string;
  quarter?: '1' | '2' | '3' | '4';
  academic_year?: string;
}

class StudentRunningGradeService {
  private baseUrl = '/student-running-grades';

  async list(params?: StudentRunningGradeListParams) {
    const response = await api.get(this.baseUrl, { params });
    return response.data;
  }

  async get(id: string) {
    const response = await api.get(`${this.baseUrl}/${id}`);
    return response.data;
  }

  async create(data: StudentRunningGradeCreateData) {
    const response = await api.post(this.baseUrl, data);
    return response.data;
  }

  async update(id: string, data: StudentRunningGradeUpdateData) {
    const response = await api.put(`${this.baseUrl}/${id}`, data);
    return response.data;
  }

  async delete(id: string) {
    const response = await api.delete(`${this.baseUrl}/${id}`);
    return response.data;
  }

  async getBySubjectAndClassSection(subjectId: string, classSectionId: string) {
    const response = await api.get(this.baseUrl, {
      params: {
        subject_id: subjectId,
        class_section_id: classSectionId,
      },
    });
    return response.data;
  }

  async getByStudentAndSubject(studentId: string, subjectId: string) {
    const response = await api.get(this.baseUrl, {
      params: {
        student_id: studentId,
        subject_id: subjectId,
      },
    });
    return response.data;
  }

  async updateFinalGrade(id: string, finalGrade: number) {
    const response = await api.put(`${this.baseUrl}/${id}`, {
      final_grade: finalGrade,
    });
    return response.data;
  }

  async upsertFinalGrade(studentId: string, subjectId: string, quarter: '1' | '2' | '3' | '4', finalGrade: number, academicYear: string) {
    const response = await api.post(`${this.baseUrl}/upsert-final-grade`, {
      student_id: studentId,
      subject_id: subjectId,
      quarter,
      final_grade: finalGrade,
      academic_year: academicYear,
    });
    return response.data;
  }
}

export const studentRunningGradeService = new StudentRunningGradeService(); 