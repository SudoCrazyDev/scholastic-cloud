import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  chatService,
  type ChatConversationSummary,
  type ChatMessage,
  type ChatSocketEnvelope,
  type ChatSyncPayload,
} from '../services/chatService'

export const chatKeys = {
  conversations: ['chat', 'conversations'] as const,
  messages: (conversationId: string) => ['chat', 'messages', conversationId] as const,
  sync: ['chat', 'sync'] as const,
  unread: ['chat', 'unread-count'] as const,
}

/*
 * How often the sync poll runs.
 *
 * With a socket connected the poll is only a safety net — the Worker delivers in
 * well under a second, and this exists to close the gaps a best-effort relay
 * leaves behind. Without one it is the whole transport, and has to be quick
 * enough for a conversation.
 */
const CONNECTED_INTERVAL = 60_000
const FOREGROUND_INTERVAL = 3_000
const BACKGROUND_INTERVAL = 20_000

/** Ping cadence, to stop an idle socket being culled by something in the middle. */
const HEARTBEAT_INTERVAL = 45_000

const MAX_RECONNECT_DELAY = 30_000

/** Reading order: by time, then by id — message ids are ULIDs, so they break ties in time order. */
const compareMessages = (a: ChatMessage, b: ChatMessage) => {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Fold new messages into a transcript already on screen.
 *
 * Incoming wins on a collision, which is both how an edit or a removal lands and
 * how the server's copy of an optimistic message replaces the placeholder. The
 * dedupe is not optional: the sync endpoint deliberately re-reads a couple of
 * seconds either side of the cursor so a message cannot fall through it.
 */
const mergeMessages = (existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] => {
  const byId = new Map(existing.map(message => [message.id, message]))
  for (const message of incoming) byId.set(message.id, message)
  return Array.from(byId.values()).sort(compareMessages)
}

const byRecency = (a: ChatConversationSummary, b: ChatConversationSummary) => {
  if (a.archived !== b.archived) return a.archived ? 1 : -1
  const left = a.last_message_at ?? ''
  const right = b.last_message_at ?? ''
  if (left !== right) return left < right ? 1 : -1
  return a.title.localeCompare(b.title)
}

/**
 * Write a sync response into the query cache.
 *
 * @returns true when the response mentions something the cache has never heard
 *          of — a group that just opened — and the list needs a real refetch.
 */
const applySync = (queryClient: QueryClient, payload: ChatSyncPayload): boolean => {
  const byConversation = new Map<string, ChatMessage[]>()
  for (const message of payload.messages) {
    const bucket = byConversation.get(message.conversation_id)
    if (bucket) bucket.push(message)
    else byConversation.set(message.conversation_id, [message])
  }

  byConversation.forEach((incoming, conversationId) => {
    queryClient.setQueryData<ChatMessage[]>(chatKeys.messages(conversationId), existing =>
      // A thread nobody has opened is left alone — it will load from the server
      // complete, and seeding it with a fragment would leave a hole above.
      existing ? mergeMessages(existing, incoming) : existing,
    )
  })

  let sawUnknown = false

  queryClient.setQueryData<ChatConversationSummary[]>(chatKeys.conversations, existing => {
    if (!existing) return existing

    const known = new Set(existing.map(conversation => conversation.id))
    sawUnknown = payload.conversations.some(conversation => !known.has(conversation.id))

    const states = new Map(payload.conversations.map(state => [state.id, state]))

    return existing
      .map(conversation => {
        const state = states.get(conversation.id)
        return state ? { ...conversation, ...state } : conversation
      })
      .sort(byRecency)
  })

  return sawUnknown
}

/**
 * Hold a socket to the realtime Worker, reconnecting for as long as the screen
 * is up.
 *
 * The socket is receive-only and, on its own, unreliable — a delivery made while
 * a client is between connections is simply gone. That is by design: every
 * connect and reconnect triggers a sync, and the cursor makes the poll fill in
 * whatever the socket missed. Speed is this transport's only job.
 *
 * A deployment with no Worker configured answers `enabled: false`, and this
 * quietly does nothing for the rest of the session.
 */
const useChatSocket = (
  enabled: boolean,
  onEnvelope: (envelope: ChatSocketEnvelope) => void,
  onResync: () => void,
) => {
  const [connected, setConnected] = useState(false)

  // Held in refs so reconnecting never re-runs the effect and tears down the
  // socket it just opened.
  const envelopeRef = useRef(onEnvelope)
  const resyncRef = useRef(onResync)
  envelopeRef.current = onEnvelope
  resyncRef.current = onResync

  useEffect(() => {
    if (!enabled) return

    let socket: WebSocket | null = null
    let heartbeat: ReturnType<typeof setInterval> | undefined
    let retry: ReturnType<typeof setTimeout> | undefined
    let attempt = 0
    let disposed = false

    const scheduleReconnect = () => {
      if (disposed) return

      attempt++
      // Exponential backoff with jitter, so a Worker coming back up is not met
      // by every tablet in the school at the same instant.
      const delay = Math.min(MAX_RECONNECT_DELAY, 1_000 * 2 ** attempt) + Math.random() * 500
      retry = setTimeout(connect, delay)
    }

    const connect = async () => {
      if (disposed) return

      let ticket
      try {
        ticket = (await chatService.getSocketTicket()).data
      } catch {
        scheduleReconnect()
        return
      }

      if (!ticket.enabled) return // No Worker here. Polling is the transport.
      if (disposed) return

      // The token travels in the URL because a browser cannot set headers on a
      // WebSocket handshake. It is minted per connection and expires in minutes.
      socket = new WebSocket(`${ticket.url}?token=${encodeURIComponent(ticket.token)}`)

      socket.onopen = () => {
        attempt = 0
        setConnected(true)
        // Close whatever gap opened while there was no socket.
        resyncRef.current()
        heartbeat = setInterval(() => socket?.send('ping'), HEARTBEAT_INTERVAL)
      }

      socket.onmessage = event => {
        if (event.data === 'pong') return

        try {
          const envelope = JSON.parse(event.data) as ChatSocketEnvelope
          if (envelope.type === 'message') envelopeRef.current(envelope)
        } catch {
          // Not something this client understands. The poll is authoritative
          // anyway, so there is nothing to do about it.
        }
      }

      socket.onclose = () => {
        setConnected(false)
        clearInterval(heartbeat)
        scheduleReconnect()
      }

      socket.onerror = () => socket?.close()
    }

    connect()

    return () => {
      disposed = true
      clearTimeout(retry)
      clearInterval(heartbeat)
      socket?.close()
      setConnected(false)
    }
  }, [enabled])

  return connected
}

/**
 * The single transport behind every chat screen.
 *
 * Mount once, high in the tree. Everything else reads the query cache, so a new
 * message updates the open thread, the group list and the sidebar badge from one
 * source rather than three timers.
 */
export const useChatSync = (enabled: boolean) => {
  const queryClient = useQueryClient()
  const cursorRef = useRef<string | null>(null)

  // A hidden tab still syncs, just lazily — someone coming back to it should
  // find a truthful badge without waiting for the next foreground tick.
  const [documentVisible, setDocumentVisible] = useState(
    () => typeof document === 'undefined' || !document.hidden,
  )

  useEffect(() => {
    const onVisibilityChange = () => setDocumentVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  const resync = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: chatKeys.sync })
  }, [queryClient])

  /*
   * A socket delivery renders straight away, then a sync is nudged to follow.
   *
   * The two do different jobs and both are needed: the envelope carries the
   * message, but unread counts, ordering and anything that arrived in a group
   * this client has not opened are only known to the server. Debounced, so a
   * teacher posting three lines in a row causes one reconciliation rather than
   * three.
   */
  const reconcileTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const onEnvelope = useCallback(
    (envelope: ChatSocketEnvelope) => {
      queryClient.setQueryData<ChatMessage[]>(
        chatKeys.messages(envelope.conversation_id),
        existing => (existing ? mergeMessages(existing, [envelope.message]) : existing),
      )

      clearTimeout(reconcileTimer.current)
      reconcileTimer.current = setTimeout(resync, 400)
    },
    [queryClient, resync],
  )

  const socketConnected = useChatSocket(enabled, onEnvelope, resync)

  useEffect(() => () => clearTimeout(reconcileTimer.current), [])

  return useQuery({
    queryKey: chatKeys.sync,
    enabled,
    queryFn: async () => {
      const response = await chatService.sync(cursorRef.current)
      const payload = response.data

      cursorRef.current = payload.cursor

      const sawUnknown = applySync(queryClient, payload)

      // Either more was waiting than a poll carries, or a group opened that this
      // client has never seen. Both mean the cache is now a guess; go and ask.
      if (payload.truncated || sawUnknown) {
        queryClient.invalidateQueries({ queryKey: chatKeys.conversations })
        queryClient.invalidateQueries({ queryKey: ['chat', 'messages'] })
      }

      return payload
    },
    // With a socket up this is a safety net on a slow timer; without one it is
    // the transport and has to keep up with a conversation.
    refetchInterval: socketConnected
      ? CONNECTED_INTERVAL
      : documentVisible
        ? FOREGROUND_INTERVAL
        : BACKGROUND_INTERVAL,
    refetchIntervalInBackground: true,
    staleTime: 0,
    // The cursor makes each response a delta, so a retried failure just gets
    // folded into the next poll a few seconds later.
    retry: false,
  })
}

