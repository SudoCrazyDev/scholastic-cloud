#!/usr/bin/env node
// Cross-platform service control for the SMS gateway agent.
// On Linux it drives the systemd unit `sms-gateway`; on Windows it drives the
// Scheduled Task `ScholasticCloudSmsGateway`. Invoked via the npm scripts
// (npm run enable-start | restart | stop | status | logs).

import { spawnSync } from 'node:child_process'
import { platform } from 'node:os'

const action = process.argv[2]
const SERVICE = 'sms-gateway'
const TASK = 'ScholasticCloudSmsGateway'
const isWin = platform() === 'win32'

function exec(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' })
  process.exit(r.status ?? 1)
}

// On Linux, prepend sudo when not already root so `npm run enable-start` just works.
function sysctl(args) {
  const needsSudo = typeof process.getuid === 'function' && process.getuid() !== 0
  return needsSudo ? exec('sudo', args) : exec(args[0], args.slice(1))
}

function ps(command) {
  return exec('powershell', ['-NoProfile', '-Command', command])
}

const linux = {
  'enable-start': () => sysctl(['systemctl', 'enable', '--now', SERVICE]),
  start: () => sysctl(['systemctl', 'start', SERVICE]),
  stop: () => sysctl(['systemctl', 'stop', SERVICE]),
  restart: () => sysctl(['systemctl', 'restart', SERVICE]),
  status: () => sysctl(['systemctl', 'status', SERVICE, '--no-pager']),
  logs: () => sysctl(['journalctl', '-u', SERVICE, '-n', '50', '-f']),
}

const windows = {
  'enable-start': () => ps(`Start-ScheduledTask -TaskName ${TASK}`),
  start: () => ps(`Start-ScheduledTask -TaskName ${TASK}`),
  stop: () => ps(`Stop-ScheduledTask -TaskName ${TASK}`),
  restart: () => ps(`Stop-ScheduledTask -TaskName ${TASK}; Start-Sleep -Seconds 1; Start-ScheduledTask -TaskName ${TASK}`),
  status: () => ps(`Get-ScheduledTask -TaskName ${TASK} | Format-List TaskName,State`),
  logs: () => ps('if (Test-Path agent.log) { Get-Content agent.log -Tail 50 -Wait } else { Write-Host "agent.log not found yet." }'),
}

const table = isWin ? windows : linux
const handler = table[action]

if (!handler) {
  console.error(`Unknown action "${action ?? ''}". Use one of: ${Object.keys(table).join(', ')}`)
  process.exit(1)
}

handler()
