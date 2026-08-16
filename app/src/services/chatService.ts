import { api } from '../lib/api'
import type { ApiResponse } from '../types'

/** A group chat, derived from an advisory section or a subject. */
export interface ChatConversationSummary {
  id: string
  type: 'advisory' | 'subject'
  title: string
  subtitle: string | null
  academic_year: string
  last_message_at: string | null
  locked: boolean
  unread_count: number
  role: 'teacher' | 'student' | null
  can_post: boolean
  /** Set once someone leaves the section or subject: readable, not writable. */
  archived: boolean
  last_message: {
    sender_name: string | null
    preview: string
    created_at: string
  } | null
}

export interface ChatMessage {
  id: string
  conversation_id: string
  sender_type: 'user' | 'student' | 'system'
  sender_id: string | null
  sender_name: string | null
  /** Null when the message was removed — the text never comes back over the wire. */
  body: string | null
  is_deleted: boolean
  reply_to_id: string | null
  edited_at: string | null
  created_at: string
}

/** The per-conversation half of a sync response: badges and posting rights. */
export interface ChatConversationState {
  id: string
  last_message_at: string | null
  unread_count: number
  locked: boolean
  can_post: boolean
}

export interface ChatSyncPayload {
  messages: ChatMessage[]
  conversations: ChatConversationState[]
  /** Feed straight back on the next poll. */
  cursor: string
  /** More was waiting than one poll carries — reload rather than trusting the page. */
  truncated: boolean
}

/**
 * Where chat is served from, and the token for it.
 *
 * A deployment either has a chat service configured or it does not. With one,
 * every read and write goes straight to the edge and Laravel is left holding
 * only the token mint. Without one, the same calls go to Laravel exactly as
 * before — the endpoint shapes are identical on purpose, so this is a change of
 * address rather than a change of client.
 */
interface ChatBackend {
  service: string | null
  token: string | null
  socket: string | null
}

let backend: ChatBackend | null = null
let backendExpiresAt = 0
let inFlight: Promise<ChatBackend> | null = null

/**
 * Resolve the backend, refreshing the token shortly before it lapses.
 *
 * Concurrent callers share one request: a screen opening fires the conversation
 * list, the sync poll and the socket at once, and three token mints for one page
 * load would waste the only Laravel call chat still makes.
 */
async function resolveBackend(): Promise<ChatBackend> {
  if (backend && Date.now() < backendExpiresAt) return backend
  if (inFlight) return inFlight

  inFlight = api
    .get<ApiResponse<{ service?: string; token?: string; socket?: string; expires_in?: number }>>(
      '/chat/token',
    )
    .then(response => {
      const data = response.data.data

      backend = {
        service: data?.service ?? null,
        token: data?.token ?? null,
        socket: data?.socket ?? null,
      }

      // Refresh a minute early so a request is never made with a token that
      // expires mid-flight.
      backendExpiresAt = Date.now() + Math.max(0, (data?.expires_in ?? 0) - 60) * 1000

      return backend
    })
    .catch(() => {
      // Treat an unreachable token endpoint as "no service configured" and fall
      // back to Laravel, which is the path that still works.
      backend = { service: null, token: null, socket: null }
      backendExpiresAt = Date.now() + 30_000
      return backend
    })
    .finally(() => {
      inFlight = null
    })

  return inFlight
}

/** Drop the cached token — used when the service rejects it as expired. */
function invalidateBackend() {
  backend = null
  backendExpiresAt = 0
}

class ChatService {
  private baseUrl = '/chat'

