import React, { useState } from 'react'
import clsx from 'clsx'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  FilePlus2,
  Loader2,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  X,
} from 'lucide-react'
import { Button } from '../../../components/button'
import type { TalaProposal, TalaProposalAction, TalaProposalWarning } from '../../../services/talaService'

/**
 * A change to an assessment that Tala has drafted, waiting for the teacher.
 *
 * This card is the approval gate, not a preview of something already done. Tala
 * has no write access to the gradebook: it produces a proposal, and the Apply
 * button here is the request that changes anything. Nothing on screen has
 * happened until it is pressed.
 *
 * Which is why the card is deliberately not a summary. A teacher approving a
 * quiz is taking responsibility for every question and every answer key in it,
 * so the questions are all here, with their keys, before the button.
 */

interface ProposalCardProps {
  proposal: TalaProposal
  applying: boolean
  discarding: boolean
  onApply: (id: string) => void
  onDiscard: (id: string) => void
}

const ACTION_META: Record<
  TalaProposalAction,
  { label: string; verb: string; icon: React.ComponentType<{ className?: string }>; danger: boolean }
> = {
  create: { label: 'New assessment', verb: 'Create draft', icon: FilePlus2, danger: false },
  update: { label: 'Change assessment', verb: 'Apply changes', icon: Pencil, danger: false },
  delete: { label: 'Delete assessment', verb: 'Delete it', icon: Trash2, danger: true },
  publish: { label: 'Publish assessment', verb: 'Publish it', icon: Eye, danger: false },
  unpublish: { label: 'Unpublish assessment', verb: 'Back to draft', icon: EyeOff, danger: false },
}

