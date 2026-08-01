import { useCallback, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  talaService,
  TalaRequestError,
  type TalaConversationSummary,
  type TalaMessage,
  type TalaProviderKey,
} from '../services/talaService'

const CONFIG_KEY = ['tala', 'config']
const CONVERSATIONS_KEY = ['tala', 'conversations']
const conversationKey = (id: string) => ['tala', 'conversation', id]

/**
 * Whose key is answering, which models are on offer, and how much of the
 * school's monthly allowance is left.
 */
export function useTalaConfig() {
  return useQuery({
    queryKey: CONFIG_KEY,
    queryFn: () => talaService.getConfig(),
    staleTime: 60 * 1000,
  })
}

export function useTalaConversations() {
  return useQuery({
    queryKey: CONVERSATIONS_KEY,
    queryFn: () => talaService.listConversations(),
    staleTime: 30 * 1000,
  })
}

export function useTalaConversation(id: string | null) {
  return useQuery({
    queryKey: conversationKey(id ?? 'none'),
    queryFn: () => talaService.getConversation(id as string),
    enabled: Boolean(id),
    // The transcript is rebuilt locally as the reply streams, so refetching on
    // focus mid-answer would swap a half-written message for a stale one.
    refetchOnWindowFocus: false,
  })
}

export function useTalaConversationMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY })

  return {
    create: useMutation({
      mutationFn: () => talaService.createConversation(),
      onSuccess: invalidate,
    }),
    rename: useMutation({
      mutationFn: ({ id, title }: { id: string; title: string }) => talaService.renameConversation(id, title),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => talaService.deleteConversation(id),
      onSuccess: invalidate,
    }),
  }
}

export function useTalaKeyMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: CONFIG_KEY })

  return {
    saveOwn: useMutation({
      mutationFn: talaService.saveOwnKey,
      onSuccess: invalidate,
    }),
    deleteOwn: useMutation({
      mutationFn: (provider: TalaProviderKey) => talaService.deleteOwnKey(provider),
      onSuccess: invalidate,
    }),
    saveInstitution: useMutation({
      mutationFn: talaService.saveInstitutionKey,
      onSuccess: invalidate,
    }),
    deleteInstitution: useMutation({
      mutationFn: (provider: TalaProviderKey) => talaService.deleteInstitutionKey(provider),
      onSuccess: invalidate,
    }),
  }
}

/** A message on screen. Pending ones exist only until the turn is persisted. */
export interface ChatEntry {
  id: string
  role: 'user' | 'assistant'
  content: string
  error?: string | null
  pending?: boolean
}

/** A lookup Tala is running, or has run, during the current turn. */
export interface ToolActivity {
  name: string
  status: 'running' | 'done' | 'failed'
  summary?: string
}

/**
 * Drives one conversation: the transcript on screen and the streaming send.
 *
 * The transcript is local state rather than query cache because it changes on
 * every token. `syncFrom` seeds it when a thread is opened or switched.
 */
export function useTalaChat(conversationId: string | null) {
  const queryClient = useQueryClient()

  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [tools, setTools] = useState<ToolActivity[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [blockedReason, setBlockedReason] = useState<TalaRequestError | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  /** Seed the transcript from the server's copy of the thread. */
  const syncFrom = useCallback((messages: TalaMessage[]) => {
    setEntries(
      messages
        // `tool` rows are an audit trail of what Tala looked up, not part of
        // the conversation the teacher had.
        .filter(message => message.role !== 'tool')
        .map(message => ({
          id: message.id,
          role: message.role as 'user' | 'assistant',
          content: message.content,
          error: message.error_message,
        }))
    )
    setTools([])
    setBlockedReason(null)
  }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setEntries([])
    setTools([])
    setIsStreaming(false)
    setBlockedReason(null)
  }, [])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsStreaming(false)
  }, [])

  /**
   * `targetId` covers the case where the thread was created moments ago and
   * this closure still remembers the id as null — sending from the empty
   * screen creates the conversation and sends into it in one go, and waiting
   * a render for the hook to catch up would silently drop the message.
   */
  const send = useCallback(
    async (text: string, targetId?: string) => {
      const threadId = targetId ?? conversationId

      if (!threadId || !text.trim() || isStreaming) return

      const draftId = `pending-${Date.now()}`

      setBlockedReason(null)
      setTools([])
      setEntries(current => [
        ...current,
        { id: `${draftId}-user`, role: 'user', content: text },
        { id: draftId, role: 'assistant', content: '', pending: true },
      ])
      setIsStreaming(true)

      const controller = new AbortController()
      abortRef.current = controller

      const appendToDraft = (fragment: string) =>
        setEntries(current =>
          current.map(entry =>
            entry.id === draftId ? { ...entry, content: entry.content + fragment } : entry
          )
        )

      try {
        await talaService.streamMessage(
          threadId,
          text,
          {
            onDelta: appendToDraft,
            onTool: activity =>
              setTools(current => {
                const existing = current.findIndex(tool => tool.name === activity.name)
                if (existing === -1) return [...current, activity]

                const next = [...current]
                next[existing] = activity
                return next
              }),
            onDone: () =>
              setEntries(current =>
                current.map(entry => (entry.id === draftId ? { ...entry, pending: false } : entry))
              ),
            onError: event =>
              setEntries(current =>
                current.map(entry =>
                  entry.id === draftId ? { ...entry, pending: false, error: event.message } : entry
                )
              ),
          },
          controller.signal
        )
      } catch (error) {
        if (controller.signal.aborted) {
          // The teacher pressed stop. Whatever arrived stays on screen.
          setEntries(current =>
            current.map(entry => (entry.id === draftId ? { ...entry, pending: false } : entry))
          )
        } else if (error instanceof TalaRequestError) {
          // Never reached the model: drop the empty assistant bubble and
          // surface the reason above the composer instead, where it can carry
          // a link to settings.
          setBlockedReason(error)
          setEntries(current => current.filter(entry => entry.id !== draftId))
        } else {
          setEntries(current =>
            current.map(entry =>
              entry.id === draftId
                ? { ...entry, pending: false, error: 'Something went wrong sending that message.' }
                : entry
            )
          )
        }
      } finally {
        setIsStreaming(false)
        abortRef.current = null

        // The thread now has a title and a timestamp; the allowance moved.
        queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
        queryClient.invalidateQueries({ queryKey: CONFIG_KEY })
      }
    },
    [conversationId, isStreaming, queryClient]
  )

  return { entries, tools, isStreaming, blockedReason, send, stop, reset, syncFrom }
}

export type { TalaConversationSummary }
