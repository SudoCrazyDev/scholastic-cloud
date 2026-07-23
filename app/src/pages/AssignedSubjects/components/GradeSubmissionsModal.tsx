import React, { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  XMarkIcon,
  CheckCircleIcon,
  ClockIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  CheckBadgeIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import { Button } from '@/components/button'
import { Badge } from '@/components/badge'
import {
  assessmentGradingService,
  type AssessmentSubmission,
  type GradingQuestionMeta,
  type SubmittedAnswer,
} from '@/services/assessmentGradingService'
import { QuestionPromptView } from './QuestionPromptView'

interface GradeSubmissionsModalProps {
  itemId: string
  title: string
  onClose: () => void
}

// Manual-score draft/payload key: stable question id (v2) or the question index (v1).
const gradeKey = (q: { id?: string | null; index: number }): string => q.id ?? String(q.index)

const isUploadAnswer = (
  value: unknown
): value is { path: string; url: string | null; name: string; mime: string; size: number } =>
  !!value && typeof value === 'object' && !Array.isArray(value) && 'path' in (value as Record<string, unknown>)

const formatDateTime = (value: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

const AnswerView: React.FC<{ question: GradingQuestionMeta; answer: SubmittedAnswer }> = ({
  question,
  answer,
}) => {
  // Image answers may hold several uploads; legacy answers are a single upload object.
  const uploadList = isUploadAnswer(answer)
    ? [answer]
    : Array.isArray(answer) && answer.length > 0 && answer.every(isUploadAnswer)
      ? answer
      : null
  if (uploadList) {
    return (
      <div className="space-y-3">
        {uploadList.map((upload, idx) => (
          <div key={idx} className="space-y-2">
            {question.type === 'image_upload' && upload.url && (
              <img src={upload.url} alt={upload.name} className="max-h-80 rounded-lg border border-gray-200 object-contain" />
            )}
            {question.type === 'video_upload' && upload.url && (
              <video src={upload.url} controls className="max-h-80 w-full rounded-lg border border-gray-200" />
            )}
            <a
              href={upload.url ?? '#'}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              {upload.name}
            </a>
          </div>
        ))}
      </div>
    )
  }

  if (Array.isArray(answer)) {
    if (answer.length === 0) return <span className="text-sm italic text-gray-400">No answer</span>
    return (
      <div className="flex flex-wrap gap-1.5">
        {answer.map((value, idx) => {
          const text = typeof value === 'string' ? value : value.name
          return (
            <span key={idx} className="rounded-md bg-gray-100 px-2 py-1 text-sm text-gray-700">
              {text || <span className="italic text-gray-400">blank</span>}
            </span>
          )
        })}
      </div>
    )
  }

  if (typeof answer === 'string' && answer.trim() !== '') {
    return <p className="whitespace-pre-wrap text-sm text-gray-800">{answer}</p>
  }

  return <span className="text-sm italic text-gray-400">No answer</span>
}

export const GradeSubmissionsModal: React.FC<GradeSubmissionsModalProps> = ({ itemId, title, onClose }) => {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [scoreDraft, setScoreDraft] = useState<Record<string, string>>({})

  const { data, isLoading } = useQuery({
    queryKey: ['assessment-submissions', itemId],
    queryFn: () => assessmentGradingService.listSubmissions(itemId),
  })

  const assessment = data?.data.assessment
  const submissions = data?.data.submissions ?? []
  const progress = data?.data.progress
  const questionsByIndex = useMemo(() => {
    const map = new Map<number, GradingQuestionMeta>()
    assessment?.questions.forEach((q) => map.set(q.index, q))
    return map
  }, [assessment])

  const selected = submissions.find((s) => s.attempt_id === selectedId) ?? submissions[0] ?? null
  const manualQuestions = assessment?.questions.filter((q) => q.manual) ?? []

  const selectSubmission = (submission: AssessmentSubmission) => {
    setSelectedId(submission.attempt_id)
    const draft: Record<string, string> = {}
    submission.per_question.forEach((pq) => {
      if (pq.manual) draft[gradeKey(pq)] = pq.awarded === null ? '' : String(pq.awarded)
    })
    setScoreDraft(draft)
  }

  // Initialize the draft for the default-selected submission.
  React.useEffect(() => {
    if (selected && selectedId === null) selectSubmission(selected)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.attempt_id])

  const recheckMutation = useMutation({
    mutationFn: () => assessmentGradingService.recheck(itemId),
    onSuccess: (res) => {
      const { updated, total } = res.data
      toast.success(
        updated === 0
          ? `All ${total} submission score(s) are already up to date.`
          : `Re-checked ${total} submission(s); ${updated} score(s) updated.`
      )
      queryClient.invalidateQueries({ queryKey: ['assessment-submissions', itemId] })
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message ?? 'Failed to re-check scores.')
    },
  })

  const gradeMutation = useMutation({
    mutationFn: (payload: { attemptId: string; manualScores: Record<string, number | null> }) =>
      assessmentGradingService.grade(itemId, payload.attemptId, payload.manualScores),
    onSuccess: () => {
      toast.success('Grade saved.')
      queryClient.invalidateQueries({ queryKey: ['assessment-submissions', itemId] })
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message ?? 'Failed to save grade.')
    },
  })

  const handleSave = () => {
    if (!selected) return
    const manualScores: Record<string, number | null> = {}
    for (const q of manualQuestions) {
      const key = gradeKey(q)
      const raw = scoreDraft[key]
      if (raw === undefined || raw === '') {
        manualScores[key] = null
        continue
      }
      const num = Number(raw)
      if (Number.isNaN(num) || num < 0) {
        toast.error(`Question ${q.index + 1}: enter a score between 0 and ${q.points}.`)
        return
      }
      if (num > q.points) {
        toast.error(`Question ${q.index + 1}: max is ${q.points} point(s).`)
        return
      }
      manualScores[key] = num
    }
    gradeMutation.mutate({ attemptId: selected.attempt_id, manualScores })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50">
      <div className="absolute inset-0 flex flex-col bg-white">
        <header className="flex items-center justify-between gap-3 border-b border-gray-200 bg-gradient-to-r from-indigo-50 via-white to-white px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-900">Submissions &amp; Grading</h3>
              {progress && (
                <Badge color={progress.submitted >= progress.total_students && progress.total_students > 0 ? 'green' : 'blue'}>
                  <UserGroupIcon className="h-3.5 w-3.5" />
                  {progress.submitted}/{progress.total_students} submitted
                </Badge>
              )}
            </div>
            <p className="text-sm text-gray-500">{title}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => recheckMutation.mutate()}
              disabled={recheckMutation.isPending || isLoading || submissions.length === 0}
              title="Re-grade every submission against the current answer key and update stored scores"
            >
              <ArrowPathIcon className={clsx('h-4 w-4', recheckMutation.isPending && 'animate-spin')} />
              {recheckMutation.isPending ? 'Re-checking…' : 'Re-check scores'}
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
              title="Close"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </header>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-indigo-600" />
          </div>
        ) : submissions.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center text-gray-500">
            <CheckCircleIcon className="mb-3 h-10 w-10 text-gray-300" />
            <p className="font-medium text-gray-700">No submissions yet</p>
            <p className="text-sm">Student submissions will appear here once they finish the assessment.</p>
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {/* Submission list */}
            <aside className="w-72 shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50">
              <ul className="divide-y divide-gray-100">
                {submissions.map((submission) => {
                  const active = selected?.attempt_id === submission.attempt_id
                  return (
                    <li key={submission.attempt_id}>
                      <button
                        type="button"
                        onClick={() => selectSubmission(submission)}
                        className={clsx(
                          'flex w-full flex-col gap-1 px-4 py-3 text-left transition',
                          active ? 'bg-white shadow-inner' : 'hover:bg-white/70'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-gray-900">
                            {submission.student.name}
                          </span>
                          {submission.is_fully_graded ? (
                            <Badge color="green">
                              <CheckBadgeIcon className="h-3.5 w-3.5" />
                              Graded
                            </Badge>
                          ) : (
                            <Badge color="amber">
                              <ClockIcon className="h-3.5 w-3.5" />
                              Pending
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-gray-500">
                          {submission.total_score} / {submission.max_score} pts
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </aside>

            {/* Detail / grading */}
            <section className="flex-1 overflow-y-auto p-6">
              {selected && (
                <div className="mx-auto max-w-3xl space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4">
                    <div>
                      <p className="font-semibold text-gray-900">{selected.student.name}</p>
                      <p className="text-xs text-gray-500">
                        Submitted {formatDateTime(selected.submitted_at)}
                        {selected.graded_at && ` · Graded ${formatDateTime(selected.graded_at)}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-indigo-600">
                        {selected.total_score}
                        <span className="text-base font-medium text-gray-400"> / {selected.max_score}</span>
                      </p>
                      <p className="text-xs text-gray-500">
                        Auto {selected.objective_score} · Manual {selected.manual_total}
                      </p>
                    </div>
                  </div>

                  {selected.per_question.map((pq) => {
                    const question = questionsByIndex.get(pq.index)
                    if (!question) return null
                    return (
                      <div key={pq.index} className="rounded-xl border border-gray-200 bg-white p-4">
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2 font-medium text-gray-900">
                            <span className="text-gray-400">{pq.index + 1}.</span>
                            {question.question ? (
                              <QuestionPromptView prompt={question.question} className="min-w-0 flex-1" />
                            ) : (
                              <span className="italic text-gray-400">Untitled question</span>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {!pq.manual && pq.auto_correct !== null && (
                              <Badge color={pq.auto_correct ? 'green' : 'red'}>
                                {pq.auto_correct ? 'Correct' : 'Incorrect'}
                              </Badge>
                            )}
                            {pq.manual && <Badge color="blue">Manual</Badge>}
                          </div>
                        </div>

                        <div className="mb-3 rounded-lg bg-gray-50 p-3">
                          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">
                            Student answer
                          </p>
                          <AnswerView question={question} answer={pq.answer} />
                        </div>

                        {pq.manual ? (
                          <div className="flex items-center gap-2">
                            <label className="text-sm font-medium text-gray-600">Award</label>
                            <input
                              type="number"
                              min={0}
                              max={question.points}
                              step="0.5"
                              value={scoreDraft[gradeKey(pq)] ?? ''}
                              onChange={(e) =>
                                setScoreDraft((prev) => ({ ...prev, [gradeKey(pq)]: e.target.value }))
                              }
                              className="w-24 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              placeholder="0"
                            />
                            <span className="text-sm text-gray-500">/ {question.points} pts</span>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500">
                            Auto-graded: {pq.awarded} / {question.points} pts
                          </p>
                        )}
                      </div>
                    )
                  })}

                  {manualQuestions.length === 0 ? (
                    <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">
                      This assessment has no manually-graded questions — all scores are computed automatically.
                    </p>
                  ) : (
                    <div className="sticky bottom-0 flex justify-end gap-2 border-t border-gray-100 bg-white py-3">
                      <Button variant="outline" onClick={onClose}>
                        Close
                      </Button>
                      <Button onClick={handleSave} disabled={gradeMutation.isPending}>
                        {gradeMutation.isPending ? 'Saving…' : 'Save grade'}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

export default GradeSubmissionsModal
