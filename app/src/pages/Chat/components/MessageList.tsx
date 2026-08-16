import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { MessageSquare, Trash2 } from 'lucide-react'
import type { ChatMessage } from '../../../services/chatService'
import { formatDaySeparator, formatMessageTime, schoolDayKey } from '../time'

interface MessageListProps {
  messages: ChatMessage[]
  loading: boolean
  /** Identity of the reader, so their own messages sit on the right. */
  viewer: { type: string; id: string } | null
  /** A teacher of this group may remove anyone's message; anyone may remove their own. */
  isTeacher?: boolean
  onDelete?: (messageId: string) => void
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  loading,
  viewer,
  isTeacher = false,
  onDelete,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const wasAtBottom = useRef(true)

  /*
   * Follow the conversation, but only for someone already at the bottom of it.
   * Yanking the view down while a student is scrolled up reading yesterday's
   * homework is the single most irritating thing a chat window can do.
   */
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight

    wasAtBottom.current = distanceFromBottom < 80
  })

  useEffect(() => {
    if (wasAtBottom.current) {
      bottomRef.current?.scrollIntoView({ block: 'end' })
    }
  }, [messages.length])

  if (loading) {
    return <p className="px-6 py-8 text-sm text-zinc-500">Loading messages…</p>
  }

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <div className="mb-4 rounded-2xl bg-zinc-100 p-4">
          <MessageSquare className="h-7 w-7 text-zinc-500" />
        </div>
        <h2 className="text-lg font-semibold text-zinc-900">No messages yet</h2>
        <p className="mt-1 max-w-sm text-sm text-zinc-600">
          Anything posted here is seen by everyone in the group.
        </p>
      </div>
    )
  }

  let lastDayKey: string | null = null

  return (
    <div ref={containerRef} className="h-full overflow-y-auto px-4 py-4 sm:px-6">
      {messages.map(message => {
        const dayKey = schoolDayKey(message.created_at)
        const showDay = dayKey !== lastDayKey
        lastDayKey = dayKey

        const isMine =
          !!viewer && message.sender_type === viewer.type && message.sender_id === viewer.id

        return (
          <React.Fragment key={message.id}>
            {showDay && (
              <div className="my-4 flex items-center gap-3">
                <span className="h-px flex-1 bg-zinc-200" />
                <span className="text-xs font-medium text-zinc-400">
                  {formatDaySeparator(message.created_at)}
                </span>
                <span className="h-px flex-1 bg-zinc-200" />
              </div>
            )}

            <Bubble
              message={message}
              isMine={isMine}
              canRemove={!message.is_deleted && !!onDelete && (isTeacher || isMine)}
              onDelete={onDelete}
            />
          </React.Fragment>
        )
      })}

      <div ref={bottomRef} />
    </div>
  )
}

const Bubble: React.FC<{
  message: ChatMessage
  isMine: boolean
  canRemove: boolean
  onDelete?: (messageId: string) => void
}> = ({ message, isMine, canRemove, onDelete }) => {
  /*
   * Two clicks, not a browser confirm().
   *
   * Removal is visible to the whole class the instant it happens, so it should
   * not be one stray tap away — but a modal for it would be heavier than the act
   * deserves. The button asks, then does.
   */
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => setConfirming(false), 4000)
    return () => clearTimeout(timer)
  }, [confirming])

  if (message.sender_type === 'system') {
    return (
      <p className="my-2 text-center text-xs text-zinc-400">{message.body}</p>
    )
  }

  return (
    <div
      className={clsx('group mb-2 flex items-center gap-1.5', isMine ? 'justify-end' : 'justify-start')}
    >
      {isMine && canRemove && (
        <RemoveButton
          confirming={confirming}
          onClick={() => (confirming ? onDelete?.(message.id) : setConfirming(true))}
        />
      )}

      <div className={clsx('max-w-[75%] min-w-0', isMine && 'items-end')}>
        {!isMine && (
          <p className="mb-0.5 px-1 text-xs font-medium text-zinc-500">
            {message.sender_name ?? 'Unknown'}
          </p>
        )}

        <div
          className={clsx(
            'rounded-2xl px-3.5 py-2',
            message.is_deleted
              ? 'border border-dashed border-zinc-300 bg-transparent'
              : isMine
                ? 'bg-primary-600 text-white'
                : 'bg-zinc-100 text-zinc-900',
          )}
        >
          {message.is_deleted ? (
            <p className="text-sm italic text-zinc-400">Message removed</p>
          ) : (
            // Messages are plain text and rendered as plain text — whitespace
            // preserved, nothing interpreted. Anything else would let one
            // student post markup into everyone else's screen.
            <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
          )}
        </div>

        <p
          className={clsx(
            'mt-0.5 px-1 text-[11px] text-zinc-400',
            isMine ? 'text-right' : 'text-left',
          )}
        >
          {formatMessageTime(message.created_at)}
          {message.edited_at && ' · edited'}
        </p>
      </div>

      {!isMine && canRemove && (
        <RemoveButton
          confirming={confirming}
          onClick={() => (confirming ? onDelete?.(message.id) : setConfirming(true))}
        />
      )}
    </div>
  )
}

/**
 * Kept out of the way until wanted: invisible until the message is hovered or
 * the button itself is focused, so a transcript does not read as a row of bins.
 * Focus-visible keeps it reachable by keyboard, where there is no hover.
 */
const RemoveButton: React.FC<{ confirming: boolean; onClick: () => void }> = ({
  confirming,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    title={confirming ? 'Click again to remove for everyone' : 'Remove this message'}
    aria-label={confirming ? 'Confirm removing this message' : 'Remove this message'}
    className={clsx(
      'shrink-0 rounded-full p-1.5 transition-opacity focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-red-400',
      confirming
        ? 'bg-red-100 text-red-700 opacity-100'
        : 'text-zinc-400 opacity-0 hover:bg-zinc-100 hover:text-red-600 group-hover:opacity-100',
    )}
  >
    <Trash2 className="h-3.5 w-3.5" />
  </button>
)

export default MessageList
