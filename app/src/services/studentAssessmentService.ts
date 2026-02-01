import { api } from '@/lib/api';

export interface StudentAssessmentItem {
  id: string;
  type: string;
  title: string;
  description?: string;
  quarter?: string;
  academic_year?: string;
  max_score?: number;
  scheduled_date?: string;
  subject_title?: string;
  has_questions: boolean;
  attempt_status: 'not_started' | 'in_progress' | 'submitted';
  attempt_score?: number | null;
  attempt_max_score?: number | null;
  attempt_submitted_at?: string | null;
}

export type QuestionType = 'true_false' | 'single_choice' | 'multiple_choice' | 'fill_in_the_blanks';

export interface AssessmentQuestion {
  index: number;
  type: QuestionType;
  question: string;
  choices?: string[];
  points: number;
  num_blanks?: number; // for fill_in_the_blanks
}

export interface TakeAssessmentPayload {
  id: string;
  type: string;
  title: string;
  description?: string;
  quarter?: string;
  max_score: number;
  subject_title?: string;
  questions: AssessmentQuestion[];
  attempt_id: string;
  answers: Record<string, string>;
}

export interface SubmitResult {
  score: number;
  max_score: number;
  attempt_id: string;
  submitted_at: string;
}

class StudentAssessmentService {
  private baseUrl = '/student-assessments';

  async list(): Promise<{ success: boolean; data: StudentAssessmentItem[] }> {
    const res = await api.get(this.baseUrl);
    return res.data;
  }

  async show(id: string): Promise<{ success: boolean; data: TakeAssessmentPayload & { attempt?: any; attempt_status: string } }> {
    const res = await api.get(`${this.baseUrl}/${id}`);
    return res.data;
  }

  async start(id: string): Promise<{ success: boolean; data: TakeAssessmentPayload }> {
    const res = await api.post(`${this.baseUrl}/${id}/start`);
    return res.data;
  }

  async submit(id: string, answers: Record<string, string | string[]>): Promise<{ success: boolean; data: SubmitResult }> {
    const res = await api.post(`${this.baseUrl}/${id}/submit`, { answers });
    return res.data;
  }
}

export const studentAssessmentService = new StudentAssessmentService();
