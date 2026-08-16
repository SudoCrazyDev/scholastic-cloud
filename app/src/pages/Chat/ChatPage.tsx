import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { Lock, MessageSquare, Unlock } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { usePermissions } from '../../hooks/usePermissions'
import {
  useChatConversations,
  useChatMessages,
  useChatSync,
  useDeleteMessage,
  useMarkRead,
  useSendMessage,
  useSetLocked,
} from '../../hooks/useChat'
import { GroupList } from './components/GroupList'
import { MessageList } from './components/MessageList'
import { MessageComposer } from './components/MessageComposer'
import { NotificationToggle } from './components/NotificationToggle'

/**
 * Group chat.
 *
 * Every group on this screen is derived from the school's own records — the
 * section a teacher advises, the subjects they teach, and the mirror of that for
 * a student. There is no way to start one, invite to one, or leave one, because
 * there is no list of members to edit: enrolment is the membership.
 *
 * One poll (useChatSync) feeds the open thread, the group list and the sidebar
 * badge. Nothing on this page sets a timer of its own.
 */
const ChatPage: React.FC = () => {
  const { user } = useAuth()
  const { isStudent } = usePermissions()

  const [activeId, setActiveId] = useState<string | null>(null)

  // Where a notification click lands: /chat?c=<conversation>.
  const [searchParams] = useSearchParams()
  const requestedId = searchParams.get('c')

  /*
   * Chat is the one screen that has to fill the page exactly: the message list
   * scrolls inside it, so any error leaves the composer either floating above
   * the fold or pushed below it behind a second scrollbar.
   *
   * The height is measured rather than computed from the viewport, because the
   * space above this panel is not a constant — the topbar, the layout's padding
   * and the impersonation banner all sit in it, and the banner appears and
   * disappears at runtime.
   */
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelHeight, setPanelHeight] = useState<number>()

  useLayoutEffect(() => {
    const measure = () => {
      const panel = panelRef.current
      if (!panel) return

      const top = panel.getBoundingClientRect().top
      const bottomPadding = 24
      setPanelHeight(Math.max(320, window.innerHeight - top - bottomPadding))
    }

    measure()
    window.addEventListener('resize', measure)

    // The banner is not a resize, so watch the layout above us for its arrival.
    const observer = new ResizeObserver(measure)
    if (panelRef.current?.parentElement) observer.observe(document.body)

    return () => {
      window.removeEventListener('resize', measure)
      observer.disconnect()
    }
  }, [])

  const conversations = useChatConversations()
  const messages = useChatMessages(activeId)
  const send = useSendMessage(activeId)
  const remove = useDeleteMessage(activeId)
  const setLocked = useSetLocked(activeId)

  useChatSync(true)

  const list = useMemo(() => conversations.data ?? [], [conversations.data])
  const active = useMemo(
    () => list.find(conversation => conversation.id === activeId) ?? null,
    [list, activeId],
  )

  /*
   * Which group is open.
   *
   * A conversation named in the URL wins, and is applied once — tracked so that
   * a notification arriving at an already-open tab still switches the thread,
   * while choosing a different group afterwards is not undone on the next
   * render. Failing that, the most recent group, so the screen is never an empty
   * pane.
   */
  const appliedRequest = useRef<string | null>(null)

  useEffect(() => {
    if (requestedId && requestedId !== appliedRequest.current) {
      if (list.some(conversation => conversation.id === requestedId)) {
        appliedRequest.current = requestedId
        setActiveId(requestedId)
        return
      }
    }

    if (!activeId && list.length > 0) {
      setActiveId(list.find(conversation => !conversation.archived)?.id ?? list[0].id)
    }
  }, [activeId, list, requestedId])

  const thread = messages.data ?? []
  useMarkRead(activeId, thread[thread.length - 1]?.id)

  /*
   * Which messages are "mine". A teacher is a users row and a student is a
   * students row, and the two id spaces are separate — so the type has to travel
   * with the id or a teacher and a student sharing an id would see each other's
   * messages on the wrong side of the thread.
   */
  const viewer = useMemo(
    () => (user?.id ? { type: isStudent ? 'student' : 'user', id: String(user.id) } : null),
    [user?.id, isStudent],
  )

  const composerPlaceholder = () => {
    if (!active) return 'Choose a group'
    if (active.archived) return 'You are no longer a member of this group'
    if (active.locked) return 'This group is closed to new messages'
    return `Message ${active.title}…`
  }

  return (
    <div
      ref={panelRef}
      style={{ height: panelHeight }}
      className="flex overflow-hidden rounded-xl border border-zinc-200 bg-white"
    >
      <aside className="hidden w-72 shrink-0 border-r border-zinc-200 md:block">
        <GroupList
          conversations={list}
          activeId={activeId}
          loading={conversations.isLoading}
          onSelect={setActiveId}
        />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {active ? (
          <>
            <header className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3 sm:px-6">
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-sm font-semibold text-zinc-900">{active.title}</h1>
                <p className="truncate text-xs text-zinc-500">
                  {active.subtitle ?? (active.type === 'advisory' ? 'Advisory' : 'Subject')}
                  {active.archived && ' · past group'}
                </p>
              </div>

              {(active.locked || active.archived) && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-500">
                  <Lock className="h-3 w-3" />
                  Read only
                </span>
              )}

              {/*
                Only a teacher of this group, and only while they are still in
                it — a past group is already read-only for everyone, so a control
                to close it would do nothing.
              */}
              {active.role === 'teacher' && !active.archived && (
                <button
                  type="button"
                  onClick={() => setLocked.mutate(!active.locked)}
                  disabled={setLocked.isPending}
                  aria-pressed={active.locked}
                  title={
                    active.locked
                      ? 'Let everyone post here again'
                      : 'Stop new messages. Everyone keeps the transcript.'
                  }
                  className={clsx(
                    'flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
                    setLocked.isPending && 'opacity-60',
                    active.locked
                      ? 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200',
                  )}
                >
                  {active.locked ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                  <span className="hidden sm:inline">{active.locked ? 'Reopen' : 'Close'}</span>
                </button>
              )}

              <NotificationToggle />
            </header>

            <div className="min-h-0 flex-1">
              <MessageList
                messages={thread}
                loading={messages.isLoading}
                viewer={viewer}
                isTeacher={active.role === 'teacher' && !active.archived}
                onDelete={messageId => remove.mutate(messageId)}
              />
            </div>

            {(send.isError || remove.isError || setLocked.isError) && (
              <p className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 sm:px-6">
                {send.isError
                  ? 'That message did not send. Check your connection and try again.'
                  : remove.isError
                    ? 'That message was not removed. Check your connection and try again.'
                    : 'That did not go through. Check your connection and try again.'}
              </p>
            )}

            <MessageComposer
              disabled={!active.can_post}
              sending={send.isPending}
              placeholder={composerPlaceholder()}
              onSend={body => send.mutate(body)}
            />
          </>
        ) : (
          <EmptyState loading={conversations.isLoading} />
        )}
      </main>
    </div>
  )
}

const EmptyState: React.FC<{ loading: boolean }> = ({ loading }) => (
  <div className="flex h-full flex-col items-center justify-center px-6 text-center">
    <div className="mb-4 rounded-2xl bg-zinc-100 p-4">
      <MessageSquare className="h-7 w-7 text-zinc-500" />
    </div>
    <h2 className="text-lg font-semibold text-zinc-900">
      {loading ? 'Loading your groups…' : 'No groups yet'}
    </h2>
    <p className="mt-1 max-w-md text-sm text-zinc-600">
      {loading
        ? ' '
        : 'A group appears for the section you advise and for each subject you take part in, once a teacher has been assigned to it.'}
    </p>
  </div>
)

export default ChatPage
