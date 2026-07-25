import { AGENT_VERSION, loadConfig, persistToken } from './config.js'
import { log, setLogLevel } from './logger.js'
import { Modem, autoDetectPort, listPorts } from './modem.js'
import { Portal } from './portal.js'
import { Agent } from './agent.js'

async function main(): Promise<void> {
  const config = loadConfig()
  setLogLevel(config.logLevel)
  const args = process.argv.slice(2)

  if (args.includes('--list-ports')) {
    await listPorts()
    return
  }

  if (!config.apiBaseUrl) {
    log.error('API_BASE_URL is not set. Copy .env.example to .env and configure it.')
    process.exit(1)
  }

  // ── Pairing mode: exchange a pairing code for a long-lived token ──────────
  const pairIdx = args.indexOf('--pair')
  if (pairIdx >= 0) {
    const code = args[pairIdx + 1]
    if (!code) {
      log.error('Usage: npm run pair -- <PAIRING_CODE>')
      process.exit(1)
    }
    const portal = new Portal(config.apiBaseUrl, '')
    // Probe the modem so we can register IMEI/model at pairing time (best-effort).
    const meta: Record<string, unknown> = { platform: config.platform, agent_version: AGENT_VERSION }
    try {
      const path = config.serialPort ?? (await autoDetectPort(config.serialBaud))
      if (path) {
        const modem = new Modem(path, config.serialBaud, config.smsMode)
        await modem.open()
        await modem.init()
        const info = await modem.info()
        meta.imei = info.imei ?? undefined
        meta.modem_model = info.model ?? undefined
        modem.close()
      }
    } catch (e) {
      log.warn('Could not read modem info during pairing (continuing):', String(e))
    }
    const result = await portal.pair(code, meta)
    persistToken(result.token)
    log.info(`Paired. gateway_id=${result.gateway_id}. Token saved to .env. Start the agent with: npm start`)
    return
  }

  // ── Normal run ────────────────────────────────────────────────────────────
  if (!config.token) {
    log.error('Not paired yet. Run: npm run pair -- <PAIRING_CODE>')
    process.exit(1)
  }

  const path = config.serialPort ?? (await autoDetectPort(config.serialBaud))
  if (!path) {
    log.error('No GSM modem found. Set SERIAL_PORT in .env or check the USB connection.')
    process.exit(1)
  }

  const modem = new Modem(path, config.serialBaud, config.smsMode)
  await modem.open()
  log.info(`Serial open on ${path} @ ${config.serialBaud} (${config.smsMode} mode)`)

  const agent = new Agent(config, modem)
  await agent.start()
  log.info('SMS gateway agent running. Heartbeat + outbox + inbox loops active.')

  const shutdown = () => {
    log.info('Shutting down…')
    agent.stop()
    modem.close()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((e) => {
  log.error('Fatal:', e instanceof Error ? e.message : String(e))
  process.exit(1)
})
