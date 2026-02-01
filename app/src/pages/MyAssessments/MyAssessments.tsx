import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DocumentTextIcon, PlayIcon, CheckCircleIcon, ClockIcon } from '@heroicons/react/24/outline';
import { studentAssessmentService, type StudentAssessmentItem } from '@/services/studentAssessmentService';
import { Button } from '@/components/button';
import { Badge } from '@/components/badge';

export const MyAssessments: React.FC = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['student-assessments'],
    queryFn: () => studentAssessmentService.list(),
    retry: false,
  });

  const items = (data?.data ?? []) as StudentAssessmentItem[];
  const forbidden = error && (error as any)?.response?.status === 403;

  if (forbidden) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <DocumentTextIcon className="w-12 h-12 text-amber-600 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-amber-900 mb-2">Not linked to a student account</h2>
          <p className="text-amber-800 text-sm mb-4">
            Your user account is not linked to a student record. Ask your teacher or admin to link your login to your student profile so you can see and take quizzes, assignments, and exams here.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          <span className="ml-3 text-gray-600">Loading assessments...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-800">Failed to load assessments. Please try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Assessments</h1>
        <p className="text-gray-600 mt-1">Quizzes, assignments, and exams you can take. Your score is shown after you submit.</p>
      </div>

      {items.length === 0 ? (
        <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-12 text-center text-gray-500">
          <DocumentTextIcon className="w-12 h-12 mx-auto mb-3 text-gray-400" />
          <p>No assessments assigned yet.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:border-indigo-200 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{item.title}</span>
                    <Badge color="zinc">{item.type}</Badge>
                    {item.quarter && <Badge color="zinc">Q{item.quarter}</Badge>}
                    {item.attempt_status === 'submitted' && (
                      <span className="inline-flex items-center gap-1 text-sm text-green-700">
                        <CheckCircleIcon className="w-4 h-4" />
                        Submitted
                      </span>
                    )}
                    {item.attempt_status === 'in_progress' && (
                      <span className="inline-flex items-center gap-1 text-sm text-amber-700">
                        <ClockIcon className="w-4 h-4" />
                        In progress
                      </span>
                    )}
                  </div>
                  {item.subject_title && (
                    <p className="text-sm text-gray-500 mt-1">{item.subject_title}</p>
                  )}
                  {item.attempt_status === 'submitted' && item.attempt_score != null && item.attempt_max_score != null && (
                    <p className="text-sm font-medium text-indigo-600 mt-2">
                      Score: {item.attempt_score} / {item.attempt_max_score}
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0">
                  {item.attempt_status === 'submitted' ? (
                    <Link to={`/my-assessments/${item.id}/take`}>
                      <Button variant="outline" size="sm">View result</Button>
                    </Link>
                  ) : item.has_questions ? (
                    <Link to={`/my-assessments/${item.id}/take`}>
                      <Button size="sm" className="inline-flex items-center gap-1">
                        <PlayIcon className="w-4 h-4" />
                        {item.attempt_status === 'in_progress' ? 'Continue' : 'Take'}
                      </Button>
                    </Link>
                  ) : (
                    <span className="text-xs text-gray-500">No questions yet</span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default MyAssessments;
