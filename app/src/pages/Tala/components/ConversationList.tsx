import React from 'react'
import { MessageSquare, Plus, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { Button } from '../../../components/button'
import type { TalaConversationSummary } from '../../../services/talaService'

interface ConversationListProps {
  conversations: TalaConversationSummary[]
  activeId: string | null
  loading: boolean
  onSelect: (id: string) => void
  onCreate: () => void
  onDelete: (conversation: TalaConversationSummary) => void
}

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  activeId,
  loading,
  onSelect,
  onCreate,
  onDelete,
}) => (
  <div className="flex h-full flex-col">
    <div className="p-3">
      <Button fullWidth leftIcon={<Plus className="h-4 w-4" />} onClick={onCreate}>
        New chat
      </Button>
    </div>

    <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
      {loading && <p className="px-2 py-4 text-sm text-zinc-500">Loading…</p>}

      {!loading && conversations.length === 0 && (
        <p className="px-2 py-4 text-sm text-zinc-500">
          No conversations yet. Start one and it will appear here.
        </p>
      )}

      {conversations.map(conversation => (
        <div
          key={conversation.id}
          className={clsx(
            'group flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors',
            conversation.id === activeId ? 'bg-zinc-200 text-zinc-900' : 'text-zinc-700 hover:bg-zinc-100'
          )}
        >
          <button
            type="button"
            onClick={() => onSelect(conversation.id)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <MessageSquare className="h-4 w-4 shrink-0 text-zinc-400" />
            <span className="truncate">{conversation.title || 'New conversation'}</span>
          </button>

          <button
            type="button"
            onClick={() => onDelete(conversation)}
            aria-label={`Delete ${conversation.title || 'conversation'}`}
            // Kept reachable by keyboard rather than hover-only, so the button
            // is not invisible to anyone tabbing through the list.
            className="shrink-0 rounded p-1 text-zinc-400 opacity-0 transition hover:bg-zinc-200 hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  </div>
)

export default ConversationList
