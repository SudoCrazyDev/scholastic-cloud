import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpenIcon,
  CheckCircleIcon,
  ClockIcon,
  PlayIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import {
  studentLessonService,
  type StudentLessonItem,
  type StudentLessonSubject,
} from '@/services/studentLessonService';
import { Badge } from '@/components/badge';
import { Select } from '@/components/select';
import { SearchInput } from '@/components/search-input';
import { stripHtml } from '@/pages/AssignedSubjects/components/LessonContentViewer';

interface SubjectLessonGroup {
  subjectId: string;
  subjectTitle: string;
  lessons: StudentLessonItem[];
  completedCount: number;
}

const QUARTER_ORDER = (q?: string) => (q ? Number(q) || 99 : 99);

/** Above this many total lessons the subject sections start collapsed. */
const AUTO_EXPAND_LESSON_LIMIT = 12;

const QUARTER_OPTIONS = [
  { value: '', label: 'All quarters' },
  { value: '1', label: 'Quarter 1' },
  { value: '2', label: 'Quarter 2' },
  { value: '3', label: 'Quarter 3' },
  { value: '4', label: 'Quarter 4' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
];

export const MyLessons: React.FC = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['student-lessons'],
    queryFn: () => studentLessonService.list(),
    retry: false,
  });

  const items = (data?.data ?? []) as StudentLessonItem[];
  const subjects = (data?.subjects ?? []) as StudentLessonSubject[];
  const forbidden = error && (error as any)?.response?.status === 403;

  const [search, setSearch] = useState('');
  const [quarterFilter, setQuarterFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const hasFilters = Boolean(search.trim() || quarterFilter || statusFilter);

  // Every eligible subject gets a group, even with zero published lessons,
  // so students can tell "no lessons yet" apart from "subject missing".
  const groups = useMemo<SubjectLessonGroup[]>(() => {
    const bySubject = new Map<string, SubjectLessonGroup>();
    for (const subject of subjects) {
      bySubject.set(subject.id, {
        subjectId: subject.id,
        subjectTitle: subject.title?.trim() || 'Untitled Subject',
        lessons: [],
        completedCount: 0,
      });
    }
    for (const item of items) {
      let group = bySubject.get(item.subject_id);
      if (!group) {
        group = {
          subjectId: item.subject_id,
          subjectTitle: item.subject_title?.trim() || 'Unassigned Subject',
          lessons: [],
          completedCount: 0,
        };
        bySubject.set(item.subject_id, group);
      }
      group.lessons.push(item);
      if (item.progress_status === 'completed') group.completedCount += 1;
    }
    return Array.from(bySubject.values())
      .map((group) => ({
        ...group,
        lessons: [...group.lessons].sort((a, b) => {
          const q = QUARTER_ORDER(a.quarter) - QUARTER_ORDER(b.quarter);
          if (q !== 0) return q;
          return a.title.localeCompare(b.title);
        }),
      }))
      .sort((a, b) => a.subjectTitle.localeCompare(b.subjectTitle));
  }, [items, subjects]);

  // Default expansion: open everything while the list is small; collapse all
  // once there is enough content that scrolling becomes a problem.
  useEffect(() => {
    if (!data) return;
    if (items.length <= AUTO_EXPAND_LESSON_LIMIT) {
      setExpandedIds(new Set(groups.map((g) => g.subjectId)));
    } else {
      setExpandedIds(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const filteredGroups = useMemo(() => {
    if (!hasFilters) return groups;
    const term = search.trim().toLowerCase();
    return groups
      .map((group) => {
        const subjectMatches = term ? group.subjectTitle.toLowerCase().includes(term) : true;
        const lessons = group.lessons.filter((lesson) => {
          if (quarterFilter && (lesson.quarter || '') !== quarterFilter) return false;
          if (statusFilter && lesson.progress_status !== statusFilter) return false;
          if (!term || subjectMatches) return true;
          return (
            lesson.title.toLowerCase().includes(term) ||
            stripHtml(lesson.description).toLowerCase().includes(term)
          );
        });
        return { ...group, lessons };
      })
      .filter((group) => group.lessons.length > 0);
  }, [groups, hasFilters, search, quarterFilter, statusFilter]);

  const totalCompleted = useMemo(
    () => items.filter((i) => i.progress_status === 'completed').length,
    [items],
  );

  const toggleSubject = (subjectId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(subjectId)) next.delete(subjectId);
      else next.add(subjectId);
      return next;
    });
  };

  const allExpanded = filteredGroups.every((g) => expandedIds.has(g.subjectId));
  const toggleAll = () => {
    if (allExpanded) setExpandedIds(new Set());
    else setExpandedIds(new Set(groups.map((g) => g.subjectId)));
  };

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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Lessons</h1>
          <p className="text-gray-600 mt-1">
            Learning material from your subjects, grouped by subject. Open a lesson to read or watch.
          </p>
        </div>
        {items.length > 0 && (
          <div className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{totalCompleted}</span> of{' '}
            <span className="font-semibold text-gray-900">{items.length}</span> lessons completed
          </div>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-12 text-center text-gray-500">
          <BookOpenIcon className="w-12 h-12 mx-auto mb-3 text-gray-400" />
          <p>No subjects assigned to you yet.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-3">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search lessons or subjects..."
              className="flex-1"
            />
            <div className="flex gap-3">
              <Select
                inputSize="sm"
                className="w-36"
                options={QUARTER_OPTIONS}
                value={quarterFilter}
                onChange={(e) => setQuarterFilter(e.target.value)}
              />
              <Select
                inputSize="sm"
                className="w-36"
                options={STATUS_OPTIONS}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              />
              {!hasFilters && groups.length > 1 && (
                <button
                  type="button"
                  onClick={toggleAll}
                  className="shrink-0 text-sm font-medium text-indigo-700 hover:text-indigo-900 whitespace-nowrap"
                >
                  {allExpanded ? 'Collapse all' : 'Expand all'}
                </button>
              )}
            </div>
          </div>

          {filteredGroups.length === 0 ? (
            <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-12 text-center text-gray-500">
              <BookOpenIcon className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p>No lessons match your search or filters.</p>
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setQuarterFilter('');
                  setStatusFilter('');
                }}
                className="mt-3 text-sm font-medium text-indigo-700 hover:text-indigo-900"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredGroups.map((group) => {
                // Filtered views always show their matches; otherwise honor the toggle.
                const isExpanded = hasFilters || expandedIds.has(group.subjectId);
                const totalInSubject = group.lessons.length;

                return (
                  <section key={group.subjectId} className="bg-white border border-gray-200 rounded-xl shadow-sm">
                    <button
                      type="button"
                      onClick={() => !hasFilters && toggleSubject(group.subjectId)}
                      className={`w-full px-4 py-3 flex items-center justify-between gap-3 text-left ${
                        isExpanded ? 'border-b border-gray-100' : ''
                      } ${hasFilters ? 'cursor-default' : 'hover:bg-gray-50/70 rounded-t-xl'} ${
                        !isExpanded ? 'rounded-b-xl' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                          <BookOpenIcon className="w-4 h-4" />
                        </div>
                        <h2 className="text-sm sm:text-base font-semibold text-gray-900 truncate">
                          {group.subjectTitle}
                        </h2>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {totalInSubject > 0 ? (
                          <>
                            <Badge color="zinc">{totalInSubject} lesson(s)</Badge>
                            {group.completedCount > 0 && (
                              <Badge color={group.completedCount === totalInSubject ? 'green' : 'amber'}>
                                {group.completedCount}/{totalInSubject} done
                              </Badge>
                            )}
                          </>
                        ) : (
                          <Badge color="zinc">No lessons yet</Badge>
                        )}
                        {!hasFilters && (
                          <ChevronDownIcon
                            className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          />
                        )}
                      </div>
                    </button>

                    {isExpanded &&
                      (totalInSubject === 0 ? (
                        <div className="px-4 py-6 text-center text-sm text-gray-500">
                          No lessons published for this subject yet. Check back later.
                        </div>
                      ) : (
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
                                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                                          {stripHtml(lesson.description)}
                                        </p>
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
                      ))}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MyLessons;
