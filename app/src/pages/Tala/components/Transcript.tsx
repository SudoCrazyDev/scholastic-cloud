import React, { useEffect, useRef } from 'react'
import clsx from 'clsx'
import { AlertCircle, Search, Sparkles } from 'lucide-react'
import { MarkdownLite } from './MarkdownLite'
import { ProposalCard } from './ProposalCard'
import type { ChatEntry, ToolActivity } from '../../../hooks/useTala'
import type { TalaProposal } from '../../../services/talaService'

interface TranscriptProps {
  entries: ChatEntry[]
  tools: ToolActivity[]
  isStreaming: boolean
  teacherName: string
  proposals: TalaProposal[]
  applyingId: string | null
  discardingId: string | null
  onApplyProposal: (id: string) => void
  onDiscardProposal: (id: string) => void
}

const SUGGESTIONS = [
  'What lessons do I have saved for this quarter?',
  'Which of my lessons are still unpublished?',
  'Write five multiple-choice items based on my lesson on fractions.',
  'Help me word a message to a parent about missing homework.',
]

export const Transcript: React.FC<TranscriptProps> = ({
  entries,
  tools,
  isStreaming,
  teacherName,
  proposals,
  applyingId,
  discardingId,
  onApplyProposal,
  onDiscardProposal,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Follow the reply as it streams. Every token moves the bottom, so this runs
  // on content length rather than on entry count alone.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [entries.length, entries[entries.length - 1]?.content, tools.length, proposals.length])

  /*
   * Cards sit under the message that raised them, so an old thread reads in
   * order. Anything that cannot be placed that way goes after the last entry
   * rather than nowhere: this card carries the only approval control there is,
   * and a teacher who cannot see it cannot create the draft.
   *
   * Two ways an anchor fails, and both happen in one ordinary turn:
   *
   *   1. While the turn is running there is no message id at all — the backfill
   *      happens server-side once the assistant message is written.
   *   2. Once it is backfilled, the id names a message this transcript has never
   *      heard of. Entries are built locally as the reply streams, with local
   *      ids, and `syncFrom` deliberately does not re-run afterwards (see
   *      TalaChat) — so the server's id does not appear on screen until the
   *      thread is reopened.
   *
   * Hence membership is tested against the entries actually rendered, not merely
   * against the id being present.
   */
  const entryIds = new Set(entries.map(entry => entry.id))
  const byMessage = new Map<string, TalaProposal[]>()
  const unanchored: TalaProposal[] = []

  for (const proposal of proposals) {
    if (proposal.message_id && entryIds.has(proposal.message_id)) {
      const existing = byMessage.get(proposal.message_id)
      existing ? existing.push(proposal) : byMessage.set(proposal.message_id, [proposal])
    } else {
      unanchored.push(proposal)
    }
  }

  const renderCards = (list: TalaProposal[]) =>
    list.map(proposal => (
      <ProposalCard
        key={proposal.id}
        proposal={proposal}
        applying={applyingId === proposal.id}
        discarding={discardingId === proposal.id}
        onApply={onApplyProposal}
        onDiscard={onDiscardProposal}
      />
    ))

  if (entries.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <div className="mb-4 rounded-2xl bg-zinc-100 p-4">
          <Sparkles className="h-7 w-7 text-zinc-500" />
        </div>
        <h2 className="text-lg font-semibold text-zinc-900">Hi {teacherName}, I'm Tala.</h2>
        <p className="mt-1 max-w-md text-sm text-zinc-600">
          I can help with lesson planning, assessment items, and anything else about the subjects you
          teach. I can read your assigned subjects and the lessons you've saved — not your students'
          records.
        </p>

        <ul className="mt-6 grid w-full max-w-xl gap-2 text-left sm:grid-cols-2">
          {SUGGESTIONS.map(suggestion => (
            <li
              key={suggestion}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600"
            >
              {suggestion}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="space-y-4 px-4 py-6 sm:px-6">
      {entries.map(entry => (
        <React.Fragment key={entry.id}>
          <MessageRow entry={entry} />
          {renderCards(byMessage.get(entry.id) ?? [])}
        </React.Fragment>
      ))}

      {tools.length > 0 && <ToolTrail tools={tools} />}

      {renderCards(unanchored)}

      {isStreaming && entries[entries.length - 1]?.content === '' && <ThinkingDots />}

      <div ref={bottomRef} />
    </div>
  )
}

const MessageRow: React.FC<{ entry: ChatEntry }> = ({ entry }) => {
  if (entry.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-zinc-900 px-4 py-2.5 text-sm whitespace-pre-wrap text-white">
          {entry.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-900">
        <Sparkles className="h-3.5 w-3.5 text-white" />
      </div>

      <div className="min-w-0 flex-1">
        {entry.content && <MarkdownLite content={entry.content} />}

        {entry.error && (
          <div
            className={clsx(
              'flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800',
              entry.content && 'mt-2'
            )}
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{entry.error}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * What Tala looked up while answering.
 *
 * Shown rather than hidden: a teacher should be able to see that the assistant
 * read their teaching load, and see that it read nothing else.
 */
const ToolTrail: React.FC<{ tools: ToolActivity[] }> = ({ tools }) => (
  <div className="flex flex-wrap gap-2 pl-10">
    {tools.map(tool => (
      <span
        key={tool.name}
        className={clsx(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
          tool.status === 'failed'
            ? 'border-amber-200 bg-amber-50 text-amber-700'
            : 'border-zinc-200 bg-zinc-50 text-zinc-600'
        )}
      >
        <Search className={clsx('h-3 w-3', tool.status === 'running' && 'animate-pulse')} />
        {labelFor(tool)}
      </span>
    ))}
  </div>
)

/**
 * What each lookup is called on screen.
 *
 * A tool with no entry still renders — its wire name is a poor label but a
 * missing chip would hide the lookup entirely, and the point of the trail is
 * that the teacher can see what was read.
 */
const TOOL_LABELS: Record<string, { running: string; done: string }> = {
  list_assigned_subjects: {
    running: 'Checking your assigned subjects…',
    done: 'Your assigned subjects',
  },
  list_lessons: {
    running: 'Reading your saved lessons…',
    done: 'Your saved lessons',
  },
  get_lesson: {
    running: 'Opening your lesson…',
    done: 'Your lesson',
  },
  read_lesson_material: {
    running: 'Opening your uploaded files…',
    done: 'Read from your lesson files',
  },
  list_assessments: {
    running: 'Checking your assessments…',
    done: 'Your assessments',
  },
  get_assessment: {
    running: 'Opening your assessment…',
    done: 'Your assessment',
  },
  propose_assessment: {
    running: 'Drafting a suggestion…',
    done: 'Suggested for your approval',
  },
}

function labelFor(tool: ToolActivity): string {
  const label = TOOL_LABELS[tool.name]

  if (!label) {
    return tool.status === 'running' ? `Running ${tool.name}…` : (tool.summary ?? tool.name)
  }

  if (tool.status === 'running') return label.running

  return tool.summary ? `${label.done} — ${tool.summary}` : label.done
}

const ThinkingDots: React.FC = () => (
  <div className="flex gap-3">
    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-900">
      <Sparkles className="h-3.5 w-3.5 text-white" />
    </div>
    <div className="flex items-center gap-1 pt-2">
      {[0, 150, 300].map(delay => (
        <span
          key={delay}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  </div>
)

export default Transcript
