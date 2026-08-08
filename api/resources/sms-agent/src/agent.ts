import { AGENT_VERSION, type Config } from './config.js'
import { log, logTail, logsSince, runId } from './logger.js'
import { Modem, type ModemInfo } from './modem.js'
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
  private info: ModemInfo = { imei: null, model: null, ownNumber: null }

  /** Consecutive failed modem probes; two in a row triggers a reconnect attempt. */
  private modemMisses = 0
  private heartbeatInFlight = false

  private streamingLogs = false
  private logPushInFlight = false
  private lastPushedSeq = 0

  constructor(private config: Config, modem: Modem) {
    this.modem = modem
    this.portal = new Portal(config.apiBaseUrl, config.token)
  }

  async start(): Promise<void> {
    await this.modem.init()
    this.info = await this.modem.info()
    log.info(
      `Modem ready: model=${this.info.model ?? '?'} imei=${this.info.imei ?? '?'} number=${this.info.ownNumber ?? '?'}`,
    )

    // Kick each loop; they self-schedule.
    void this.heartbeatLoop()
    void this.outboxLoop()
    void this.inboxLoop()
  }

  stop(): void {
    this.stopped = true
  }

  private async heartbeatLoop(): Promise<void> {
    while (!this.stopped) {
      await this.publishHeartbeat()
      await this.sleep(this.config.heartbeatMs)
    }
  }

  /**
   * Probe the modem, then report presence + telemetry. Also called out of band
   * when an admin presses **Refresh** in the portal, hence the in-flight guard:
   * two overlapping runs would queue duplicate AT traffic behind each other.
   */
  private async publishHeartbeat(forceRecover = false): Promise<void> {
    if (this.heartbeatInFlight) return
    this.heartbeatInFlight = true
    try {
      const health = await this.checkModem(forceRecover)

      let signal: number | null = null
      let operator: string | null = null
      let balance: string | null = null

      // Only worth asking when the modem answered — otherwise every one of these
      // burns its full timeout to return null.
      if (health.connected) {
        ;[signal, operator] = await Promise.all([this.modem.signal(), this.modem.operator()])
        if (this.config.ussdBalanceCode) {
          balance = await this.modem.balance(this.config.ussdBalanceCode)
        }
      }

      await withRetry(
        () =>
          this.portal.heartbeat({
            online: true,
            modem_connected: health.connected,
            modem_error: health.error ?? undefined,
            modem_port: this.modem.portPath,
            signal_strength: signal ?? undefined,
            network_operator: operator ?? undefined,
            sim_msisdn: this.info.ownNumber ?? undefined,
            sim_balance: balance ?? undefined,
            imei: this.info.imei ?? undefined,
            modem_model: this.info.model ?? undefined,
            platform: this.config.platform,
            agent_version: AGENT_VERSION,
          }),
        'heartbeat',
      )
    } finally {
      this.heartbeatInFlight = false
    }
  }

  /**
   * Answer the one question the portal cares about: is the modem actually
   * there? On a second consecutive miss, try to bring the link back — a modem
   * that was unplugged and plugged in again would otherwise stay dead until
   * someone restarted the service. `forceRecover` skips that grace period, so
   * an admin who just re-seated the cable and pressed Refresh gets the retry
   * on the first press rather than the second.
   */
  private async checkModem(forceRecover = false): Promise<{ connected: boolean; error: string | null }> {
    if (await this.modem.ping()) {
      if (this.modemMisses > 0) log.info('Modem responding again')
      this.modemMisses = 0
      return { connected: true, error: null }
    }

    this.modemMisses++
    const where = this.modem.portPath
    log.warn(`Modem did not answer AT on ${where} (miss ${this.modemMisses})`)

    if (forceRecover || this.modemMisses >= 2) {
      try {
        log.info('Attempting to reconnect to the modem…')
        await this.modem.reconnect()
        this.info = await this.modem.info()
        this.modemMisses = 0
        log.info(`Modem reconnected on ${this.modem.portPath}`)
        return { connected: true, error: null }
      } catch (e) {
        return {
          connected: false,
          error: `no modem on ${where} — reconnect failed: ${String(e).slice(0, 160)}`,
        }
      }
    }

    return { connected: false, error: `no response to AT on ${where}` }
  }

  private async outboxLoop(): Promise<void> {
    while (!this.stopped) {
      const result = await withRetry(() => this.portal.claimOutbox(this.config.outboxBatch), 'claim outbox')
      if (result?.commands.length) {
        this.handleCommands(result.commands)
      }
      if (result?.messages.length) {
        log.info(`Sending ${result.messages.length} message(s)`)
        const results = await this.sendBatch(result.messages)
        await withRetry(() => this.portal.reportStatus(results), 'report status')
      }
      await this.sleep(this.config.outboxPollMs)
    }
  }

  /**
   * Act on what the portal asked for on the last poll. Deliberately not awaited
   * by the caller — a USSD balance query can take 15s and must not hold up the
   * outbox.
   */
  private handleCommands(commands: string[]): void {
    if (commands.includes('refresh')) {
      log.info('Portal requested a status refresh')
      void this.publishHeartbeat(true)
    }

    // The portal only asks for logs while someone has the viewer open. The
    // first ask sends the whole buffered tail; after that just what's new.
    const wantsLogs = commands.includes('logs')
    if (wantsLogs) void this.flushLogs(!this.streamingLogs)
    this.streamingLogs = wantsLogs
  }

  private async flushLogs(fullTail: boolean): Promise<void> {
    if (this.logPushInFlight) return
    const lines = fullTail ? logTail() : logsSince(this.lastPushedSeq)
    if (!lines.length) return

    this.logPushInFlight = true
    try {
      const highest = lines[lines.length - 1].seq
      await this.portal.pushLogs(runId(), lines)
      this.lastPushedSeq = Math.max(this.lastPushedSeq, highest)
    } catch (e) {
      // Not retried: the next poll is 5s away and will carry these lines again.
      log.debug('push logs failed', String(e))
    } finally {
      this.logPushInFlight = false
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