export const useChatConversations = () =>
  useQuery({
    queryKey: chatKeys.conversations,
    queryFn: async () => (await chatService.getConversations()).data,
    staleTime: 30_000,
  })

export const useChatMessages = (conversationId: string | null) =>
  useQuery({
    queryKey: chatKeys.messages(conversationId ?? 'none'),
    queryFn: async () => (await chatService.getMessages(conversationId!)).data.messages,
    enabled: !!conversationId,
    staleTime: Infinity,
  })

export const useSendMessage = (conversationId: string | null) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (body: string) => (await chatService.send(conversationId!, body)).data,
    onSuccess: message => {
      // Show it straight away rather than waiting up to a poll interval for the
      // sender to see their own message.
      queryClient.setQueryData<ChatMessage[]>(chatKeys.messages(message.conversation_id), existing =>
        existing ? mergeMessages(existing, [message]) : [message],
      )
      queryClient.setQueryData<ChatConversationSummary[]>(chatKeys.conversations, existing =>
        existing
          ? existing
              .map(conversation =>
                conversation.id === message.conversation_id
                  ? {
                      ...conversation,
                      last_message_at: message.created_at,
                      last_message: {
                        sender_name: message.sender_name,
                        preview: message.body ?? '',
                        created_at: message.created_at,
                      },
                    }
                  : conversation,
              )
              .sort(byRecency)
          : existing,
      )
    },
  })
}