export const ProposalCard: React.FC<ProposalCardProps> = ({
  proposal,
  applying,
  discarding,
  onApply,
  onDiscard,
}) => {
  const meta = ACTION_META[proposal.action] ?? ACTION_META.update
  const Icon = meta.icon

  const questions = proposal.preview.questions ?? []
  // Long question sets collapse, but only past the point where the card stops
  // being readable — the default has to be "you can see what you are approving".
  const [expanded, setExpanded] = useState(questions.length <= 10)

  const pending = proposal.status === 'pending'
  const busy = applying || discarding
  const hasDanger = proposal.warnings.some(warning => warning.level === 'danger')

  return (
    <div className="pl-10">
      <div
        className={clsx(
          'overflow-hidden rounded-xl border bg-white',
          pending && hasDanger ? 'border-red-300' : pending ? 'border-zinc-300' : 'border-zinc-200'
        )}
      >
        <div className="flex items-start gap-2.5 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5">
          <Icon className={clsx('mt-0.5 h-4 w-4 shrink-0', meta.danger ? 'text-red-600' : 'text-zinc-500')} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {meta.label}
              {pending && ' · needs your approval'}
            </p>
            <p className="truncate text-sm font-medium text-zinc-900">
              {proposal.title ?? 'Untitled'}
            </p>
          </div>
          <StatusBadge status={proposal.status} />
        </div>

        <div className="space-y-3 px-4 py-3">
          <Facts facts={proposal.preview.assessment} />

          {proposal.preview.changes && <Changes changes={proposal.preview.changes} />}

          {proposal.warnings.length > 0 && <Warnings warnings={proposal.warnings} />}

          {questions.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setExpanded(value => !value)}
                className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-zinc-600 hover:text-zinc-900"
              >
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {questions.length} question{questions.length === 1 ? '' : 's'}
                {proposal.preview.replaces
                  ? `, replacing the current ${proposal.preview.replaces.length}`
                  : ''}
              </button>

              {expanded && (
                <ol className="space-y-2.5">
                  {questions.map(question => (
                    <li key={question.number} className="rounded-lg bg-zinc-50 px-3 py-2">
                      <p className="text-sm text-zinc-900">
                        <span className="mr-1.5 font-medium text-zinc-500">{question.number}.</span>
                        {question.question}
                      </p>

                      {question.choices && (
                        <ul className="mt-1.5 space-y-0.5">
                          {question.choices.map(choice => (
                            <li key={choice} className="text-xs text-zinc-600">
                              {choice}
                            </li>
                          ))}
                        </ul>
                      )}

                      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 text-xs">
                        {question.answer && (
                          <span className="text-emerald-700">
                            <span className="text-zinc-500">Answer:</span> {question.answer}
                          </span>
                        )}
                        <span className="text-zinc-500">
                          {question.points ?? 1} point{(question.points ?? 1) === 1 ? '' : 's'}
                        </span>
                        <span className="text-zinc-400">{labelForQuestionType(question.type)}</span>
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {proposal.status === 'failed' && proposal.failure_reason && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {proposal.failure_reason}
            </p>
          )}
        </div>

        {pending && (
          <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-2.5">
            <Button
              size="sm"
              color={meta.danger ? 'danger' : 'primary'}
              disabled={busy}
              leftIcon={
                applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />
              }
              onClick={() => onApply(proposal.id)}
            >
              {meta.verb}
            </Button>
            <Button
              size="sm"
              variant="outline"
              color="secondary"
              disabled={busy}
              leftIcon={
                discarding ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />
              }
              onClick={() => onDiscard(proposal.id)}
            >
              Discard
            </Button>
            {proposal.action === 'create' && (
              <span className="text-xs text-zinc-500">
                Saved as a draft — students won't see it until you publish.
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const StatusBadge: React.FC<{ status: TalaProposal['status'] }> = ({ status }) => {
  if (status === 'pending') return null

  const styles: Record<string, string> = {
    applied: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    discarded: 'bg-zinc-100 text-zinc-500 border-zinc-200',
    failed: 'bg-amber-50 text-amber-800 border-amber-200',
  }

  const labels: Record<string, string> = {
    applied: 'Applied',
    discarded: 'Discarded',
    failed: 'Not applied',
  }

  return (
    <span
      className={clsx(
        'shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium',
        styles[status] ?? styles.discarded
      )}
    >
      {labels[status] ?? status}
    </span>
  )
}

const Facts: React.FC<{ facts?: Record<string, string | number | null> }> = ({ facts }) => {
  if (!facts) return null

  const shown = FACT_ORDER.filter(key => facts[key] !== undefined && facts[key] !== null)

  if (shown.length === 0) return null

  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {shown.map(key => (
        <div key={key} className="flex gap-1">
          <dt className="text-zinc-500">{FACT_LABELS[key]}:</dt>
          <dd className="font-medium text-zinc-800">{String(facts[key])}</dd>
        </div>
      ))}
    </dl>
  )
}

const FACT_ORDER = [
  'type',
  'subject',
  'section',
  'grading_period',
  'component',
  'status',
  'questions',
  'total_points',
  'student_attempts',
]

const FACT_LABELS: Record<string, string> = {
  type: 'Kind',
  subject: 'Subject',
  section: 'Section',
  grading_period: 'Period',
  component: 'Counts under',
  status: 'Status',
  questions: 'Questions',
  total_points: 'Total points',
  student_attempts: 'Submissions',
}

const Changes: React.FC<{
  changes: Record<string, { from?: string | number | null; to?: string | number | null }>
}> = ({ changes }) => {
  const entries = Object.entries(changes)

  if (entries.length === 0) return null

  return (
    <ul className="space-y-1 rounded-lg bg-zinc-50 px-3 py-2 text-xs">
      {entries.map(([key, change]) => (
        <li key={key} className="text-zinc-700">
          <span className="text-zinc-500">{FACT_LABELS[key] ?? key}:</span>{' '}
          {change.from !== undefined && change.from !== null && (
            <>
              <span className="line-through text-zinc-400">{String(change.from)}</span>{' '}
              <span className="text-zinc-400">→</span>{' '}
            </>
          )}
          <span className="font-medium">{String(change.to ?? '—')}</span>
        </li>
      ))}
    </ul>
  )
}

const Warnings: React.FC<{ warnings: TalaProposalWarning[] }> = ({ warnings }) => (
  <ul className="space-y-1.5">
    {warnings.map(warning => (
      <li
        key={warning.message}
        className={clsx(
          'flex items-start gap-2 rounded-lg px-3 py-2 text-xs',
          warning.level === 'danger'
            ? 'bg-red-50 text-red-900'
            : warning.level === 'warning'
              ? 'bg-amber-50 text-amber-900'
              : 'bg-zinc-50 text-zinc-700'
        )}
      >
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{warning.message}</span>
      </li>
    ))}
  </ul>
)

const QUESTION_TYPE_LABELS: Record<string, string> = {
  single_choice: 'Multiple choice',
  multiple_choice: 'Multiple choice · several answers',
  true_false: 'True or false',
  short_answer: 'Short answer',
  essay: 'Essay',
}

function labelForQuestionType(type: string): string {
  return QUESTION_TYPE_LABELS[type] ?? type.replace(/_/g, ' ')
}
