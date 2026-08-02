import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, KeyRound, Loader2, Settings2, Sparkles, Users } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import {
  useTalaChat,
  useTalaConfig,
  useTalaConversation,
  useTalaConversationMutations,
  useTalaConversations,
  useTalaProposalMutations,
  useTalaProposals,
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

  const proposals = useTalaProposals(activeId)
  const { apply, discard } = useTalaProposalMutations(activeId)
  const [applyError, setApplyError] = useState<string | null>(null)

  const { syncFrom, reset } = chat

  /*
   * The server's list is the authority on status — it knows what has been
   * applied — but a card raised during the current turn only exists in stream
   * state until the turn settles. Merged by id, server wins.
   */
  const visibleProposals = useMemo(() => {
    const merged = new Map<string, (typeof chat.streamedProposals)[number]>()
    for (const proposal of chat.streamedProposals) merged.set(proposal.id, proposal)
    for (const proposal of proposals.data ?? []) merged.set(proposal.id, proposal)
    return Array.from(merged.values())
  }, [chat.streamedProposals, proposals.data])

  const handleApply = async (id: string) => {
    setApplyError(null)
    try {
      await apply.mutateAsync(id)
    } catch (error: any) {
      // A 409 means the suggestion no longer matches the database — a student
      // submitted, or it was applied elsewhere. The server writes that message
      // for the teacher, so show it rather than a generic failure.
      setApplyError(
        error?.response?.data?.message ?? 'That could not be applied. Nothing was changed.'
      )
    }
  }

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

  /*
   * Two different reasons the composer might be missing, and they need different
   * words on screen. `ready` is about the school: no key is set, so Tala cannot
   * answer anyone. `canChat` is about this person: administrators reach this
   * screen through `tala.configure` to set the key and hand out access, without
   * necessarily holding access themselves.
   */
  const canConfigure = config.data?.can_configure_institution ?? false
  const canChat = config.data?.can_chat ?? false
  const ready = (config.data?.ready ?? false) && canChat
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
                  ? `${config.data?.active_model} · school's key`
                  : canChat
                    ? 'No API key configured'
                    : 'Administration only'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {config.data?.usage.limit != null && (
              <span className="hidden text-xs text-zinc-500 sm:inline">
                {config.data.usage.remaining} of {config.data.usage.limit} messages left this month
              </span>
            )}

            {/* Teachers have nothing to set up any more, so they get no button. */}
            {canConfigure && (
              <Button
                variant="outline"
                color="secondary"
                size="sm"
                leftIcon={<Settings2 className="h-4 w-4" />}
                onClick={() => setSettingsOpen(true)}
              >
                Settings
              </Button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {ready ? (
            <Transcript
              entries={chat.entries}
              tools={chat.tools}
              isStreaming={chat.isStreaming}
              teacherName={teacherName}
              proposals={visibleProposals}
              applyingId={apply.isPending ? (apply.variables ?? null) : null}
              discardingId={discard.isPending ? (discard.variables ?? null) : null}
              onApplyProposal={handleApply}
              onDiscardProposal={id => {
                setApplyError(null)
                discard.mutate(id)
              }}
            />
          ) : canChat ? (
            <NoKeyState canConfigureSchool={canConfigure} onOpenSettings={() => setSettingsOpen(true)} />
          ) : (
            <NoAccessState canConfigure={canConfigure} onOpenSettings={() => setSettingsOpen(true)} />
          )}
        </div>

        {applyError && (
          <div className="flex items-start gap-2 border-t border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 sm:px-6">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{applyError}</span>
            <button
              type="button"
              onClick={() => setApplyError(null)}
              className="shrink-0 font-medium underline underline-offset-2"
            >
              Dismiss
            </button>
          </div>
        )}

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

        {/*
          * Hidden outright rather than disabled for someone without access: a
          * greyed-out box invites them to work out how to un-grey it, and the
          * answer is "ask an administrator", which the panel above already says.
          */}
        {canChat && (
          <Composer
            disabled={!ready}
            isStreaming={chat.isStreaming}
            placeholder={
              ready
                ? 'Ask Tala about your subjects, lessons or assessments…'
                : 'Waiting for the school to add an API key'
            }
            onSend={handleSend}
            onStop={chat.stop}
          />
        )}
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
        ? 'Set the school key and Tala can start answering the teachers you have given access to.'
        : 'Your school has not set one up yet. Ask an administrator to add the school key — there is nothing for you to configure.'}
    </p>
    {canConfigureSchool && (
      <Button className="mt-5" leftIcon={<KeyRound className="h-4 w-4" />} onClick={onOpenSettings}>
        Add an API key
      </Button>
    )}
  </div>
)

/**
 * For an administrator who can set Tala up but has not given themselves access.
 *
 * Reachable rather than hidden on purpose: `tala.configure` carries the right to
 * open this screen precisely so the key and the access list can be reached, and
 * an administrator should not have to grant themselves a teacher's seat to
 * administer the thing.
 */
const NoAccessState: React.FC<{ canConfigure: boolean; onOpenSettings: () => void }> = ({
  canConfigure,
  onOpenSettings,
}) => (
  <div className="flex h-full flex-col items-center justify-center px-6 text-center">
    <div className="mb-4 rounded-2xl bg-zinc-100 p-4">
      <Users className="h-7 w-7 text-zinc-500" />
    </div>
    <h2 className="text-lg font-semibold text-zinc-900">
      {canConfigure ? 'You administer Tala but do not use it' : 'Tala is not switched on for you'}
    </h2>
    <p className="mt-1 max-w-md text-sm text-zinc-600">
      {canConfigure
        ? 'You can set the school key and choose which teachers may use Tala. To chat with it yourself, give yourself access on the same screen.'
        : 'Access is given teacher by teacher. Ask an administrator at your school to switch Tala on for you.'}
    </p>
    {canConfigure && (
      <Button className="mt-5" leftIcon={<Settings2 className="h-4 w-4" />} onClick={onOpenSettings}>
        Open Tala settings
      </Button>
    )}
  </div>
)

export default TalaChat
