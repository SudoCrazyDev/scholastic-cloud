import { api } from '@/lib/api';
import type { QuestionType, UploadAnswer } from './studentAssessmentService';

export interface GradingQuestionMeta {
  index: number;
  type: QuestionType;
  question: string;
  points: number;
  choices: string[];
  answer: string | string[] | null;
  blanks: string[];
  instructions: string;
  manual: boolean;
}

export type SubmittedAnswer = string | string[] | UploadAnswer | null;

export interface SubmissionPerQuestion {
  index: number;
  manual: boolean;
  answer: SubmittedAnswer;
  awarded: number | null;
  auto_correct: boolean | null;
}

export interface AssessmentSubmission {
  attempt_id: string;
  student: { id: string; name: string; lrn?: string | null };
  submitted_at: string | null;
  graded_at: string | null;
  is_fully_graded: boolean;
  objective_score: number;
  manual_total: number;
  total_score: number;
  max_score: number;
  per_question: SubmissionPerQuestion[];
}

export interface SubmissionsResponse {
  assessment: {
    id: string;
    title: string;
    type: string;
    quarter?: string;
    max_score: number;
    questions: GradingQuestionMeta[];
  };
  submissions: AssessmentSubmission[];
}

class AssessmentGradingService {
  async listSubmissions(itemId: string): Promise<{ success: boolean; data: SubmissionsResponse }> {
    const res = await api.get(`/assessment-methods/${itemId}/submissions`);
    return res.data;
  }

  async grade(
    itemId: string,
    attemptId: string,
    manualScores: Record<string, number | null>
  ): Promise<{ success: boolean; data: AssessmentSubmission }> {
    const res = await api.post(`/assessment-methods/${itemId}/submissions/${attemptId}/grade`, {
      manual_scores: manualScores,
    });
    return res.data;
  }
}

export const assessmentGradingService = new AssessmentGradingService();
