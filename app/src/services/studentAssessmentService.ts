import { api } from '@/lib/api';

export interface StudentAssessmentItem {
  id: string;
  type: string;
  status?: 'draft' | 'published';
  title: string;
  description?: string;
  quarter?: string;
  academic_year?: string;
  max_score?: number;
  scheduled_date?: string;
  open_at?: string | null;
  close_at?: string | null;
  due_at?: string | null;
  allow_late_submission?: boolean;
  subject_title?: string;
  has_questions: boolean;
  attempt_status: 'not_started' | 'in_progress' | 'submitted';
  attempt_score?: number | null;
  attempt_max_score?: number | null;
  attempt_submitted_at?: string | null;
  attempts_used?: number;
  attempts_allowed?: number;
  can_retake?: boolean;
}

export type QuestionType =
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

export interface UploadAnswer {
  path: string;
  url: string | null;
  name: string;
  mime: string;
  size: number;
}

/** Drag The Picture answer: maps each card id to the target (drop zone) id it was placed in. */
export type DragPictureAnswer = Record<string, string>;

export type AssessmentAnswer = string | string[] | UploadAnswer | UploadAnswer[] | DragPictureAnswer | null;
export type AssessmentAnswers = Record<string, AssessmentAnswer>;

/** Student-facing drop zone for a drag_picture question. */
export interface DragTargetView {
  id: string;
  label: string;
}

/** Student-facing picture card (answer key stripped) for a drag_picture question. */
export interface DragCardView {
  id: string;
  imageUrl: string;
  label: string;
}

export interface AssessmentQuestion {
  index: number;
  /** Stable question id (v2). Null for legacy v1 questions; the client keys answers by it when present. */
  id?: string | null;
  type: QuestionType;
  question: string;
  choices?: string[];
  choiceImages?: string[]; // optional image URL per choice, aligned with choices
  points: number;
  num_blanks?: number; // for fill_in_the_blanks
  placeholder?: string;
  instructions?: string; // for image_upload / video_upload
  accept?: string; // accepted file types, e.g. "image/*" or "video/*"
  lefts?: string[]; // for matching: left prompts in order
  options?: string[]; // for matching: right values, shuffled
  targets?: DragTargetView[]; // for drag_picture: drop zones
  cards?: DragCardView[]; // for drag_picture: draggable picture cards
}

export interface TakeAssessmentPayload {
  id: string;
  type: string;
  status?: 'draft' | 'published';
  title: string;
  description?: string;
  quarter?: string;
  max_score: number;
  subject_title?: string;
  open_at?: string | null;
  close_at?: string | null;
  due_at?: string | null;
  allow_late_submission?: boolean;
  settings?: {
    max_attempts?: number;
    time_limit_minutes?: number | null;
    pass_mark?: number | null;
    randomize_questions?: boolean;
  };
  attempts_used?: number;
  attempts_allowed?: number;
  can_retake?: boolean;
  questions: AssessmentQuestion[];
  attempt_id: string;
  answers: AssessmentAnswers;
}

export interface SubmitResult {
  score: number;
  max_score: number;
  attempt_id: string;
  submitted_at: string;
  needs_manual_grading?: boolean;
  attempts_used?: number;
  attempts_allowed?: number;
  can_retake?: boolean;
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

  async submit(id: string, answers: AssessmentAnswers): Promise<{ success: boolean; data: SubmitResult }> {
    const res = await api.post(`${this.baseUrl}/${id}/submit`, { answers });
    return res.data;
  }

  async uploadAttachment(
    id: string,
    questionIndex: number,
    file: File
  ): Promise<{ success: boolean; data: UploadAnswer }> {
    const formData = new FormData();
    formData.append('question_index', String(questionIndex));
    formData.append('file', file);
    const res = await api.post(`${this.baseUrl}/${id}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  }
}

export const studentAssessmentService = new StudentAssessmentService();
