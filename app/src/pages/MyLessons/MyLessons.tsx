import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpenIcon,
  CheckCircleIcon,
  ClockIcon,
  PlayIcon,
  ChevronRightIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import { studentLessonService, type StudentLessonItem } from '@/services/studentLessonService';
import { Badge } from '@/components/badge';
import { stripHtml } from '@/pages/AssignedSubjects/components/LessonContentViewer';

interface SubjectLessonGroup {
  subjectTitle: string;
  lessons: StudentLessonItem[];
}

const QUARTER_ORDER = (q?: string) => (q ? Number(q) || 99 : 99);

export const MyLessons: React.FC = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['student-lessons'],
    queryFn: () => studentLessonService.list(),
    retry: false,
  });

  const items = (data?.data ?? []) as StudentLessonItem[];
  const forbidden = error && (error as any)?.response?.status === 403;

  const groups = useMemo<SubjectLessonGroup[]>(() => {
    const bySubject = new Map<string, StudentLessonItem[]>();
    for (const item of items) {
      const key = item.subject_title?.trim() || 'Unassigned Subject';
      if (!bySubject.has(key)) bySubject.set(key, []);
      bySubject.get(key)!.push(item);
    }
    return Array.from(bySubject.entries())
      .map(([subjectTitle, lessons]) => ({
        subjectTitle,
        lessons: [...lessons].sort((a, b) => {
          const q = QUARTER_ORDER(a.quarter) - QUARTER_ORDER(b.quarter);
          if (q !== 0) return q;
          return a.title.localeCompare(b.title);
        }),
      }))
      .sort((a, b) => a.subjectTitle.localeCompare(b.subjectTitle));
  }, [items]);

  if (forbidden) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <BookOpenIcon className="w-12 h-12 text-amber-600 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-amber-900 mb-2">Not linked to a student account</h2>
          <p className="text-amber-800 text-sm">
            Your user account is not linked to a student record. Ask your teacher or admin to link your login so you can read your lessons here.
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
          <span className="ml-3 text-gray-600">Loading lessons...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-800">Failed to load lessons. Please try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Lessons</h1>
        <p className="text-gray-600 mt-1">
          Learning material from your subjects, grouped by subject. Open a lesson to read or watch.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-12 text-center text-gray-500">
          <BookOpenIcon className="w-12 h-12 mx-auto mb-3 text-gray-400" />
          <p>No lessons published yet.</p>
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
                <Badge color="zinc">{group.lessons.length} lesson(s)</Badge>
              </div>

              <ul className="divide-y divide-gray-100">
                {group.lessons.map((lesson) => {
                  const statusPill =
                    lesson.progress_status === 'completed' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                        <CheckCircleIcon className="w-4 h-4" /> Completed
                      </span>
                    ) : lesson.progress_status === 'in_progress' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                        <ClockIcon className="w-4 h-4" /> In progress
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700">
                        <PlayIcon className="w-4 h-4" /> Not started
                      </span>
                    );

                  return (
                    <li key={lesson.id}>
                      <Link to={`/my-lessons/${lesson.id}/view`}>
                        <div className="p-4 flex items-start justify-between gap-4 transition-colors hover:bg-indigo-50/40">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-gray-900 truncate">{lesson.title}</p>
                              {lesson.quarter && <Badge color="zinc">Q{lesson.quarter}</Badge>}
                              {statusPill}
                            </div>
                            {stripHtml(lesson.description) && (
                              <p className="text-sm text-gray-600 mt-1 line-clamp-2">{stripHtml(lesson.description)}</p>
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                              <span className="inline-flex items-center gap-1">
                                <DocumentTextIcon className="w-3.5 h-3.5" />
                                {lesson.block_count} section(s)
                              </span>
                              {lesson.estimated_minutes ? (
                                <span className="inline-flex items-center gap-1">
                                  <ClockIcon className="w-3.5 h-3.5" />
                                  {lesson.estimated_minutes} min
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 text-indigo-700 text-sm font-medium shrink-0">
                            <span>{lesson.progress_status === 'completed' ? 'Review' : 'Open'}</span>
                            <ChevronRightIcon className="w-4 h-4" />
                          </div>
                        </div>
                      </Link>
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

export default MyLessons;
