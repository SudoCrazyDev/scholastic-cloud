import { api } from '../lib/api'
import type { ApiResponse } from '../types'

/*
 * Tala — the AI teaching assistant.
 *
 * Everything except sending a message goes through the shared axios client.
 * Sending a message does not: the reply streams back as Server-Sent Events,
 * and axios buffers a response body until it is complete, which would turn the
 * stream into a long pause followed by the whole answer at once. That one call
 * uses fetch and reads the body incrementally.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3333/api'

export type TalaProviderKey = 'anthropic' | 'openai'

export type TalaCredentialSource = 'institution' | 'user'

export interface TalaModelOption {
  key: string
  label: string
  description: string | null
}

export interface TalaProviderOption {
  key: TalaProviderKey
  label: string
  key_hint: string | null
  console_url: string | null
  default_model: string
  models: TalaModelOption[]
}

export interface TalaCredentialSummary {
  id: string
  source: TalaCredentialSource
  provider: TalaProviderKey
  provider_label: string
  model: string
  masked_key: string | null
  shared_with_staff: boolean | null
  monthly_message_limit: number | null
  is_active: boolean
  last_used_at: string | null
  updated_at: string | null
}

export interface TalaUsage {
  used: number
  limit: number | null
  remaining: number | null
  exceeded: boolean
}

export interface TalaConfig {
  /** False when the school has not supplied a usable key. There is no other source. */
  ready: boolean
  active_source: TalaCredentialSource | null
  active_provider: TalaProviderKey | null
  active_model: string | null
  institution_configured: boolean
  institution_shared: boolean
  providers: TalaProviderOption[]
  can_configure_institution: boolean
  /**
   * Whether this person may chat, as opposed to only administer.
   *
   * An administrator reaches the screen through `tala.configure` and can set the
   * key and hand out access without holding a seat themselves, so the two are
   * separate answers.
   */
  can_chat: boolean
  usage: TalaUsage
}

/** One member of staff on the administrator's access list. */
export interface TalaAccessRow {
  id: string
  name: string
  email: string | null
  role: string | null
  granted: boolean
  granted_at: string | null
  granted_by: string | null
}

export interface TalaAccessList {
  rows: TalaAccessRow[]
  granted_count: number
  staff_count: number
}

export interface TalaConversationSummary {
  id: string
  title: string | null
  provider: TalaProviderKey | null
  model: string | null
  last_message_at: string | null
  created_at: string
}

export interface TalaMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  provider: TalaProviderKey | null
  model: string | null
  error_message: string | null
  created_at: string
}

export interface TalaConversationDetail {
  conversation: TalaConversationSummary
  messages: TalaMessage[]
}

export type TalaProposalAction = 'create' | 'update' | 'delete' | 'publish' | 'unpublish'

export type TalaProposalStatus = 'pending' | 'applied' | 'discarded' | 'failed'

export interface TalaProposalWarning {
  level: 'notice' | 'warning' | 'danger'
  message: string
}

export interface TalaProposalQuestion {
  number: number
  type: string
  question: string
  choices?: string[]
  answer?: string
  points?: number
  images?: number
}

/**
 * A change to an assessment that Tala has drafted and nobody has approved.
 *
 * The model cannot write to the gradebook. It produces one of these, the card
 * below renders it, and `applyProposal` — an ordinary authenticated request —
 * is what actually changes anything.
 */
export interface TalaProposal {
  id: string
  message_id: string | null
  action: TalaProposalAction
  status: TalaProposalStatus
  title: string | null
  assessment_type: string | null
  quarter: string | null
  summary: string | null
  preview: {
    action?: TalaProposalAction
    assessment?: Record<string, string | number | null>
    questions?: TalaProposalQuestion[]
    replaces?: TalaProposalQuestion[]
    changes?: Record<string, { from?: string | number | null; to?: string | number | null }>
  }
  warnings: TalaProposalWarning[]
  applied_item_id: string | null
  failure_reason: string | null
  created_at: string | null
}

/**
 * A failure that happened before the model was reached — no key configured,
 * monthly allowance spent, message too long. These answer with JSON and a
 * status code rather than opening a stream, so the chat can react to the cause
 * instead of showing a generic error.
 */
export class TalaRequestError extends Error {
  // Declared and assigned rather than written as constructor parameter
  // properties: the build runs with `erasableSyntaxOnly`, which rejects any TS
  // syntax that emits runtime code.
  readonly code: string | null
  readonly status: number
  readonly usage: TalaUsage | undefined

  constructor(message: string, code: string | null, status: number, usage?: TalaUsage) {
    super(message)
    this.name = 'TalaRequestError'
    this.code = code
    this.status = status
    this.usage = usage
  }
}

export interface StreamHandlers {
  onDelta: (text: string) => void
  /** A lookup Tala ran on the teacher's behalf, so the UI can say what it is doing. */
  onTool?: (event: { name: string; status: 'running' | 'done' | 'failed'; summary?: string }) => void
  /** Tala drafted a change to an assessment and is waiting for approval. */
  onProposal?: (proposal: TalaProposal) => void
  onDone?: (event: { message_id: string; tokens_in: number | null; tokens_out: number | null }) => void
  /** The model was reached but the turn failed part-way. */
  onError?: (event: { message_id?: string; message: string }) => void
}

