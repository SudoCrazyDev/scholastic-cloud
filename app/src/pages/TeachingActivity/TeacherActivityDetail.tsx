import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  BookOpen,
  ClipboardList,
  ExternalLink,
  Paperclip,
  TriangleAlert,
} from 'lucide-react'
import { Select } from '../../components/select'
import { useAuth } from '../../hooks/useAuth'
import { useGradingPeriodsForYear } from '../../hooks/useGradingPeriods'
import { useTeacherActivity } from '../../hooks/useTeachingActivity'
import { AttributionNote, Count, RateBar, StatTile } from './components/ActivityPrimitives'
import { formatWhen } from './activityFormat'
import SubmissionRosterModal from './components/SubmissionRosterModal'
import type { TeachingActivityAssessment, TeachingActivityLesson } from '../../types'

type Tab = 'subjects' | 'lessons' | 'assessments'

export default function TeacherActivityDetail() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const { currentAcademicYear } = useAuth()

  // Kept in the URL so a principal can send someone the exact view they are
  // looking at — a specific teacher, year and quarter.
  const [params, setParams] = useSearchParams()
  const academicYear = params.get('academic_year') ?? currentAcademicYear ?? ''
  const quarter = params.get('quarter') ?? 'all'

  const [tab, setTab] = useState<Tab>('lessons')
  const [openAssessmentId, setOpenAssessmentId] = useState<string | null>(null)

  const periods = useGradingPeriodsForYear(academicYear)
  const { detail, isLoading, error } = useTeacherActivity(userId, academicYear, quarter)

  // Usable before the first response arrives, so the selector is never empty.
  const years = new Set(detail?.available_academic_years ?? [])
  if (academicYear) years.add(academicYear)
  const academicYearOptions = Array.from(years)
    .sort()
    .reverse()
    .map((year) => ({ value: year, label: year }))

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    next.set(key, value)
    setParams(next, { replace: true })
  }

  const teacher = detail?.teacher

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => navigate('/teaching-activity')}
          className="mb-4 flex items-center gap-1.5 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          All teachers
        </button>

        {error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            Could not load this teacher's activity. {(error as Error).message}
          </p>
        ) : null}

        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {isLoading ? 'Loading…' : (teacher?.name ?? 'Teacher')}
              {teacher ? <AttributionNote attribution={teacher.attribution} /> : null}
            </h1>
            <p className="mt-1 text-gray-600">
              {teacher?.role ?? ''}
              {teacher?.email ? ` · ${teacher.email}` : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="w-40">
              <Select
                aria-label="Academic year"
                value={academicYear}
                onChange={(e) => setParam('academic_year', e.target.value)}
                options={academicYearOptions}
                inputSize="sm"
              />
            </div>
            <div className="w-44">
              <Select
                aria-label={periods.noun}
                value={quarter}
                onChange={(e) => setParam('quarter', e.target.value)}
                options={[{ value: 'all', label: 'Whole year' }, ...periods.options]}
                inputSize="sm"
              />
            </div>
          </div>
        </div>

        {teacher ? (
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Lessons"
              value={teacher.lessons.total}
              hint={`${teacher.lessons.published} published to students`}
              icon={<BookOpen className="h-4 w-4 text-gray-400" />}
            />
            <StatTile
              label="Files uploaded"
              value={teacher.lessons.files}
              hint={`across ${teacher.lessons.with_files} lesson${
                teacher.lessons.with_files === 1 ? '' : 's'
              }`}
              icon={<Paperclip className="h-4 w-4 text-gray-400" />}
            />
            <StatTile
              label="Assessments"
              value={teacher.assessments.total}
              hint={`${teacher.assessments.online} takeable online`}
              icon={<ClipboardList className="h-4 w-4 text-gray-400" />}
            />
            <StatTile
              label="Submission rate"
              value={
                teacher.submissions.rate === null ? '—' : `${teacher.submissions.rate}%`
              }
              hint={`${teacher.submissions.received} of ${teacher.submissions.expected} expected`}
            />
          </div>
        ) : null}

        {/* Tabs */}
        <div className="mb-4 flex gap-1 border-b border-gray-200">
          {(
            [
              ['lessons', `Lessons (${detail?.lessons.length ?? 0})`],
              ['assessments', `Assessments (${detail?.assessments.length ?? 0})`],
              ['subjects', `Subjects (${detail?.subjects.length ?? 0})`],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                tab === key
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          {isLoading ? (
            <p className="px-4 py-10 text-center text-gray-500">Loading…</p>
          ) : tab === 'lessons' ? (
            <LessonsTable lessons={detail?.lessons ?? []} />
          ) : tab === 'assessments' ? (
            <AssessmentsTable
              assessments={detail?.assessments ?? []}
              onOpenSubmissions={setOpenAssessmentId}
            />
          ) : (
            <SubjectsTable subjects={detail?.subjects ?? []} />
          )}
        </div>
      </div>

      <SubmissionRosterModal
        itemId={openAssessmentId}
        onClose={() => setOpenAssessmentId(null)}
      />
    </div>
  )
}

function LessonsTable({ lessons }: { lessons: TeachingActivityLesson[] }) {
  if (lessons.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-gray-500">
        No lessons posted for this period.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-semibold text-gray-700">Lesson</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-700">Subject</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-700">Files</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-700">Read by students</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-700">Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {lessons.map((lesson) => (
            <tr key={lesson.id}>
              <td className="px-4 py-3">
                <p className="font-medium text-gray-900">
                  {lesson.title}
                  <AttributionNote attribution={lesson.attribution} />
                </p>
                <span
                  className={`mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                    lesson.is_published
                      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                      : 'bg-gray-100 text-gray-600 ring-gray-200'
                  }`}
                >
                  {lesson.is_published ? 'Published' : 'Draft'}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-700">
                {lesson.subject_title}
                {lesson.section_title ? (
                  <span className="block text-xs text-gray-400">{lesson.section_title}</span>
                ) : null}
              </td>
              <td className="px-4 py-3">
                {lesson.files.length === 0 ? (
                  <span className="text-gray-300">None</span>
                ) : (
                  <ul className="space-y-1">
                    {lesson.files.map((file, index) => (
                      <li key={`${lesson.id}-${index}`}>
                        {file.url ? (
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex max-w-[16rem] items-center gap-1 truncate text-primary-600 hover:underline"
                            title={file.name}
                          >
                            <Paperclip className="h-3 w-3 shrink-0" />
                            <span className="truncate">{file.name}</span>
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 text-gray-500"
                            title="This attachment predates stored file paths, so it cannot be reopened from here."
                          >
                            <Paperclip className="h-3 w-3" />
                            {file.name}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </td>
              <td className="px-4 py-3">
                <RateBar
                  rate={lesson.progress.rate}
                  received={lesson.progress.completed}
                  expected={lesson.progress.expected}
                />
              </td>
              <td className="px-4 py-3 text-gray-600">{formatWhen(lesson.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AssessmentsTable({
  assessments,
  onOpenSubmissions,
}: {
  assessments: TeachingActivityAssessment[]
  onOpenSubmissions: (id: string) => void
}) {
  if (assessments.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-gray-500">
        No assessments created for this period.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-semibold text-gray-700">Assessment</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-700">Subject</th>
            <th className="px-4 py-3 text-right font-semibold text-gray-700">Questions</th>
            <th className="px-4 py-3 text-right font-semibold text-gray-700">Images</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-700">Submissions</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-700">Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {assessments.map((assessment) => (
            <tr key={assessment.id}>
              <td className="px-4 py-3">
                <p className="font-medium text-gray-900">
                  {assessment.title}
                  <AttributionNote attribution={assessment.attribution} />
                </p>
                <span className="text-xs capitalize text-gray-500">
                  {assessment.type}
                  {assessment.component_title ? ` · ${assessment.component_title}` : ''}
                </span>
                {assessment.status !== 'published' ? (
                  <span className="ml-1 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-200">
                    Draft
                  </span>
                ) : assessment.question_count === 0 ? (
                  <span
                    className="ml-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200"
                    title="Students can see this but there is nothing to answer, so no submission is expected."
                  >
                    <TriangleAlert className="h-3 w-3" />
                    No questions
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3 text-gray-700">
                {assessment.subject_title}
                {assessment.section_title ? (
                  <span className="block text-xs text-gray-400">{assessment.section_title}</span>
                ) : null}
              </td>
              <td className="px-4 py-3 text-right">
                <Count value={assessment.question_count} />
              </td>
              <td className="px-4 py-3 text-right">
                <Count value={assessment.files} />
              </td>
              <td className="px-4 py-3">
                {assessment.is_online ? (
                  <button
                    type="button"
                    onClick={() => onOpenSubmissions(assessment.id)}
                    className="text-left"
                    title="See who has and has not submitted"
                  >
                    <RateBar
                      rate={assessment.submissions.rate}
                      received={assessment.submissions.received}
                      expected={assessment.submissions.expected}
                    />
                  </button>
                ) : (
                  <span className="text-sm text-gray-400" title="Not submitted online">
                    —
                  </span>
                )}
                {assessment.submissions.pending_grading > 0 ? (
                  <span className="mt-1 block text-xs text-amber-600">
                    {assessment.submissions.pending_grading} awaiting grading
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3 text-gray-600">{formatWhen(assessment.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SubjectsTable({
  subjects,
}: {
  subjects: import('../../types').TeachingActivitySubjectRow[]
}) {
  if (subjects.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-gray-500">
        No subjects assigned for this school year.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-semibold text-gray-700">Subject</th>
            <th className="px-4 py-3 text-right font-semibold text-gray-700">Students</th>
            <th className="px-4 py-3 text-right font-semibold text-gray-700">Lessons</th>
            <th className="px-4 py-3 text-right font-semibold text-gray-700">Files</th>
            <th className="px-4 py-3 text-right font-semibold text-gray-700">Assessments</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-700">Submissions</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-700">Last activity</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {subjects.map((subject) => (
            <tr key={subject.subject_id}>
              <td className="px-4 py-3">
                <p className="font-medium text-gray-900">
                  {subject.title}
                  {subject.variant ? ` (${subject.variant})` : ''}
                </p>
                <span className="text-xs text-gray-400">
                  {[subject.grade_level, subject.section_title].filter(Boolean).join(' · ')}
                  {subject.is_adviser ? '' : ' · covering'}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <Count value={subject.students_count} />
              </td>
              <td className="px-4 py-3 text-right">
                <Count value={subject.lessons.total} />
              </td>
              <td className="px-4 py-3 text-right">
                <Count value={subject.lessons.files} />
              </td>
              <td className="px-4 py-3 text-right">
                <Count value={subject.assessments.total} />
              </td>
              <td className="px-4 py-3">
                <RateBar
                  rate={subject.submissions.rate}
                  received={subject.submissions.received}
                  expected={subject.submissions.expected}
                />
              </td>
              <td className="px-4 py-3 text-gray-600">{formatWhen(subject.last_activity_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
