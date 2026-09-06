import { Dialog, DialogBody, DialogTitle } from '../../../components/dialog'
import { useAssessmentSubmissionRoster } from '../../../hooks/useTeachingActivity'
import { RateBar } from './ActivityPrimitives'
import type { TeachingActivitySubmissionStudent } from '../../../types'

const STATUS_LABEL: Record<TeachingActivitySubmissionStudent['status'], string> = {
  submitted: 'Submitted',
  in_progress: 'Started',
  not_started: 'Not started',
}

const STATUS_CLASS: Record<TeachingActivitySubmissionStudent['status'], string> = {
  submitted: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  in_progress: 'bg-amber-50 text-amber-700 ring-amber-200',
  not_started: 'bg-gray-100 text-gray-600 ring-gray-200',
}

/**
 * Who has and has not submitted one assessment.
 *
 * Lists the whole roster, not just the submissions — the students who never
 * opened it are the reason a principal came looking.
 */
export default function SubmissionRosterModal({
  itemId,
  onClose,
}: {
  itemId: string | null
  onClose: () => void
}) {
  const { roster, isLoading, error } = useAssessmentSubmissionRoster(itemId)

  return (
    <Dialog open={Boolean(itemId)} onClose={onClose} size="3xl">
      <DialogTitle>{roster?.assessment.title ?? 'Submissions'}</DialogTitle>

      <DialogBody>
        {isLoading ? (
          <p className="py-8 text-center text-sm text-gray-500">Loading submissions…</p>
        ) : error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            Could not load submissions. {(error as Error).message}
          </p>
        ) : !roster ? null : (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <div className="text-sm text-gray-600">
                <p>
                  {roster.assessment.subject_title}
                  {roster.assessment.section_title ? ` · ${roster.assessment.section_title}` : ''}
                </p>
                <p className="text-xs text-gray-500">
                  {roster.assessment.question_count} question
                  {roster.assessment.question_count === 1 ? '' : 's'} · {roster.assessment.max_score}{' '}
                  points
                  {roster.assessment.due_at
                    ? ` · due ${new Date(roster.assessment.due_at).toLocaleString()}`
                    : ''}
                </p>
              </div>
              <RateBar
                rate={roster.submissions.rate}
                received={roster.submissions.received}
                expected={roster.submissions.expected}
                className="min-w-[10rem]"
              />
            </div>

            <div className="mb-4 grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-lg bg-emerald-50 px-3 py-2">
                <p className="font-semibold text-emerald-800 tabular-nums">
                  {roster.submissions.received}
                </p>
                <p className="text-xs text-emerald-700">Submitted</p>
              </div>
              <div className="rounded-lg bg-amber-50 px-3 py-2">
                <p className="font-semibold text-amber-800 tabular-nums">
                  {roster.submissions.in_progress}
                </p>
                <p className="text-xs text-amber-700">Started</p>
              </div>
              <div className="rounded-lg bg-gray-100 px-3 py-2">
                <p className="font-semibold text-gray-800 tabular-nums">
                  {roster.submissions.not_started}
                </p>
                <p className="text-xs text-gray-600">Not started</p>
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700">Student</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700">Status</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-700">Score</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {roster.students.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-gray-500">
                        No students are enrolled in this subject yet.
                      </td>
                    </tr>
                  ) : (
                    roster.students.map((student) => (
                      <tr key={student.student_id}>
                        <td className="px-3 py-2">
                          <p className="text-gray-900">{student.name}</p>
                          {student.lrn ? (
                            <p className="text-xs text-gray-400">{student.lrn}</p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                              STATUS_CLASS[student.status]
                            }`}
                          >
                            {STATUS_LABEL[student.status]}
                          </span>
                          {student.is_late ? (
                            <span className="ml-1 text-xs font-medium text-rose-600">late</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                          {student.score === null
                            ? '—'
                            : `${student.score}/${student.max_score ?? roster.assessment.max_score}`}
                        </td>
                        <td className="px-3 py-2 text-gray-600">
                          {student.submitted_at
                            ? new Date(student.submitted_at).toLocaleString()
                            : '—'}
                          {student.status === 'submitted' && !student.graded_at ? (
                            <span className="ml-1 text-xs text-amber-600">not yet graded</span>
                          ) : null}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </DialogBody>
    </Dialog>
  )
}
