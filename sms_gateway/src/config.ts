import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import dotenv from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Prefer `.env`, but accept the portal-downloaded `sms-gateway.env` as-is so the
// pre-filled config is drop-in with no rename. Writes go to whichever exists.
function resolveEnvPath(): string {
  const primary = join(__dirname, '..', '.env')
  const alt = join(__dirname, '..', 'sms-gateway.env')
  if (!existsSync(primary) && existsSync(alt)) return alt
  return primary
}

export const ENV_PATH = resolveEnvPath()

dotenv.config({ path: ENV_PATH })

function num(value: string | undefined, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export interface Config {
  apiBaseUrl: string
  token: string
  serialPort: string | null
  serialBaud: number
  smsMode: 'pdu' | 'text'
  outboxPollMs: number
  inboxPollMs: number
  heartbeatMs: number
  outboxBatch: number
  ussdBalanceCode: string | null
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  platform: 'linux' | 'windows' | 'unknown'
}

/**
 * Re-read the .env from disk and return a fresh Config. Used to pick up a token
 * written by a separate `npm run pair` run without restarting the service.
 * `override: true` makes dotenv replace the already-loaded process.env values.
 */
export function reloadConfig(): Config {
  dotenv.config({ path: ENV_PATH, override: true })
  return loadConfig()
}

export function loadConfig(): Config {
  const platform =
    process.platform === 'win32' ? 'windows' : process.platform === 'linux' ? 'linux' : 'unknown'

  return {
    apiBaseUrl: (process.env.API_BASE_URL ?? '').replace(/\/+$/, ''),
    token: process.env.SMS_GATEWAY_TOKEN ?? '',
    serialPort: process.env.SERIAL_PORT?.trim() || null,
    serialBaud: num(process.env.SERIAL_BAUD, 115200),
    smsMode: process.env.SMS_MODE === 'text' ? 'text' : 'pdu',
    outboxPollMs: num(process.env.OUTBOX_POLL_MS, 5000),
    inboxPollMs: num(process.env.INBOX_POLL_MS, 10000),
    heartbeatMs: num(process.env.HEARTBEAT_MS, 45000),
    outboxBatch: num(process.env.OUTBOX_BATCH, 10),
    ussdBalanceCode: process.env.USSD_BALANCE_CODE?.trim() || null,
    logLevel: (process.env.LOG_LEVEL as Config['logLevel']) ?? 'info',
    platform,
  }
}

/**
 * Persist the paired token back into .env so it survives restarts. Keeps every
 * other line intact; replaces or appends SMS_GATEWAY_TOKEN.
 */
export function persistToken(token: string): void {
  let contents = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : ''
  if (/^SMS_GATEWAY_TOKEN=.*$/m.test(contents)) {
    contents = contents.replace(/^SMS_GATEWAY_TOKEN=.*$/m, `SMS_GATEWAY_TOKEN=${token}`)
  } else {
    contents += `${contents.endsWith('\n') || contents === '' ? '' : '\n'}SMS_GATEWAY_TOKEN=${token}\n`
  }
  writeFileSync(ENV_PATH, contents, 'utf8')
}

export const AGENT_VERSION = '0.1.0'
