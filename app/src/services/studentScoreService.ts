import { api } from '../lib/api';

export interface Student {
  id: string;
  lrn: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  ext_name?: string;
  gender: 'male' | 'female' | 'other';
  profile_picture?: string;
}

export interface SubjectEcrItem {
  id: string;
  title: string;
  description: string;
  score: number;
  category: string;
  quarter: string;
  academic_year: string;
}

export interface StudentScore {
  id?: string;
  student_id: string;
  subject_ecr_item_id: string;
  score: number;
  date_submitted?: string;
  created_at?: string;
  updated_at?: string;
  student?: Student;
  academic_year?: string;
  subjectEcrItem?: SubjectEcrItem;
}

export interface StudentScoreListParams {
  student_id?: string;
  subject_ecr_item_id?: string;
  min_score?: number;
  max_score?: number;
  per_page?: number;
}

export interface StudentScoreCreateData {
  student_id: string;
  subject_ecr_item_id: string;
  score: number;
  academic_year?: string;
}

export interface StudentScoreUpdateData {
  score: number;
}

class StudentScoreService {
  private baseUrl = '/student-ecr-item-scores';

  async list(params?: StudentScoreListParams) {
    const response = await api.get(this.baseUrl, { params });
    return response.data;
  }

  async get(id: string) {
    const response = await api.get(`${this.baseUrl}/${id}`);
    return response.data;
  }

  async create(data: StudentScoreCreateData) {
    const response = await api.post(this.baseUrl, data);
    return response.data;
  }

  async update(id: string, data: StudentScoreUpdateData) {
    const response = await api.put(`${this.baseUrl}/${id}`, data);
    return response.data;
  }

  async delete(id: string) {
    const response = await api.delete(`${this.baseUrl}/${id}`);
    return response.data;
  }

  async getByStudentAndItem(studentId: string, subjectEcrItemId: string) {
    const response = await api.get(this.baseUrl, {
      params: {
        student_id: studentId,
        subject_ecr_item_id: subjectEcrItemId,
        per_page: 1,
      },
    });
    return response.data;
  }

  async getByItem(subjectEcrItemId: string) {
    const response = await api.get(this.baseUrl, {
      params: {
        subject_ecr_item_id: subjectEcrItemId,
      },
    });
    return response.data;
  }

  async getBySubjectAndSection(subjectId: string, classSectionId: string) {
    console.log('Service: Fetching scores for subject:', subjectId, 'class section:', classSectionId);
    try {
      const response = await api.get(`${this.baseUrl}/by-subject-section`, {
        params: {
          subject_id: subjectId,
          class_section_id: classSectionId,
        },
      });
      console.log('Service: Response received:', response.data);
      return response.data;
    } catch (error) {
      console.error('Service: Error fetching scores:', error);
      throw error;
    }
  }

  async getByStudentAndSubject(studentId: string, subjectId: string) {
    const response = await api.get(`${this.baseUrl}/by-student-subject`, {
      params: {
        student_id: studentId,
        subject_id: subjectId,
      },
    });
    return response.data;
  }

  async upsertScore(data: StudentScoreCreateData) {
    // The backend store method already handles upsert logic
    const response = await api.post(this.baseUrl, data);
    return response.data;
  }
}

export const studentScoreService = new StudentScoreService(); 