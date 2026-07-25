import { AGENT_VERSION, type Config } from './config.js'
import { log } from './logger.js'
import { Modem } from './modem.js'
import { Portal, withRetry, type OutboxMessage } from './portal.js'

/** Buffers multi-part inbound SMS until every segment arrives. */
class ConcatBuffer {
  private store = new Map<
    number,
    { total: number; parts: Map<number, string>; sender: string; timestamp: string | null }
  >()

  add(ref: number, seq: number, total: number, sender: string, text: string, timestamp: string | null): string | null {
    let entry = this.store.get(ref)
    if (!entry) {
      entry = { total, parts: new Map(), sender, timestamp }
      this.store.set(ref, entry)
    }
    entry.parts.set(seq, text)
    if (entry.parts.size >= entry.total) {
      this.store.delete(ref)
      return Array.from({ length: entry.total }, (_, i) => entry!.parts.get(i + 1) ?? '').join('')
    }
    return null
  }
}

export class Agent {
  private modem: Modem
  private portal: Portal
  private concat = new ConcatBuffer()
  private stopped = false

  constructor(private config: Config, modem: Modem) {
    this.modem = modem
    this.portal = new Portal(config.apiBaseUrl, config.token)
  }

  async start(): Promise<void> {
    await this.modem.init()
    const info = await this.modem.info()
    log.info(`Modem ready: model=${info.model ?? '?'} imei=${info.imei ?? '?'} number=${info.ownNumber ?? '?'}`)

    // Kick each loop; they self-schedule.
    void this.heartbeatLoop(info)
    void this.outboxLoop()
    void this.inboxLoop()
  }

  stop(): void {
    this.stopped = true
  }

  private async heartbeatLoop(info: { imei: string | null; model: string | null; ownNumber: string | null }): Promise<void> {
    while (!this.stopped) {
      const [signal, operator] = await Promise.all([this.modem.signal(), this.modem.operator()])
      let balance: string | null = null
      if (this.config.ussdBalanceCode) {
        balance = await this.modem.balance(this.config.ussdBalanceCode)
      }
      await withRetry(
        () =>
          this.portal.heartbeat({
            online: true,
            signal_strength: signal ?? undefined,
            network_operator: operator ?? undefined,
            sim_msisdn: info.ownNumber ?? undefined,
            sim_balance: balance ?? undefined,
            imei: info.imei ?? undefined,
            modem_model: info.model ?? undefined,
            platform: this.config.platform,
            agent_version: AGENT_VERSION,
          }),
        'heartbeat',
      )
      await this.sleep(this.config.heartbeatMs)
    }
  }

  private async outboxLoop(): Promise<void> {
    while (!this.stopped) {
      const messages = await withRetry(() => this.portal.claimOutbox(this.config.outboxBatch), 'claim outbox')
      if (messages && messages.length) {
        log.info(`Sending ${messages.length} message(s)`)
        const results = await this.sendBatch(messages)
        await withRetry(() => this.portal.reportStatus(results), 'report status')
      }
      await this.sleep(this.config.outboxPollMs)
    }
  }

  private async sendBatch(messages: OutboxMessage[]): Promise<unknown[]> {
    const results: unknown[] = []
    for (const m of messages) {
      try {
        const ref = await this.modem.send(m.to_number, m.body)
        results.push({ id: m.id, status: 'sent', provider_ref: ref ?? undefined, sent_at: new Date().toISOString() })
        log.info(`sent ${m.to_number} ref=${ref ?? '-'}`)
      } catch (e) {
        results.push({ id: m.id, status: 'failed', error: String(e).slice(0, 480) })
        log.warn(`send failed ${m.to_number}: ${String(e)}`)
      }
    }
    return results
  }

  private async inboxLoop(): Promise<void> {
    while (!this.stopped) {
      try {
        const stored = await this.modem.readStored()
        const inbound: unknown[] = []
        const reports: unknown[] = []
        for (const s of stored) {
          const decoded = this.modem.decode(s.pdu)
          if (!decoded) {
            await this.modem.deleteStored(s.index)
            continue
          }
          if (decoded.type === 'status') {
            reports.push({
              provider_ref: String(decoded.reference),
              status: decoded.delivered ? 'delivered' : decoded.failed ? 'failed' : 'delivered',
            })
          } else {
            let text: string | null = decoded.text
            if (decoded.concat) {
              text = this.concat.add(
                decoded.concat.ref,
                decoded.concat.seq,
                decoded.concat.total,
                decoded.sender,
                decoded.text,
                decoded.timestamp,
              )
            }
            if (text !== null) {
              inbound.push({ from: decoded.sender, body: text, received_at: decoded.timestamp ?? undefined })
            }
          }
          await this.modem.deleteStored(s.index)
        }
        if (inbound.length) await withRetry(() => this.portal.pushInbox(inbound), 'push inbox')
        if (reports.length) await withRetry(() => this.portal.reportDelivery(reports), 'report delivery')
      } catch (e) {
        log.warn('inbox loop error', String(e))
      }
      await this.sleep(this.config.inboxPollMs)
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms))
  }
}
