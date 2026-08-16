import React from 'react'
import clsx from 'clsx'
import { Archive, GraduationCap, Lock, Users } from 'lucide-react'
import type { ChatConversationSummary } from '../../../services/chatService'
import { formatListTime } from '../time'

interface GroupListProps {
  conversations: ChatConversationSummary[]
  activeId: string | null
  loading: boolean
  onSelect: (id: string) => void
}

export const GroupList: React.FC<GroupListProps> = ({
  conversations,
  activeId,
  loading,
  onSelect,
}) => {
  const active = conversations.filter(conversation => !conversation.archived)
  const archived = conversations.filter(conversation => conversation.archived)

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-900">Groups</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Your advisory and the subjects you take part in
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {loading && <p className="px-2 py-4 text-sm text-zinc-500">Loading…</p>}

        {!loading && conversations.length === 0 && (
          <p className="px-2 py-4 text-sm text-zinc-500">
            No groups yet. One appears for your advisory section and for each subject once a teacher
            is assigned to it.
          </p>
        )}

        {active.map(conversation => (
          <GroupRow
            key={conversation.id}
            conversation={conversation}
            isActive={conversation.id === activeId}
            onSelect={onSelect}
          />
        ))}

        {archived.length > 0 && (
          <>
            <p className="mt-4 flex items-center gap-1.5 px-3 pb-1 text-xs font-medium text-zinc-400">
              <Archive className="h-3 w-3" />
              Past groups
            </p>
            {archived.map(conversation => (
              <GroupRow
                key={conversation.id}
                conversation={conversation}
                isActive={conversation.id === activeId}
                onSelect={onSelect}
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

const GroupRow: React.FC<{
  conversation: ChatConversationSummary
  isActive: boolean
  onSelect: (id: string) => void
}> = ({ conversation, isActive, onSelect }) => {
  const Icon = conversation.type === 'advisory' ? Users : GraduationCap
  const hasUnread = conversation.unread_count > 0

  return (
    <button
      type="button"
      onClick={() => onSelect(conversation.id)}
      className={clsx(
        'mb-0.5 flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors',
        isActive ? 'bg-zinc-200' : 'hover:bg-zinc-100',
        conversation.archived && 'opacity-60',
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span
            className={clsx(
              'flex-1 truncate text-sm',
              hasUnread ? 'font-semibold text-zinc-900' : 'font-medium text-zinc-800',
            )}
          >
            {conversation.title}
          </span>
          {conversation.last_message_at && (
            <span className="shrink-0 text-[11px] text-zinc-400">
              {formatListTime(conversation.last_message_at)}
            </span>
          )}
        </span>

        {conversation.subtitle && (
          <span className="mt-0.5 block truncate text-xs text-zinc-500">
            {conversation.subtitle}
          </span>
        )}

        <span className="mt-1 flex items-center gap-1.5">
          <span
            className={clsx(
              'flex-1 truncate text-xs',
              hasUnread ? 'text-zinc-700' : 'text-zinc-500',
            )}
          >
            {conversation.last_message
              ? `${conversation.last_message.sender_name ?? 'Someone'}: ${conversation.last_message.preview}`
              : 'No messages yet'}
          </span>

          {conversation.locked && <Lock className="h-3 w-3 shrink-0 text-zinc-400" />}

          {hasUnread && (
            <span className="shrink-0 rounded-full bg-primary-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
              {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
            </span>
          )}
        </span>
      </span>
    </button>
  )
}

export default GroupList