/**
 * Remove a message.
 *
 * The tombstone comes back from the server and is merged in like any other
 * incoming message — same shape, same "incoming wins" rule — so the bubble turns
 * into "Message removed" without a refetch. Everyone else gets it pushed.
 */
export const useDeleteMessage = (conversationId: string | null) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (messageId: string) =>
      (await chatService.deleteMessage(conversationId!, messageId)).data,
    onSuccess: message => {
      queryClient.setQueryData<ChatMessage[]>(chatKeys.messages(message.conversation_id), existing =>
        existing ? mergeMessages(existing, [message]) : existing,
      )
      // The group list shows a preview of the last message, which may be the one
      // just removed.
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations })
    },
  })
}

/** Close a group to new messages, or reopen it. Teachers only. */
export const useSetLocked = (conversationId: string | null) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (locked: boolean) =>
      (await chatService.setLocked(conversationId!, locked)).data,
    onSuccess: ({ locked }) => {
      queryClient.setQueryData<ChatConversationSummary[]>(chatKeys.conversations, existing =>
        existing
          ? existing.map(conversation =>
              conversation.id === conversationId
                ? { ...conversation, locked, can_post: !locked && !conversation.archived }
                : conversation,
            )
          : existing,
      )
    },
  })
}

/**
 * Clear the unread badge for whichever group is on screen.
 *
 * Fires when the thread is opened and again whenever something arrives while the
 * reader is looking at it — an unread count that stays lit above the messages
 * you are visibly reading is worse than none at all.
 */
export const useMarkRead = (conversationId: string | null, newestMessageId: string | undefined) => {
  const queryClient = useQueryClient()
  const lastMarked = useRef<string | null>(null)

  const clearBadge = useCallback(() => {
    queryClient.setQueryData<ChatConversationSummary[]>(chatKeys.conversations, existing =>
      existing
        ? existing.map(conversation =>
            conversation.id === conversationId ? { ...conversation, unread_count: 0 } : conversation,
          )
        : existing,
    )
    queryClient.invalidateQueries({ queryKey: chatKeys.unread })
  }, [conversationId, queryClient])

  useEffect(() => {
    if (!conversationId || !newestMessageId) return

    const marker = `${conversationId}:${newestMessageId}`
    if (lastMarked.current === marker) return
    lastMarked.current = marker

    chatService.markRead(conversationId).then(clearBadge).catch(() => {
      // Left unmarked on purpose: the badge is cosmetic, and the next open of
      // the thread will try again.
      lastMarked.current = null
    })
  }, [conversationId, newestMessageId, clearBadge])
}
