import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  DocumentTextIcon,
  PlayIcon,
  CheckCircleIcon,
  ClockIcon,
  BookOpenIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { studentAssessmentService, type StudentAssessmentItem } from '@/services/studentAssessmentService';
import { Badge } from '@/components/badge';

interface SubjectAssessmentGroup {
  subjectTitle: string;
  assessments: StudentAssessmentItem[];
}

const toDateSort = (value?: string | null) => (value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER);

export const MyAssessments: React.FC = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['student-assessments'],
    queryFn: () => studentAssessmentService.list(),
    retry: false,
  });

  const items = (data?.data ?? []) as StudentAssessmentItem[];
  const forbidden = error && (error as any)?.response?.status === 403;

  const publishedItems = useMemo(
    () => items.filter((item) => (item.status ?? 'published') === 'published'),
    [items]
  );

  const groups = useMemo<SubjectAssessmentGroup[]>(() => {
    const bySubject = new Map<string, StudentAssessmentItem[]>();
    for (const item of publishedItems) {
      const key = item.subject_title?.trim() || 'Unassigned Subject';
      if (!bySubject.has(key)) bySubject.set(key, []);
      bySubject.get(key)!.push(item);
    }

    return Array.from(bySubject.entries())
      .map(([subjectTitle, assessments]) => ({
        subjectTitle,
        assessments: [...assessments].sort((a, b) => {
          const dueDiff = toDateSort(a.due_at) - toDateSort(b.due_at);
          if (dueDiff !== 0) return dueDiff;
          const scheduledDiff = toDateSort(a.scheduled_date) - toDateSort(b.scheduled_date);
          if (scheduledDiff !== 0) return scheduledDiff;
          return a.title.localeCompare(b.title);
        }),
      }))
      .sort((a, b) => a.subjectTitle.localeCompare(b.subjectTitle));
  }, [publishedItems]);

  if (forbidden) {
    return (
      <div className="max-w-5xl mx-auto p-6">
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
      <div className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          <span className="ml-3 text-gray-600">Loading assessments...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-800">Failed to load assessments. Please try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Assessments</h1>
        <p className="text-gray-600 mt-1">
          Published quizzes, assignments, and exams grouped by subject. Click any item to answer.
        </p>
      </div>

      {publishedItems.length === 0 ? (
        <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-12 text-center text-gray-500">
          <DocumentTextIcon className="w-12 h-12 mx-auto mb-3 text-gray-400" />
          <p>No published assessments yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.subjectTitle} className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
                    <BookOpenIcon className="w-4 h-4" />
                  </div>
                  <h2 className="text-sm sm:text-base font-semibold text-gray-900 truncate">{group.subjectTitle}</h2>
                </div>
                <Badge color="zinc">{group.assessments.length} item(s)</Badge>
              </div>

              <ul className="divide-y divide-gray-100">
                {group.assessments.map((item) => {
                  const canOpen = item.has_questions || item.attempt_status === 'submitted' || item.attempt_status === 'in_progress';
                  const ctaLabel =
                    item.attempt_status === 'submitted'
                      ? 'View result'
                      : item.attempt_status === 'in_progress'
                        ? 'Continue'
                        : 'Take assessment';

                  const statusPill =
                    item.attempt_status === 'submitted' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                        <CheckCircleIcon className="w-4 h-4" />
                        Submitted
                      </span>
                    ) : item.attempt_status === 'in_progress' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                        <ClockIcon className="w-4 h-4" />
                        In progress
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700">
                        <PlayIcon className="w-4 h-4" />
                        Ready
                      </span>
                    );

                  const content = (
                    <div className="p-4 flex items-start justify-between gap-4 transition-colors hover:bg-indigo-50/40">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-gray-900 truncate">{item.title}</p>
                          <Badge color="blue">{item.type}</Badge>
                          {item.quarter && <Badge color="zinc">Q{item.quarter}</Badge>}
                          {statusPill}
                        </div>
                        {item.description && (
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">{item.description}</p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                          {item.max_score != null && <span>Max score: {item.max_score}</span>}
                          {item.due_at && <span>Due: {new Date(item.due_at).toLocaleString()}</span>}
                          {item.attempt_status === 'submitted' && item.attempt_score != null && item.attempt_max_score != null && (
                            <span className="font-medium text-indigo-700">
                              Score: {item.attempt_score} / {item.attempt_max_score}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-indigo-700 text-sm font-medium shrink-0">
                        {canOpen ? (
                          <>
                            <span>{ctaLabel}</span>
                            <ChevronRightIcon className="w-4 h-4" />
                          </>
                        ) : (
                          <span className="text-gray-400">No questions yet</span>
                        )}
                      </div>
                    </div>
                  );

                  return (
                    <li key={item.id}>
                      {canOpen ? <Link to={`/my-assessments/${item.id}/take`}>{content}</Link> : content}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default MyAssessments;