  /**
   * Perform a chat call against whichever backend this deployment has.
   *
   * On a 401 from the service the token is dropped and the call retried once:
   * a token can lapse between being minted and being used, and a single retry
   * is cheaper than shortening every token to cover the gap.
   */
  private async call<T>(
    method: 'get' | 'post',
    path: string,
    body?: unknown,
    retry = true,
  ): Promise<ApiResponse<T>> {
    const target = await resolveBackend()

    if (!target.service || !target.token) {
      const response =
        method === 'get'
          ? await api.get<ApiResponse<T>>(`${this.baseUrl}${path}`)
          : await api.post<ApiResponse<T>>(`${this.baseUrl}${path}`, body ?? {})
      return response.data
    }

    try {
      const response = await fetch(`${target.service}${path}`, {
        method: method.toUpperCase(),
        headers: {
          Authorization: `Bearer ${target.token}`,
          ...(method === 'post' ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(method === 'post' ? { body: JSON.stringify(body ?? {}) } : {}),
      })

      if (response.status === 401 && retry) {
        invalidateBackend()
        return this.call<T>(method, path, body, false)
      }

      if (!response.ok) {
        const detail = await response.json().catch(() => null)
        throw new Error(detail?.message ?? `Chat service returned ${response.status}`)
      }

      return (await response.json()) as ApiResponse<T>
    } catch (error) {
      if (retry) {
        invalidateBackend()
        return this.call<T>(method, path, body, false)
      }
      throw error
    }
  }

  async getConversations() {
    return this.call<ChatConversationSummary[]>('get', '/conversations')
  }

  async getMessages(conversationId: string, before?: string) {
    const query = before ? `?before=${encodeURIComponent(before)}` : ''
    return this.call<{ messages: ChatMessage[]; has_more: boolean }>(
      'get',
      `/conversations/${conversationId}/messages${query}`,
    )
  }

  async send(conversationId: string, body: string) {
    return this.call<ChatMessage>('post', `/conversations/${conversationId}/messages`, { body })
  }

  async markRead(conversationId: string) {
    return this.call<null>('post', `/conversations/${conversationId}/read`)
  }

  /**
   * Remove a message.
   *
   * Answers with the tombstone rather than nothing, so the caller writes the
   * same shape into the cache that everyone else receives over the socket.
   */
  async deleteMessage(conversationId: string, messageId: string) {
    return this.call<ChatMessage>(
      'post',
      `/conversations/${conversationId}/messages/${messageId}/delete`,
    )
  }

  /** Close a group to new messages, or reopen it. Teachers only. */
  async setLocked(conversationId: string, locked: boolean) {
    return this.call<{ locked: boolean }>('post', `/conversations/${conversationId}/lock`, {
      locked,
    })
  }

  /**
   * Everything new across every group the signed-in person is in.
   *
   * One request feeds all open threads and all unread badges, which is what lets
   * the client run a single timer rather than one per conversation.
   */
  async sync(since: string | null) {
    const query = since ? `?since=${encodeURIComponent(since)}` : ''
    return this.call<ChatSyncPayload>('get', `/sync${query}`)
  }

  async getUnreadCount() {
    return this.call<{ count: number }>('get', '/unread-count')
  }

  /**
   * Whether this deployment has a chat service at all.
   *
   * Notifications are the one chat feature that only exists there: the sender
   * has to know who was not connected, which is something only the edge fan-out
   * finds out. On a Laravel-only deployment the toggle is simply not offered.
   */
  async hasService(): Promise<boolean> {
    return !!(await resolveBackend()).service
  }

  /** The VAPID key a browser needs before it can subscribe. Null when push is off. */
  async getPushKey() {
    return this.call<{ key: string | null }>('get', '/push/key')
  }

  async subscribePush(subscription: PushSubscriptionJSON) {
    return this.call<null>('post', '/push/subscribe', subscription)
  }

  async unsubscribePush(endpoint: string) {
    return this.call<null>('post', '/push/unsubscribe', { endpoint })
  }

  /**
   * A ticket for the realtime socket.
   *
   * With a chat service configured the same token opens the socket, so this
   * costs nothing extra. Without one it falls back to Laravel's socket-token
   * endpoint, and `enabled: false` from there is the ordinary answer on a
   * deployment with no realtime at all — the client keeps polling.
   */
  async getSocketTicket(): Promise<ApiResponse<ChatSocketTicket>> {
    const target = await resolveBackend()

    if (target.socket && target.token) {
      return {
        success: true,
        data: { enabled: true, url: target.socket, token: target.token, expires_in: 0 },
      } as ApiResponse<ChatSocketTicket>
    }

    const response = await api.get<ApiResponse<ChatSocketTicket>>(`${this.baseUrl}/socket-token`)
    return response.data
  }
}

export type ChatSocketTicket =
  | { enabled: false }
  | { enabled: true; url: string; token: string; expires_in: number }

/** What the Worker pushes down an open socket. */
export interface ChatSocketEnvelope {
  type: 'message'
  conversation_id: string
  message: ChatMessage
}

export const chatService = new ChatService()