export const talaService = {
  async getConfig(): Promise<TalaConfig> {
    const res = await api.get<ApiResponse<TalaConfig>>('/tala/config')
    return res.data.data
  },

  /** The staff roster with each person's Tala access. Needs `tala.configure`. */
  async listAccess(search?: string): Promise<TalaAccessList> {
    const res = await api.get<ApiResponse<TalaAccessRow[]> & { meta?: Record<string, number> }>(
      '/tala/access',
      { params: search ? { search } : undefined }
    )

    return {
      rows: res.data.data,
      granted_count: res.data.meta?.granted_count ?? 0,
      staff_count: res.data.meta?.staff_count ?? 0,
    }
  },

  /** Grant or revoke for one teacher or many. Needs `tala.configure`. */
  async setAccess(userIds: string[], granted: boolean): Promise<string> {
    const res = await api.put<ApiResponse<unknown> & { message: string }>('/tala/access', {
      user_ids: userIds,
      granted,
    })
    return res.data.message
  },

  async getInstitutionKeys(): Promise<TalaCredentialSummary[]> {
    const res = await api.get<ApiResponse<TalaCredentialSummary[]>>('/tala/institution-credentials')
    return res.data.data
  },

  async saveInstitutionKey(payload: {
    provider: TalaProviderKey
    api_key: string
    model?: string | null
    shared_with_staff?: boolean
    monthly_message_limit?: number | null
  }): Promise<TalaCredentialSummary> {
    const res = await api.put<ApiResponse<TalaCredentialSummary>>('/tala/institution-credentials', payload)
    return res.data.data
  },

  async deleteInstitutionKey(provider: TalaProviderKey): Promise<void> {
    await api.delete(`/tala/institution-credentials/${provider}`)
  },

  async listConversations(): Promise<TalaConversationSummary[]> {
    const res = await api.get<ApiResponse<TalaConversationSummary[]>>('/tala/conversations')
    return res.data.data
  },

  async createConversation(): Promise<TalaConversationSummary> {
    const res = await api.post<ApiResponse<TalaConversationSummary>>('/tala/conversations', {})
    return res.data.data
  },

  async getConversation(id: string): Promise<TalaConversationDetail> {
    const res = await api.get<ApiResponse<TalaConversationDetail>>(`/tala/conversations/${id}`)
    return res.data.data
  },

  async renameConversation(id: string, title: string): Promise<void> {
    await api.patch(`/tala/conversations/${id}`, { title })
  },

  async deleteConversation(id: string): Promise<void> {
    await api.delete(`/tala/conversations/${id}`)
  },

  async listProposals(conversationId: string): Promise<TalaProposal[]> {
    const res = await api.get<ApiResponse<TalaProposal[]>>(
      `/tala/conversations/${conversationId}/proposals`
    )
    return res.data.data
  },

  /**
   * Apply a suggestion. This is the request that changes the gradebook —
   * nothing the model does gets here on its own.
   *
   * A 409 means the suggestion no longer fits what is in the database (a student
   * submitted, someone else published it, it was already applied). The message
   * is written for the teacher, so it is surfaced rather than swallowed.
   */
  async applyProposal(id: string): Promise<{ proposal: TalaProposal; message: string }> {
    const res = await api.post<ApiResponse<{ proposal: TalaProposal }> & { message: string }>(
      `/tala/proposals/${id}/apply`,
      {}
    )
    return { proposal: res.data.data.proposal, message: res.data.message }
  },

  async discardProposal(id: string): Promise<TalaProposal> {
    const res = await api.post<ApiResponse<TalaProposal>>(`/tala/proposals/${id}/discard`, {})
    return res.data.data
  },

  /**
   * Send a message and stream the reply.
   *
   * Resolves when the turn is over — success or failure. Throws only for
   * failures that happened before the stream opened; anything that goes wrong
   * mid-reply arrives through `onError`, because by then the teacher is already
   * looking at a partial answer that should stay on screen.
   */
  async streamMessage(
    conversationId: string,
    message: string,
    handlers: StreamHandlers,
    signal?: AbortSignal
  ): Promise<void> {
    const token = localStorage.getItem('auth_token')

    const response = await fetch(`${API_BASE_URL}/tala/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ message }),
      signal,
    })

    const contentType = response.headers.get('content-type') ?? ''

    // The API answers pre-stream refusals as ordinary JSON, so the content type
    // is what distinguishes "never started" from "started and then broke".
    if (!response.ok || !contentType.includes('text/event-stream')) {
      const body = await response.json().catch(() => null)

      throw new TalaRequestError(
        body?.message ?? 'Tala could not answer that. Try again.',
        body?.error ?? null,
        response.status,
        body?.usage
      )
    }

    if (!response.body) {
      throw new TalaRequestError('Your browser could not read the reply stream.', null, response.status)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      // Normalise line endings so the frame split below holds regardless of
      // what the server or an intermediary used.
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')

      let boundary = buffer.indexOf('\n\n')

      while (boundary !== -1) {
        dispatchFrame(buffer.slice(0, boundary), handlers)
        buffer = buffer.slice(boundary + 2)
        boundary = buffer.indexOf('\n\n')
      }
    }
  },
}

/**
 * Turn one SSE frame into a handler call.
 *
 * Payloads are JSON-encoded on the server precisely so a reply containing
 * newlines cannot break the framing.
 */
function dispatchFrame(frame: string, handlers: StreamHandlers): void {
  let event = 'message'
  let data = ''

  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) data += line.slice(5).trim()
  }

  if (!data) return

  let payload: any
  try {
    payload = JSON.parse(data)
  } catch {
    return
  }

  switch (event) {
    case 'delta':
      if (typeof payload.text === 'string') handlers.onDelta(payload.text)
      break
    case 'tool':
      handlers.onTool?.(payload)
      break
    case 'proposal':
      if (typeof payload.id === 'string') handlers.onProposal?.(payload as TalaProposal)
      break
    case 'done':
      handlers.onDone?.(payload)
      break
    case 'error':
      handlers.onError?.(payload)
      break
  }
}
