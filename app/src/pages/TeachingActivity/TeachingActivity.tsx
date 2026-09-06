import { useNavigate } from 'react-router-dom'
import {
  BookOpen,
  ClipboardList,
  Eye,
  FileText,
  Paperclip,
  RefreshCw,
  Search,
  TriangleAlert,
  Users,
} from 'lucide-react'
import { Select } from '../../components/select'
import { useGradingPeriodsForYear } from '../../hooks/useGradingPeriods'
import { useTeachingActivity, type TeachingActivitySort } from '../../hooks/useTeachingActivity'
import { AttributionNote, Count, RateBar, StatTile } from './components/ActivityPrimitives'
import { formatWhen } from './activityFormat'
import type { TeachingActivityTeacherRow } from '../../types'

const SORT_OPTIONS: { value: TeachingActivitySort; label: string }[] = [
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'lessons', label: 'Most lessons' },
  { value: 'assessments', label: 'Most assessments' },
  { value: 'submission_rate', label: 'Lowest submission rate' },
  { value: 'last_activity', label: 'Least recently active' },
]

export default function TeachingActivity() {
  const navigate = useNavigate()
  const {
    totals,
    teachers,
    teacherCount,
    isLoading,
    isFetching,
    error,
    refetch,
    academicYear,
    setAcademicYear,
    academicYearOptions,
    quarter,
    setQuarter,
    search,
    setSearch,
    sort,
    setSort,
  } = useTeachingActivity()

  // A school that moved to 3 terms still has to read last year as 4 quarters,
  // so the period options follow the selected year, not today's.
  const periods = useGradingPeriodsForYear(academicYear)
  const quarterOptions = [
    { value: 'all', label: `Whole year` },
    ...periods.options,
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold text-gray-900">
              <Eye className="h-8 w-8 text-primary-600" />
              Teaching Activity
            </h1>
            <p className="mt-2 max-w-3xl text-gray-600">
              What each teacher has put up for their subjects — lessons, uploaded files and
              assessments — and how many of their students have submitted. Read-only: nothing here
              changes a teacher's work.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="w-40">
              <Select
                aria-label="Academic year"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                options={academicYearOptions}
                inputSize="sm"
              />
            </div>
            <div className="w-44">
              <Select
                aria-label={periods.noun}
                value={quarter}
                onChange={(e) => setQuarter(e.target.value)}
                options={quarterOptions}
                inputSize="sm"
              />
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {error ? (
          <p className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            Could not load teaching activity. {(error as Error).message}
          </p>
        ) : null}

        {/* School totals */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Lessons posted"
            value={totals?.lessons ?? '—'}
            hint={
              totals
                ? `${totals.lessons_published} published to students`
                : undefined
            }
            icon={<BookOpen className="h-4 w-4 text-gray-400" />}
          />
          <StatTile
            label="Files uploaded to lessons"
            value={totals?.lesson_files ?? '—'}
            hint={totals ? `${totals.lesson_plans} lesson plans generated` : undefined}
            icon={<Paperclip className="h-4 w-4 text-gray-400" />}
          />
          <StatTile
            label="Assessments created"
            value={totals?.assessments ?? '—'}
            hint={
              totals
                ? `${totals.assessments_published} published · ${totals.assessments_with_files} with images`
                : undefined
            }
            icon={<ClipboardList className="h-4 w-4 text-gray-400" />}
          />
          <StatTile
            label="Submission rate"
            value={
              totals?.submission_rate === null || totals?.submission_rate === undefined
                ? '—'
                : `${totals.submission_rate}%`
            }
            hint={
              totals
                ? `${totals.submissions_received} of ${totals.expected_submissions} expected submissions`
                : undefined
            }
            icon={<FileText className="h-4 w-4 text-gray-400" />}
          />
        </div>

        {/* The two things worth acting on, only when there is something to act on. */}
        {totals && (totals.teachers_with_nothing > 0 || totals.assessments_published_without_questions > 0) ? (
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {totals.teachers_with_nothing > 0 ? (
              <StatTile
                tone="warn"
                label="Teachers with nothing posted"
                value={totals.teachers_with_nothing}
                hint={`of ${totals.teachers} with a subject this ${
                  quarter === 'all' ? 'year' : periods.noun.toLowerCase()
                }`}
                icon={<TriangleAlert className="h-4 w-4 text-amber-500" />}
              />
            ) : null}
            {totals.assessments_published_without_questions > 0 ? (
              <StatTile
                tone="warn"
                label="Published with nothing to answer"
                value={totals.assessments_published_without_questions}
                hint="Students can see these assessments but cannot submit them"
                icon={<TriangleAlert className="h-4 w-4 text-amber-500" />}
              />
            ) : null}
          </div>
        ) : null}

        {/* Filters */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search teacher, email or role"
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="whitespace-nowrap text-sm text-gray-500">
              {teachers.length} of {teacherCount} teachers
            </span>
            <div className="w-52">
              <Select
                aria-label="Sort by"
                value={sort}
                onChange={(e) => setSort(e.target.value as TeachingActivitySort)}
                options={SORT_OPTIONS}
                inputSize="sm"
              />
            </div>
          </div>
        </div>

        {/* Teachers */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Teacher</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">Subjects</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">
                    Lessons
                    <span className="block text-xs font-normal text-gray-400">published</span>
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">
                    Files
                    <span className="block text-xs font-normal text-gray-400">uploaded</span>
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">
                    Assessments
                    <span className="block text-xs font-normal text-gray-400">published</span>
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Submissions</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Last activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                      Loading teaching activity…
                    </td>
                  </tr>
                ) : teachers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                      {teacherCount === 0
                        ? 'No subjects are assigned to a teacher for this school year yet.'
                        : 'No teacher matches that search.'}
                    </td>
                  </tr>
                ) : (
                  teachers.map((teacher) => (
                    <TeacherRow
                      key={teacher.user_id}
                      teacher={teacher}
                      onOpen={() => navigate(`/teaching-activity/${teacher.user_id}`)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-4 text-xs text-gray-500">
          Submissions are counted only for published assessments that carry questions — a gradebook
          column for work done on paper has nothing to submit online, so it is left out of the rate.
        </p>
      </div>
    </div>
  )
}

function TeacherRow({
  teacher,
  onOpen,
}: {
  teacher: TeachingActivityTeacherRow
  onOpen: () => void
}) {
  const hasNothing = teacher.lessons.total === 0 && teacher.assessments.total === 0

  return (
    <tr className="cursor-pointer transition-colors hover:bg-gray-50" onClick={onOpen}>
      <td className="px-4 py-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium text-gray-900">
              {teacher.name}
              <AttributionNote attribution={teacher.attribution} />
            </p>
            <p className="truncate text-xs text-gray-500">{teacher.role ?? teacher.email}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <Count value={teacher.subjects_count} />
        <span
          className="ml-1 inline-flex items-center gap-0.5 text-xs text-gray-400"
          title={`${teacher.students_count} students across their subjects`}
        >
          <Users className="h-3 w-3" />
          {teacher.students_count}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <Count value={teacher.lessons.total} of={undefined} />
        <span className="block text-xs text-gray-400 tabular-nums">
          {teacher.lessons.published} published
        </span>
        {teacher.empty_subjects.lessons > 0 ? (
          <span className="block text-xs text-amber-600">
            {teacher.empty_subjects.lessons} subject
            {teacher.empty_subjects.lessons === 1 ? '' : 's'} empty
          </span>
        ) : null}
      </td>
      <td className="px-4 py-3 text-right">
        <Count value={teacher.lessons.files} />
        <span className="block text-xs text-gray-400 tabular-nums">
          in {teacher.lessons.with_files} lesson{teacher.lessons.with_files === 1 ? '' : 's'}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <Count value={teacher.assessments.total} />
        <span className="block text-xs text-gray-400 tabular-nums">
          {teacher.assessments.published} published
        </span>
        {teacher.assessments.published_without_questions > 0 ? (
          <span className="block text-xs text-amber-600">
            {teacher.assessments.published_without_questions} with no questions
          </span>
        ) : null}
      </td>
      <td className="px-4 py-3">
        <RateBar
          rate={teacher.submissions.rate}
          received={teacher.submissions.received}
          expected={teacher.submissions.expected}
        />
      </td>
      <td className="px-4 py-3">
        <span className={hasNothing ? 'text-amber-700' : 'text-gray-600'}>
          {formatWhen(teacher.last_activity_at)}
        </span>
      </td>
    </tr>
  )
}
