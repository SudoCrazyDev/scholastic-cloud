import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  DocumentTextIcon,
  PlayIcon,
  CheckCircleIcon,
  ClockIcon,
  BookOpenIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  BoltIcon,
} from '@heroicons/react/24/outline';
import { studentAssessmentService, type StudentAssessmentItem } from '@/services/studentAssessmentService';
import { Badge } from '@/components/badge';
import clsx from 'clsx';

interface SubjectAssessmentGroup {
  subjectTitle: string;
  assessments: StudentAssessmentItem[];
}

type StatusFilter = 'all' | 'todo' | 'in_progress' | 'submitted' | 'overdue';

const toDateSort = (value?: string | null) => (value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER);

const isOverdue = (item: StudentAssessmentItem, now: number) =>
  item.attempt_status !== 'submitted' && !!item.due_at && new Date(item.due_at).getTime() < now;

const TYPE_BADGE_COLOR: Record<string, 'blue' | 'violet' | 'emerald' | 'rose' | 'amber' | 'zinc'> = {
  quiz: 'blue',
  assignment: 'violet',
  activity: 'emerald',
  exam: 'rose',
  project: 'amber',
  other: 'zinc',
};

const TYPE_ACCENT: Record<string, string> = {
  quiz: 'border-l-blue-400',
  assignment: 'border-l-violet-400',
  activity: 'border-l-emerald-400',
  exam: 'border-l-rose-400',
  project: 'border-l-amber-400',
  other: 'border-l-zinc-300',
};

const typeLabel = (type: string) => (type ? type.charAt(0).toUpperCase() + type.slice(1) : type);

/** Small animated ring showing % of a subject's assessments that are submitted. */
const ProgressRing: React.FC<{ percent: number; size?: number; strokeWidth?: number }> = ({
  percent,
  size = 34,
  strokeWidth = 3.5,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, percent)) / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" className="text-gray-100" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className={clsx('transition-[stroke-dashoffset] duration-500 ease-out', percent >= 100 ? 'text-emerald-500' : 'text-indigo-500')}
      />
    </svg>
  );
};

const StatusPill: React.FC<{ item: StudentAssessmentItem; overdue: boolean }> = ({ item, overdue }) => {
  if (item.attempt_status === 'submitted') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
        <CheckCircleIcon className="w-4 h-4" />
        Submitted
      </span>
    );
  }
  if (item.attempt_status === 'in_progress') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
        <ClockIcon className="w-4 h-4" />
        In progress
      </span>
    );
  }
  if (overdue) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
        <ExclamationTriangleIcon className="w-4 h-4" />
        Overdue
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700">
      <PlayIcon className="w-4 h-4" />
      Ready
    </span>
  );
};

