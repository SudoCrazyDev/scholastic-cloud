import { api } from '@/lib/api';

export interface SubjectEcrItem {
  id?: string;
  subject_ecr_id: string;
  type?: string;
  title: string;
  description?: string;
  content?: {
    questions?: Array<{
      type: 'true_false' | 'single_choice' | 'multiple_choice' | 'fill_in_the_blanks';
      question: string;
      choices?: string[];
      answer?: string | string[]; // string for single/true_false, string[] or "A,B" for multiple_choice
      blanks?: string[]; // correct answers in order for fill_in_the_blanks
      points?: number;
    }>;
  };
  score?: number;
  quarter?: string;
  academic_year?: string;
  scheduled_date?: string | null; // YYYY-MM-DD
}

class SubjectEcrItemService {
  private baseUrl = '/subjects-ecr-items';

  // Accepts subject_ecr_id as string or string[]
  async list(params?: { subject_ecr_id?: string | string[]; type?: string }) {
    // Axios will serialize arrays as repeated query params: ?subject_ecr_id=1&subject_ecr_id=2
    const response = await api.get(this.baseUrl, {
      params
    });
    return response.data;
  }

  async listBySubject(params: {
    subject_id: string;
    quarter?: string;
    scheduled_date?: string;
    date_from?: string;
    date_to?: string;
    type?: string;
  }) {
    const response = await api.get(this.baseUrl, { params });
    return response.data;
  }

  async get(id: string) {
    const response = await api.get(`${this.baseUrl}/${id}`);
    return response.data;
  }

  async create(data: Omit<SubjectEcrItem, 'id'>) {
    const response = await api.post(this.baseUrl, data);
    return response.data;
  }

  async update(id: string, data: Partial<Omit<SubjectEcrItem, 'id'>>) {
    const response = await api.patch(`${this.baseUrl}/${id}`, data);
    return response.data;
  }

  async delete(id: string) {
    const response = await api.delete(`${this.baseUrl}/${id}`);
    return response.data;
  }
}

export const subjectEcrItemService = new SubjectEcrItemService(); 