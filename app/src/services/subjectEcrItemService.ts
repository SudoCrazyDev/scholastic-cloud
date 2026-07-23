import { api } from '@/lib/api';

export interface SubjectEcrItem {
  id?: string;
  subject_ecr_id: string;
  type?: string;
  status?: 'draft' | 'published';
  title: string;
  description?: string;
  settings?: {
    max_attempts?: number;
    time_limit_minutes?: number | null;
    pass_mark?: number | null;
    randomize_questions?: boolean;
  };
  /** 1 = legacy JSON questions/answers (index-keyed); 2 = normalized rows (id-keyed). */
  content_version?: number;
  content?: {
    settings?: {
      max_attempts?: number;
      time_limit_minutes?: number | null;
      pass_mark?: number | null;
      randomize_questions?: boolean;
    };
    questions?: Array<{
      id?: string;
      type:
        | 'true_false'
        | 'single_choice'
        | 'multiple_choice'
        | 'fill_in_the_blanks'
        | 'short_answer'
        | 'essay'
        | 'image_upload'
        | 'video_upload'
        | 'matching'
        | 'drag_picture';
      question: string;
      choices?: string[];
      choiceImages?: string[]; // optional image URL per choice, aligned with choices
      allow_multiple?: boolean;
      answer?: string | string[]; // string for single/true_false, string[] or "A,B" for multiple_choice
      blanks?: string[]; // correct answers in order for fill_in_the_blanks
      instructions?: string; // for image_upload / video_upload
      pairs?: Array<{ left: string; right: string }>; // for matching
      targets?: Array<{ id: string; label: string }>; // for drag_picture: drop zones
      cards?: Array<{ id: string; imageUrl: string; label: string; targetId: string }>; // for drag_picture
      points?: number;
    }>;
  };
  score?: number;
  quarter?: string;
  academic_year?: string;
  scheduled_date?: string | null; // YYYY-MM-DD
  open_at?: string | null;
  close_at?: string | null;
  due_at?: string | null;
  allow_late_submission?: boolean;
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

  // Uploads an image used inside a question (e.g. Drag The Picture cards); returns a public URL.
  async uploadImage(file: File): Promise<{ success: boolean; data: { url: string; path: string } }> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(`${this.baseUrl}/images`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }
}

export const subjectEcrItemService = new SubjectEcrItemService(); 