const AssessmentRow: React.FC<{ item: StudentAssessmentItem; now: number }> = ({ item, now }) => {
  const canOpen = item.has_questions || item.attempt_status === 'submitted' || item.attempt_status === 'in_progress';
  const overdue = isOverdue(item, now);
  const ctaLabel =
    item.attempt_status === 'submitted' ? 'View result' : item.attempt_status === 'in_progress' ? 'Continue' : 'Take assessment';

  const content = (
    <div
      className={clsx(
        'p-4 flex items-start justify-between gap-4 border-l-[3px] transition-colors hover:bg-indigo-50/40',
        TYPE_ACCENT[item.type] ?? TYPE_ACCENT.other
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-gray-900 truncate">{item.title}</p>
          <Badge color={TYPE_BADGE_COLOR[item.type] ?? 'zinc'}>{typeLabel(item.type)}</Badge>
          {item.quarter && <Badge color="zinc">Q{item.quarter}</Badge>}
          <StatusPill item={item} overdue={overdue} />
        </div>
        {item.description && <p className="text-sm text-gray-600 mt-1 line-clamp-2">{item.description}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
          {item.max_score != null && <span>Max score: {item.max_score}</span>}
          {item.due_at && (
            <span className={overdue ? 'text-red-600 font-medium' : undefined}>
              Due: {new Date(item.due_at).toLocaleString()}
            </span>
          )}
          {(item.attempts_allowed ?? 1) > 1 && (
            <span>
              Attempts: {item.attempts_used ?? 0} / {item.attempts_allowed}
              {item.attempt_status === 'submitted' && item.can_retake && ' · Retake available'}
            </span>
          )}
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

  return <li>{canOpen ? <Link to={`/my-assessments/${item.id}/take`}>{content}</Link> : content}</li>;
};

export const MyAssessments: React.FC = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['student-assessments'],
    queryFn: () => studentAssessmentService.list(),
    retry: false,
  });

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [openSubjects, setOpenSubjects] = useState<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const now = Date.now();
  const items = (data?.data ?? []) as StudentAssessmentItem[];
  const forbidden = error && (error as any)?.response?.status === 403;

  const publishedItems = useMemo(
    () => items.filter((item) => (item.status ?? 'published') === 'published'),
    [items]
  );

  const buildGroups = (list: StudentAssessmentItem[]): SubjectAssessmentGroup[] => {
    const bySubject = new Map<string, StudentAssessmentItem[]>();
    for (const item of list) {
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
  };

  // Full (unfiltered) groups drive the subject nav + real progress rings.
  const allGroups = useMemo(() => buildGroups(publishedItems), [publishedItems]);

  const stats = useMemo(() => {
    const total = publishedItems.length;
    const submitted = publishedItems.filter((i) => i.attempt_status === 'submitted').length;
    const inProgress = publishedItems.filter((i) => i.attempt_status === 'in_progress').length;
    const todo = publishedItems.filter((i) => i.attempt_status === 'not_started').length;
    const overdue = publishedItems.filter((i) => isOverdue(i, now)).length;
    return { total, submitted, inProgress, todo, overdue };
  }, [publishedItems, now]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return publishedItems.filter((item) => {
      if (statusFilter === 'todo' && item.attempt_status !== 'not_started') return false;
      if (statusFilter === 'in_progress' && item.attempt_status !== 'in_progress') return false;
      if (statusFilter === 'submitted' && item.attempt_status !== 'submitted') return false;
      if (statusFilter === 'overdue' && !isOverdue(item, now)) return false;
      if (q) {
        const hay = `${item.title} ${item.subject_title ?? ''} ${item.description ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [publishedItems, statusFilter, search, now]);

  const visibleGroups = useMemo(() => buildGroups(filteredItems), [filteredItems]);
  const isFilteredView = statusFilter !== 'all' || search.trim() !== '';

  // Default state: subjects with pending work start expanded, fully-completed subjects start collapsed.
  useEffect(() => {
    if (initializedRef.current || allGroups.length === 0) return;
    initializedRef.current = true;
    const defaultOpen = new Set<string>();
    for (const g of allGroups) {
      if (g.assessments.some((a) => a.attempt_status !== 'submitted')) defaultOpen.add(g.subjectTitle);
    }
    setOpenSubjects(defaultOpen);
  }, [allGroups]);

  const upNext = useMemo(() => {
    const actionable = publishedItems.filter((i) => i.attempt_status !== 'submitted');
    return [...actionable]
      .sort((a, b) => {
        if (a.attempt_status !== b.attempt_status) return a.attempt_status === 'in_progress' ? -1 : 1;
        return toDateSort(a.due_at) - toDateSort(b.due_at);
      })
      .slice(0, 4);
  }, [publishedItems]);

  const toggleSubject = (title: string) => {
    setOpenSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  const jumpToSubject = (title: string) => {
    setOpenSubjects((prev) => new Set(prev).add(title));
    // Let the expand animation start before scrolling so the section lands in view.
    requestAnimationFrame(() => {
      sectionRefs.current[title]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

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

  const filterChips: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: stats.total },
    { key: 'todo', label: 'To do', count: stats.todo },
    { key: 'in_progress', label: 'In progress', count: stats.inProgress },
    { key: 'submitted', label: 'Submitted', count: stats.submitted },
    ...(stats.overdue > 0 ? [{ key: 'overdue' as StatusFilter, label: 'Overdue', count: stats.overdue }] : []),
  ];

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
        <>
          {/* Sticky filter + search bar */}
          <div className="sticky top-0 z-10 -mx-6 px-6 py-3 bg-white/90 backdrop-blur border-b border-gray-100 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {filterChips.map((chip) => {
                const active = statusFilter === chip.key;
                return (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => setStatusFilter(chip.key)}
                    className={clsx(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                      active
                        ? chip.key === 'overdue'
                          ? 'bg-red-600 text-white'
                          : 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    )}
                  >
                    {chip.label}
                    <span
                      className={clsx(
                        'inline-flex items-center justify-center rounded-full px-1.5 text-xs',
                        active ? 'bg-white/20' : 'bg-white text-gray-500'
                      )}
                    >
                      {chip.count}
                    </span>
                  </button>
                );
              })}

              <div className="relative ml-auto w-full sm:w-64">
                <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search assessments..."
                  className="w-full rounded-full border border-gray-200 bg-gray-50 pl-9 pr-8 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Subject jump nav */}
            {allGroups.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {allGroups.map((g) => {
                  const submittedCount = g.assessments.filter((a) => a.attempt_status === 'submitted').length;
                  const pct = Math.round((submittedCount / g.assessments.length) * 100);
                  const pending = g.assessments.length - submittedCount;
                  return (
                    <button
                      key={g.subjectTitle}
                      type="button"
                      onClick={() => jumpToSubject(g.subjectTitle)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white pl-1.5 pr-3 py-1 text-xs font-medium text-gray-700 hover:border-indigo-300 hover:bg-indigo-50 shrink-0 transition-colors"
                    >
                      <ProgressRing percent={pct} size={20} strokeWidth={2.5} />
                      <span className="max-w-[9rem] truncate">{g.subjectTitle}</span>
                      {pending > 0 ? (
                        <span className="text-gray-400">{pending} left</span>
                      ) : (
                        <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-500" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Up next quick-access strip */}
          {!isFilteredView && upNext.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2 text-sm font-semibold text-gray-900">
                <BoltIcon className="w-4 h-4 text-amber-500" />
                Up next
              </div>
              <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
                {upNext.map((item) => {
                  const overdue = isOverdue(item, now);
                  const cta = item.attempt_status === 'in_progress' ? 'Continue' : 'Start';
                  return (
                    <motion.div key={item.id} whileHover={{ y: -2 }} className="shrink-0 w-56">
                      <Link
                        to={`/my-assessments/${item.id}/take`}
                        className={clsx(
                          'block h-full rounded-xl border p-3 bg-white shadow-sm hover:shadow-md transition-shadow',
                          overdue ? 'border-red-200' : 'border-gray-200'
                        )}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <Badge color={TYPE_BADGE_COLOR[item.type] ?? 'zinc'}>{typeLabel(item.type)}</Badge>
                          {overdue && <Badge color="red">Overdue</Badge>}
                        </div>
                        <p className="font-medium text-gray-900 text-sm truncate">{item.title}</p>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{item.subject_title || 'Unassigned Subject'}</p>
                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="text-gray-400">
                            {item.due_at ? `Due ${new Date(item.due_at).toLocaleDateString()}` : 'No due date'}
                          </span>
                          <span className="inline-flex items-center gap-0.5 font-medium text-indigo-700">
                            {cta}
                            <ChevronRightIcon className="w-3.5 h-3.5" />
                          </span>
                        </div>
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {visibleGroups.length === 0 ? (
            <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-10 text-center text-gray-500">
              <MagnifyingGlassIcon className="w-10 h-10 mx-auto mb-3 text-gray-400" />
              <p>No assessments match your filters.</p>
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('all');
                }}
                className="mt-3 text-sm font-medium text-indigo-600 hover:text-indigo-700"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {visibleGroups.map((group) => {
                const fullGroup = allGroups.find((g) => g.subjectTitle === group.subjectTitle)!;
                const submittedCount = fullGroup.assessments.filter((a) => a.attempt_status === 'submitted').length;
                const pct = Math.round((submittedCount / fullGroup.assessments.length) * 100);
                const open = isFilteredView || openSubjects.has(group.subjectTitle);

                return (
                  <section
                    key={group.subjectTitle}
                    ref={(el) => {
                      sectionRefs.current[group.subjectTitle] = el;
                    }}
                    className="bg-white border border-gray-200 rounded-xl shadow-sm scroll-mt-32 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => !isFilteredView && toggleSubject(group.subjectTitle)}
                      className={clsx(
                        'w-full px-4 py-3 flex items-center justify-between gap-3 text-left',
                        !isFilteredView && 'cursor-pointer hover:bg-gray-50'
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                          <BookOpenIcon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-sm sm:text-base font-semibold text-gray-900 truncate">{group.subjectTitle}</h2>
                          <p className="text-xs text-gray-500">
                            {submittedCount} of {fullGroup.assessments.length} submitted
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <ProgressRing percent={pct} />
                        <Badge color="zinc">{group.assessments.length} shown</Badge>
                        {!isFilteredView && (
                          <ChevronDownIcon
                            className={clsx('w-4 h-4 text-gray-400 transition-transform duration-200', open && 'rotate-180')}
                          />
                        )}
                      </div>
                    </button>

                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div
                          key="content"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: 'easeInOut' }}
                          className="overflow-hidden"
                        >
                          <ul className="divide-y divide-gray-100 border-t border-gray-100">
                            {group.assessments.map((item) => (
                              <AssessmentRow key={item.id} item={item} now={now} />
                            ))}
                          </ul>
                        </motion.div>
                      )}
                    </AnimatePresence>
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

export default MyAssessments;
