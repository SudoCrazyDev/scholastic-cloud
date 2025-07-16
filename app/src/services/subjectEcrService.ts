import { api } from '@/lib/api';

export interface SubjectEcrComponent {
  id?: string;
  subject_id: string;
  title: string;
  percentage: number;
}

class SubjectEcrService {
  private baseUrl = '/subjects-ecr';

  async getBySubject(subjectId: string) {
    const response = await api.get(this.baseUrl, {
      params: { subject_id: subjectId },
    });
    return response.data;
  }

  async create(data: Omit<SubjectEcrComponent, 'id'>) {
    const response = await api.post(this.baseUrl, data);
    return response.data;
  }

  async update(id: string, data: Partial<Omit<SubjectEcrComponent, 'id'>>) {
    const response = await api.patch(`${this.baseUrl}/${id}`, data);
    return response.data;
  }

  async delete(id: string) {
    const response = await api.delete(`${this.baseUrl}/${id}`);
    return response.data;
  }
}

export const subjectEcrService = new SubjectEcrService(); 