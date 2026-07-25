import { SerialPort } from 'serialport'
import { log } from './logger.js'
import { decodePdu, encodeSubmit, type DecodedPdu } from './pdu.js'

export interface ModemInfo {
  imei: string | null
  model: string | null
  ownNumber: string | null
}

export interface StoredMessage {
  index: number
  pdu: string
}

/**
 * Thin AT-command driver over a serial port. Serializes commands (one at a time),
 * assembles CRLF-delimited lines, and understands the `>` prompt used by CMGS.
 */
export class Modem {
  private port: SerialPort | null = null
  private buffer = ''
  private lineWaiters: ((line: string) => void)[] = []
  private promptWaiters: (() => void)[] = []
  private busy: Promise<unknown> = Promise.resolve()

  constructor(private path: string, private baud: number, private mode: 'pdu' | 'text') {}

  async open(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.port = new SerialPort({ path: this.path, baudRate: this.baud }, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
    this.port!.on('data', (chunk: Buffer) => this.onData(chunk))
    this.port!.on('error', (err) => log.error('serial error', err.message))
  }

  close(): void {
    this.port?.close()
    this.port = null
  }

  private onData(chunk: Buffer): void {
    this.buffer += chunk.toString('latin1')
    // The CMGS prompt "> " has no CRLF — release prompt waiters when we see it.
    if (this.buffer.includes('> ') && this.promptWaiters.length) {
      this.buffer = this.buffer.replace('> ', '')
      this.promptWaiters.shift()!()
    }
    let idx: number
    while ((idx = this.buffer.indexOf('\r\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim()
      this.buffer = this.buffer.slice(idx + 2)
      if (line.length) this.dispatchLine(line)
    }
  }

  private unsolicited: ((line: string) => void) | null = null
  onUnsolicited(cb: (line: string) => void): void {
    this.unsolicited = cb
  }

  private dispatchLine(line: string): void {
    if (this.lineWaiters.length) {
      this.lineWaiters.shift()!(line)
    } else if (this.unsolicited) {
      this.unsolicited(line)
    }
  }

  private write(data: string): void {
    this.port?.write(Buffer.from(data, 'latin1'))
  }

  /** Run a command, collecting lines until OK / ERROR. Serialized against other commands. */
  async command(cmd: string, timeoutMs = 8000): Promise<string[]> {
    const run = () => this.rawCommand(cmd, timeoutMs)
    const result = this.busy.then(run, run)
    this.busy = result.catch(() => {})
    return result
  }

  private rawCommand(cmd: string, timeoutMs: number): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
      const lines: string[] = []
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error(`AT timeout: ${cmd}`))
      }, timeoutMs)
      const handler = (line: string) => {
        if (line === 'OK') {
          cleanup()
          resolve(lines)
        } else if (line === 'ERROR' || line.startsWith('+CME ERROR') || line.startsWith('+CMS ERROR')) {
          cleanup()
          reject(new Error(`${cmd} -> ${line}`))
        } else if (line !== cmd) {
          lines.push(line)
          this.lineWaiters.unshift(handler)
        }
      }
      const cleanup = () => {
        clearTimeout(timer)
        const i = this.lineWaiters.indexOf(handler)
        if (i >= 0) this.lineWaiters.splice(i, 1)
      }
      this.lineWaiters.push(handler)
      log.debug('>>', cmd)
      this.write(cmd + '\r')
    })
  }

  async init(): Promise<void> {
    await this.command('ATE0') // echo off
    await this.command('AT+CMEE=1') // numeric error codes
    await this.command(`AT+CMGF=${this.mode === 'pdu' ? 0 : 1}`)
    if (this.mode === 'text') {
      await this.command('AT+CSCS="GSM"')
      await this.command('AT+CSMP=49,167,0,0') // request delivery report in text mode
    }
    // Store incoming + status reports; we poll storage rather than relying on push.
    await this.command('AT+CPMS="ME","ME","ME"').catch(() => this.command('AT+CPMS="SM","SM","SM"'))
    await this.command('AT+CNMI=2,0,0,2,0').catch((e) => log.warn('CNMI set failed', String(e)))
  }

  async info(): Promise<ModemInfo> {
    const imei = (await this.command('AT+CGSN').catch(() => []))[0] ?? null
    const model = (await this.command('AT+CGMM').catch(() => []))[0] ?? null
    let ownNumber: string | null = null
    try {
      const cnum = await this.command('AT+CNUM')
      const line = cnum.find((l) => l.startsWith('+CNUM'))
      const m = line?.match(/"([^"]*)","([^"]+)"/)
      ownNumber = m?.[2] ?? null
    } catch {
      /* not all SIMs expose own number */
    }
    return { imei, model, ownNumber }
  }

  /** Signal quality: AT+CSQ -> rssi 0..31 (99 = unknown). */
  async signal(): Promise<number | null> {
    try {
      const res = await this.command('AT+CSQ')
      const m = res.join(' ').match(/\+CSQ:\s*(\d+)/)
      return m ? Number(m[1]) : null
    } catch {
      return null
    }
  }

  async operator(): Promise<string | null> {
    try {
      const res = await this.command('AT+COPS?')
      const m = res.join(' ').match(/\+COPS:\s*\d+,\d+,"([^"]+)"/)
      return m?.[1] ?? null
    } catch {
      return null
    }
  }

  /** Query prepaid balance via USSD. Best-effort; carrier-specific formatting. */
  async balance(ussd: string): Promise<string | null> {
    try {
      const res = await this.command(`AT+CUSD=1,"${ussd}",15`, 15000)
      const m = res.join('\n').match(/\+CUSD:\s*\d+,"([^"]*)"/)
      return m?.[1]?.replace(/\s+/g, ' ').trim() ?? null
    } catch {
      return null
    }
  }

  /**
   * Send a message. Returns the modem message reference(s) from +CMGS, used as
   * provider_ref for delivery-report matching. Multi-part returns the first ref.
   */
  async send(destination: string, text: string): Promise<string | null> {
    if (this.mode === 'text') return this.sendText(destination, text)
    const parts = encodeSubmit(destination, text)
    let firstRef: string | null = null
    for (const part of parts) {
      const ref = await this.sendPdu(part.pdu, part.tpduLength)
      if (firstRef === null) firstRef = ref
    }
    return firstRef
  }

  private async sendPdu(pdu: string, tpduLength: number): Promise<string | null> {
    return this.enqueuePromptCommand(`AT+CMGS=${tpduLength}`, pdu + '\x1a')
  }

  private async sendText(destination: string, text: string): Promise<string | null> {
    return this.enqueuePromptCommand(`AT+CMGS="${destination}"`, text + '\x1a')
  }

  /** Serialize a two-step CMGS: command, wait for `>` prompt, write payload + Ctrl-Z. */
  private enqueuePromptCommand(cmd: string, payload: string): Promise<string | null> {
    const run = () =>
      new Promise<string | null>((resolve, reject) => {
        const lines: string[] = []
        const timer = setTimeout(() => {
          cleanup()
          reject(new Error(`CMGS timeout: ${cmd}`))
        }, 30000)
        const handler = (line: string) => {
          if (line === 'OK') {
            cleanup()
            const ref = lines.join(' ').match(/\+CMGS:\s*(\d+)/)?.[1] ?? null
            resolve(ref)
          } else if (line === 'ERROR' || line.startsWith('+CME ERROR') || line.startsWith('+CMS ERROR')) {
            cleanup()
            reject(new Error(`${cmd} -> ${line}`))
          } else {
            lines.push(line)
            this.lineWaiters.unshift(handler)
          }
        }
        const cleanup = () => {
          clearTimeout(timer)
          const i = this.lineWaiters.indexOf(handler)
          if (i >= 0) this.lineWaiters.splice(i, 1)
        }
        this.promptWaiters.push(() => {
          this.lineWaiters.push(handler)
          this.write(payload)
        })
        log.debug('>>', cmd)
        this.write(cmd + '\r')
      })
    const result = this.busy.then(run, run)
    this.busy = result.catch(() => {})
    return result
  }

  /** List all stored PDUs (incoming messages + stored status reports). */
  async readStored(): Promise<StoredMessage[]> {
    if (this.mode !== 'pdu') return []
    const res = await this.command('AT+CMGL=4', 15000).catch(() => [])
    const out: StoredMessage[] = []
    for (let i = 0; i < res.length; i++) {
      const header = res[i].match(/\+CMGL:\s*(\d+)/)
      if (header && res[i + 1]) {
        out.push({ index: Number(header[1]), pdu: res[i + 1].trim() })
        i++
      }
    }
    return out
  }

  async deleteStored(index: number): Promise<void> {
    await this.command(`AT+CMGD=${index}`).catch(() => {})
  }

  decode(pdu: string): DecodedPdu | null {
    try {
      return decodePdu(pdu)
    } catch (e) {
      log.warn('PDU decode failed', String(e))
      return null
    }
  }
}

