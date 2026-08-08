type Level = 'debug' | 'info' | 'warn' | 'error'

const ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 }

let threshold: Level = 'info'

export function setLogLevel(level: Level): void {
  threshold = level
}

export interface LogLine {
  seq: number
  ts: string
  level: Level
  text: string
}

/**
 * In-memory tail of everything this process has logged — the same lines
 * `npm run logs` shows, kept so the portal can display them without anyone
 * SSHing into the kiosk. Nothing is written to disk here; on restart the
 * buffer starts empty and `RUN_ID` changes so the portal knows not to stitch
 * the new sequence onto the old one.
 */
const BUFFER_MAX = 500
const buffer: LogLine[] = []
let seq = 0

const RUN_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export function runId(): string {
  return RUN_ID
}

/** The most recent `count` lines — what a viewer sees when it first opens. */
export function logTail(count = 200): LogLine[] {
  return buffer.slice(-count)
}

/** Lines newer than `since`, capped, for incremental pushes. */
export function logsSince(since: number, limit = 200): LogLine[] {
  const fresh = buffer.filter((l) => l.seq > since)
  return fresh.length > limit ? fresh.slice(-limit) : fresh
}

function render(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a
      if (a instanceof Error) return a.message
      try {
        return JSON.stringify(a)
      } catch {
        return String(a)
      }
    })
    .join(' ')
}

function emit(level: Level, args: unknown[]): void {
  if (ORDER[level] < ORDER[threshold]) return
  const ts = new Date().toISOString()
  const text = render(args)

  buffer.push({ seq: ++seq, ts, level, text })
  if (buffer.length > BUFFER_MAX) buffer.splice(0, buffer.length - BUFFER_MAX)

  const line = `${ts} [${level.toUpperCase()}]`
  // eslint-disable-next-line no-console
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  fn(line, text)
}

export const log = {
  debug: (...a: unknown[]) => emit('debug', a),
  info: (...a: unknown[]) => emit('info', a),
  warn: (...a: unknown[]) => emit('warn', a),
  error: (...a: unknown[]) => emit('error', a),
}
