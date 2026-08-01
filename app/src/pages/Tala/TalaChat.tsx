import React, { useEffect, useRef, useState } from 'react'
import { AlertTriangle, KeyRound, Loader2, Settings2, Sparkles } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import {
  useTalaChat,
  useTalaConfig,
  useTalaConversation,
  useTalaConversationMutations,
  useTalaConversations,
} from '../../hooks/useTala'
import { Button } from '../../components/button'
import { ConfirmationModal } from '../../components/ConfirmationModal'
import { ConversationList } from './components/ConversationList'
import { Transcript } from './components/Transcript'
import { Composer } from './components/Composer'
import { TalaSettingsDialog } from './components/TalaSettingsDialog'
import type { TalaConversationSummary } from '../../services/talaService'

/**
 * Tala — the chat screen.
 *
 * The transcript is local state driven by useTalaChat, not the query cache: it
 * changes on every streamed token, and a cache write per token would re-render
 * the conversation list and the sidebar along with it.
 */
const TalaChat: React.FC = () => {
  const { user } = useAuth()

  const config = useTalaConfig()
  const conversations = useTalaConversations()
  const { create, remove } = useTalaConversationMutations()

  const [activeId, setActiveId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<TalaConversationSummary | null>(null)

  const detail = useTalaConversation(activeId)
  const chat = useTalaChat(activeId)

  const { syncFrom, reset } = chat

  /*
   * The thread whose server copy has already been loaded into the transcript.
   *
   * Syncing is once-per-thread rather than on every change to `detail.data`:
   * the transcript is rebuilt locally as the reply streams, and a second sync
   * landing mid-answer would replace what is on screen with the server's
   * not-yet-written version of it.
   */
  const syncedId = useRef<string | null>(null)

  // Open the most recent thread on arrival so the screen is not empty for
  // someone coming back to work they left half-finished.
  useEffect(() => {
    if (!activeId && conversations.data && conversations.data.length > 0) {
      setActiveId(conversations.data[0].id)
    }
  }, [activeId, conversations.data])

  useEffect(() => {
    if (!detail.data) return
    if (syncedId.current === detail.data.conversation.id) return

    syncedId.current = detail.data.conversation.id
    syncFrom(detail.data.messages)
  }, [detail.data, syncFrom])

  const openThread = (id: string, alreadyEmpty = false) => {
    // A thread created a moment ago is empty by construction, so mark it
    // synced — otherwise its (empty) fetch can land after the first reply has
    // started streaming and wipe it.
    syncedId.current = alreadyEmpty ? id : null
    setActiveId(id)
  }

  const startNewChat = async () => {
    const conversation = await create.mutateAsync()
    reset()
    openThread(conversation.id, true)
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return

    await remove.mutateAsync(pendingDelete.id)

    if (pendingDelete.id === activeId) {
      reset()
      syncedId.current = null
      setActiveId(null)
    }

    setPendingDelete(null)
  }

  const handleSend = async (text: string) => {
    // Sending from the empty state should not make the teacher press "New chat"
    // first — create the thread on the way through and send straight into it.
    if (!activeId) {
      const conversation = await create.mutateAsync()
      openThread(conversation.id, true)
      chat.send(text, conversation.id)
      return
    }

    chat.send(text)
  }

  if (config.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    )
  }

  const ready = config.data?.ready ?? false
  const teacherName = user?.first_name || 'there'

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <aside className="hidden w-64 shrink-0 border-r border-zinc-200 bg-zinc-50 md:block">
        <ConversationList
          conversations={conversations.data ?? []}
          activeId={activeId}
          loading={conversations.isLoading}
          onSelect={id => {
            reset()
            openThread(id)
          }}
          onCreate={startNewChat}
          onDelete={setPendingDelete}
        />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-900">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-zinc-900">Tala</p>
              <p className="truncate text-xs text-zinc-500">
                {ready
                  ? `${config.data?.active_model} · ${
                      config.data?.active_source === 'institution' ? "school's key" : 'your key'
                    }`
                  : 'No API key configured'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {config.data?.usage.limit != null && (
              <span className="hidden text-xs text-zinc-500 sm:inline">
                {config.data.usage.remaining} of {config.data.usage.limit} messages left this month
              </span>
            )}

            <Button
              variant="outline"
              color="secondary"
              size="sm"
              leftIcon={<Settings2 className="h-4 w-4" />}
              onClick={() => setSettingsOpen(true)}
            >
              Settings
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {ready ? (
            <Transcript
              entries={chat.entries}
              tools={chat.tools}
              isStreaming={chat.isStreaming}
              teacherName={teacherName}
            />
          ) : (
            <NoKeyState
              canConfigureSchool={config.data?.can_configure_institution ?? false}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          )}
        </div>

        {chat.blockedReason && (
          <div className="flex items-start gap-2 border-t border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 sm:px-6">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{chat.blockedReason.message}</span>
            {chat.blockedReason.code === 'no_credential' && (
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="shrink-0 font-medium underline underline-offset-2"
              >
                Open settings
              </button>
            )}
          </div>
        )}

        <Composer
          disabled={!ready}
          isStreaming={chat.isStreaming}
          placeholder={ready ? 'Ask Tala about your subjects, lessons or assessments…' : 'Add an API key to start chatting'}
          onSend={handleSend}
          onStop={chat.stop}
        />
      </main>

      {config.data && (
        <TalaSettingsDialog
          open={settingsOpen}
          config={config.data}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      <ConfirmationModal
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title="Delete conversation"
        message={`"${pendingDelete?.title || 'This conversation'}" and everything in it will be deleted. This cannot be undone.`}
        confirmText="Delete"
        variant="danger"
      />
    </div>
  )
}

const NoKeyState: React.FC<{ canConfigureSchool: boolean; onOpenSettings: () => void }> = ({
  canConfigureSchool,
  onOpenSettings,
}) => (
  <div className="flex h-full flex-col items-center justify-center px-6 text-center">
    <div className="mb-4 rounded-2xl bg-zinc-100 p-4">
      <KeyRound className="h-7 w-7 text-zinc-500" />
    </div>
    <h2 className="text-lg font-semibold text-zinc-900">Tala needs an API key</h2>
    <p className="mt-1 max-w-md text-sm text-zinc-600">
      {canConfigureSchool
        ? 'Set a school key so every teacher can use Tala, or add one of your own to try it out first.'
        : 'Your school has not set one up yet. Ask an administrator to add a school key, or add your own to get started.'}
    </p>
    <Button className="mt-5" leftIcon={<KeyRound className="h-4 w-4" />} onClick={onOpenSettings}>
      Add an API key
    </Button>
  </div>
)

export default TalaChat
