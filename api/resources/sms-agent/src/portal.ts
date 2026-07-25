import { log } from './logger.js'

export interface OutboxMessage {
  id: string
  to_number: string
  body: string
}

export interface PairResult {
  token: string
  gateway_id: string
}

/** HTTP client for the ScholasticCloud SMS gateway endpoints. */
export class Portal {
  constructor(private baseUrl: string, private token: string) {}

  setToken(token: string): void {
    this.token = token
  }

  private async request<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(auth && this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    const json = text ? JSON.parse(text) : {}
    if (!res.ok) {
      throw new Error(`${method} ${path} -> ${res.status} ${json.message ?? text}`)
    }
    return json as T
  }

  pair(pairingCode: string, meta: Record<string, unknown>): Promise<PairResult> {
    return this.request<PairResult>('POST', '/sms-gateway/pair', { pairing_code: pairingCode, ...meta }, false)
  }

  heartbeat(payload: Record<string, unknown>): Promise<void> {
    return this.request('POST', '/sms-gateway/heartbeat', payload).then(() => undefined)
  }

  async claimOutbox(limit: number): Promise<OutboxMessage[]> {
    const res = await this.request<{ data: OutboxMessage[] }>('GET', `/sms-gateway/outbox?limit=${limit}`)
    return res.data ?? []
  }

  reportStatus(results: unknown[]): Promise<void> {
    if (!results.length) return Promise.resolve()
    return this.request('POST', '/sms-gateway/outbox/status', { results }).then(() => undefined)
  }

  reportDelivery(reports: unknown[]): Promise<void> {
    if (!reports.length) return Promise.resolve()
    return this.request('POST', '/sms-gateway/delivery-reports', { reports }).then(() => undefined)
  }

  pushInbox(messages: unknown[]): Promise<void> {
    if (!messages.length) return Promise.resolve()
    return this.request('POST', '/sms-gateway/inbox', { messages }).then(() => undefined)
  }
}

/** Retry helper with exponential backoff, used for network calls in the loops. */
export async function withRetry<T>(fn: () => Promise<T>, label: string, attempts = 3): Promise<T | null> {
  let delay = 1000
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      log.warn(`${label} failed (attempt ${i + 1}/${attempts}): ${String(e)}`)
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, delay))
        delay *= 2
      }
    }
  }
  return null
}
