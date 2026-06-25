import React, { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  AcademicCapIcon,
  BookOpenIcon,
} from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';
import { studentLessonService } from '@/services/studentLessonService';
import { Badge } from '@/components/badge';
import { LessonContentViewer, stripHtml } from '@/pages/AssignedSubjects/components/LessonContentViewer';
import { RichTextEditor } from '@/pages/AssignedSubjects/components/RichTextEditor';

export const ViewLesson: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['student-lesson', id],
    queryFn: () => studentLessonService.show(id as string),
    enabled: !!id,
    retry: false,
  });

  const lesson = data?.data;

  // Mark as started once the lesson loads (unless already completed).
  const startMutation = useMutation({
    mutationFn: () => studentLessonService.start(id as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-lessons'] });
    },
  });

  useEffect(() => {
    if (lesson && lesson.progress_status === 'not_started') {
      startMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson?.id]);

  const completeMutation = useMutation({
    mutationFn: () => studentLessonService.complete(id as string),
    onSuccess: () => {
      toast.success('Lesson marked as complete.');
      queryClient.invalidateQueries({ queryKey: ['student-lesson', id] });
      queryClient.invalidateQueries({ queryKey: ['student-lessons'] });
    },
    onError: () => toast.error('Could not update progress. Please try again.'),
  });

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          <span className="ml-3 text-gray-600">Loading lesson...</span>
        </div>
      </div>
    );
  }

  if (error || !lesson) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-800 mb-4">This lesson is unavailable or you don't have access to it.</p>
          <Link to="/my-lessons" className="text-indigo-700 font-medium">← Back to My Lessons</Link>
        </div>
      </div>
    );
  }

  const isCompleted = lesson.progress_status === 'completed';

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <button
            onClick={() => navigate('/my-lessons')}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            title="Back"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">{lesson.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
              <span className="inline-flex items-center gap-1">
                <BookOpenIcon className="w-4 h-4" />
                {lesson.subject_title}
              </span>
              {lesson.quarter && <Badge color="zinc">Q{lesson.quarter}</Badge>}
              {lesson.estimated_minutes ? (
                <span className="inline-flex items-center gap-1">
                  <ClockIcon className="w-4 h-4" />
                  {lesson.estimated_minutes} min
                </span>
              ) : null}
              {isCompleted && (
                <span className="inline-flex items-center gap-1 text-green-700 font-medium">
                  <CheckCircleIcon className="w-4 h-4" /> Completed
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {stripHtml(lesson.description) && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <RichTextEditor value={lesson.description as string} editable={false} />
        </div>
      )}

      {/* Learning objectives */}
      {lesson.learning_objectives && lesson.learning_objectives.length > 0 && (
        <div className="rounded-xl border-l-4 border-indigo-500 bg-indigo-50 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-indigo-900">
            <AcademicCapIcon className="h-4 w-4" />
            Learning objectives
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-indigo-900">
            {lesson.learning_objectives.map((obj, i) => (
              <li key={i}>{obj}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Content */}
      <LessonContentViewer
        blocks={lesson.content}
        onOpenAssessment={(assessmentId) => navigate(`/my-assessments/${assessmentId}/take`)}
      />

      {/* Footer / complete */}
      <div className="flex items-center justify-between gap-4 border-t border-gray-200 pt-5">
        <Link to="/my-lessons" className="text-sm font-medium text-gray-600 hover:text-gray-800">
          ← Back to My Lessons
        </Link>
        <button
          onClick={() => completeMutation.mutate()}
          disabled={isCompleted || completeMutation.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CheckCircleIcon className="h-4 w-4" />
          {isCompleted ? 'Completed' : completeMutation.isPending ? 'Saving…' : 'Mark as complete'}
        </button>
      </div>
    </div>
  );
};

export default ViewLesson;
