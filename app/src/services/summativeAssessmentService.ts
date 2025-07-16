import { api } from '@/lib/api';

export interface SummativeAssessmentComponent {
  title: string;
  percentage: number;
}

export interface CreateSummativeAssessmentPayload {
  subject_id: string;
  academic_year: string;
  summative_assessments: SummativeAssessmentComponent[];
}

class SummativeAssessmentService {
  private baseUrl = '/subject-summative-assessments';

  async create(data: CreateSummativeAssessmentPayload) {
    const response = await api.post(this.baseUrl, data);
    return response.data;
  }

  async getBySubjectAndYear(subjectId: string, academicYear: string) {
    const response = await api.get(this.baseUrl, {
      params: { subject_id: subjectId, academic_year: academicYear },
    });
    return response.data;
  }

  async update(id: string, data: Partial<CreateSummativeAssessmentPayload>) {
    const response = await api.patch(`${this.baseUrl}/${id}`, data);
    return response.data;
  }
}

export const summativeAssessmentService = new SummativeAssessmentService(); 