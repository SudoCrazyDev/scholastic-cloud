import { api } from '@/lib/api';
import type { LessonBlock } from '@/types';

export type LessonProgressStatus = 'not_started' | 'in_progress' | 'completed';

export interface StudentLessonItem {
  id: string;
  title: string;
  description?: string;
  quarter?: string;
  subject_id: string;
  subject_title?: string;
  estimated_minutes?: number | null;
  learning_objectives?: string[];
  block_count: number;
  progress_status: LessonProgressStatus;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface StudentLessonDetail {
  id: string;
  title: string;
  description?: string;
  quarter?: string;
  subject_id: string;
  subject_title?: string;
  estimated_minutes?: number | null;
  learning_objectives?: string[];
  content: LessonBlock[];
  progress_status: LessonProgressStatus;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface LessonProgressResult {
  progress_status: LessonProgressStatus;
  started_at?: string | null;
  completed_at?: string | null;
}

class StudentLessonService {
  private baseUrl = '/student-lessons';

  async list(): Promise<{ success: boolean; data: StudentLessonItem[] }> {
    const res = await api.get(this.baseUrl);
    return res.data;
  }

  async show(id: string): Promise<{ success: boolean; data: StudentLessonDetail }> {
    const res = await api.get(`${this.baseUrl}/${id}`);
    return res.data;
  }

  async start(id: string): Promise<{ success: boolean; data: LessonProgressResult }> {
    const res = await api.post(`${this.baseUrl}/${id}/start`);
    return res.data;
  }

  async complete(id: string): Promise<{ success: boolean; data: LessonProgressResult }> {
    const res = await api.post(`${this.baseUrl}/${id}/complete`);
    return res.data;
  }
}

export const studentLessonService = new StudentLessonService();