/** Probe candidate serial ports with `AT` and return the first that answers `OK`. */
export async function autoDetectPort(baud: number): Promise<string | null> {
  const ports = await SerialPort.list()
  const candidates = ports
    .map((p) => p.path)
    .filter((p) => /ttyUSB|ttyACM|COM|wwan|modem|serial/i.test(p))
  for (const path of candidates) {
    const ok = await probe(path, baud)
    if (ok) {
      log.info(`Modem responds on ${path}`)
      return path
    }
  }
  return null
}

function probe(path: string, baud: number): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false
    const finish = (v: boolean) => {
      if (done) return
      done = true
      try {
        port.close()
      } catch {
        /* ignore */
      }
      resolve(v)
    }
    const port = new SerialPort({ path, baudRate: baud }, (err) => {
      if (err) return finish(false)
      port.write('AT\r')
    })
    let buf = ''
    port.on('data', (c: Buffer) => {
      buf += c.toString('latin1')
      if (buf.includes('OK')) finish(true)
    })
    port.on('error', () => finish(false))
    setTimeout(() => finish(false), 1500)
  })
}

export async function listPorts(): Promise<void> {
  const ports = await SerialPort.list()
  for (const p of ports) {
    log.info(`${p.path}  ${p.manufacturer ?? ''} ${p.productId ? `(pid ${p.productId})` : ''}`)
  }
}
