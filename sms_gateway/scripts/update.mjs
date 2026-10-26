#!/usr/bin/env node
// Self-update for the SMS gateway agent: `npm run update` (add `-- --yes` to
// skip the menu). Asks the portal — over this kiosk's own gateway token — which
// agent version it serves, offers to install it, then rebuilds and restarts the
// service. Kiosks run from an extracted zip, so there is no git to pull from.
//
// The kiosk's .env / sms-gateway.env, node_modules and logs are never touched.
// If the new version fails to build, the previous files are put back and the
// running service is left alone.

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { platform } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const BACKUP_DIR = join(APP_DIR, '.update-backup')
const KEEP = new Set(['.env', 'sms-gateway.env', 'node_modules', 'dist', '.update-backup', 'agent.log'])
const isWin = platform() === 'win32'
const autoYes = process.argv.includes('--yes') || process.argv.includes('-y')

// Writing /opt/sms_gateway and restarting the systemd unit both need root.
if (!isWin && typeof process.getuid === 'function' && process.getuid() !== 0) {
  const r = spawnSync('sudo', [process.execPath, fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: 'inherit',
  })
  process.exit(r.status ?? 1)
}

function fail(message) {
  console.error(`\n✖ ${message}`)
  process.exit(1)
}

function readEnv() {
  const file = [join(APP_DIR, '.env'), join(APP_DIR, 'sms-gateway.env')].find((f) => existsSync(f))
  if (!file) fail('No .env or sms-gateway.env found next to the agent.')
  const env = {}
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return env
}

function localVersion() {
  try {
    return JSON.parse(readFileSync(join(APP_DIR, 'package.json'), 'utf8')).version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

/** -1 / 0 / 1 comparing dotted numeric versions ("0.10.0" > "0.9.3"). */
function compareVersions(a, b) {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

async function api(path, timeoutMs) {
  const { API_BASE_URL, SMS_GATEWAY_TOKEN } = readEnv()
  if (!API_BASE_URL) fail('API_BASE_URL is not set in the env file.')
  if (!SMS_GATEWAY_TOKEN) fail('This kiosk is not paired yet — pair it first (npm run pair -- <CODE>).')
  let res
  try {
    res = await fetch(`${API_BASE_URL.replace(/\/+$/, '')}${path}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${SMS_GATEWAY_TOKEN}` },
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (e) {
    fail(`Could not reach the portal (${e?.cause?.code ?? e?.message ?? e}). Check the kiosk's internet.`)
  }
  if (res.status === 404) fail('The portal does not offer agent updates yet. Install this version by hand once.')
  if (!res.ok) fail(`The portal answered ${res.status} ${res.statusText}.`)
  return res.json()
}

function run(cmd, args) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`)
  // npm/npx are .cmd shims on Windows, which only resolve through a shell.
  return spawnSync(cmd, args, { cwd: APP_DIR, stdio: 'inherit', shell: isWin }).status === 0
}

/** Same steps as deploy/install.sh and deploy/install.ps1. */
function build() {
  if (isWin) return run('npm', ['install']) && run('npx', ['tsc', '-p', 'tsconfig.json'])
  return (
    run('npm', ['install', '--omit=dev']) &&
    run('npm', ['install', '--no-save', 'typescript']) &&
    run('npx', ['tsc', '-p', 'tsconfig.json'])
  )
}

/** Top-level entries the update may replace — everything but the kiosk's own state. */
function replaceable() {
  return readdirSync(APP_DIR).filter((name) => !KEEP.has(name))
}

function backup() {
  rmSync(BACKUP_DIR, { recursive: true, force: true })
  mkdirSync(BACKUP_DIR)
  for (const name of replaceable()) cpSync(join(APP_DIR, name), join(BACKUP_DIR, name), { recursive: true })
}

function restore() {
  for (const name of replaceable()) rmSync(join(APP_DIR, name), { recursive: true, force: true })
  for (const name of readdirSync(BACKUP_DIR)) cpSync(join(BACKUP_DIR, name), join(APP_DIR, name), { recursive: true })
}

function listFiles(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)],
  )
}

function install(files) {
  const incoming = new Set(files.map((f) => f.path))
  for (const f of files) {
    // The portal only ever sends relative paths inside the agent; refuse anything else.
    const target = join(APP_DIR, f.path)
    if (f.path.startsWith('/') || relative(APP_DIR, target).startsWith('..') || KEEP.has(f.path.split('/')[0])) {
      continue
    }
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, Buffer.from(f.content, 'base64'))
  }
  // A source file the new version dropped would still be compiled into dist/.
  for (const file of listFiles(join(APP_DIR, 'src'))) {
    if (!incoming.has(relative(APP_DIR, file).split(sep).join('/'))) rmSync(file)
  }
}

async function confirm() {
  if (autoYes) return true
  console.log('\n  1) Update now')
  console.log('  2) Cancel\n')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = (await rl.question('Choose 1 or 2: ')).trim()
  rl.close()
  return answer === '1' || /^y(es)?$/i.test(answer)
}

const current = localVersion()
console.log('ScholasticCloud SMS Gateway — updater')
console.log(`  Installed version: ${current}`)

const { version: latest } = await api('/sms-gateway/agent/version', 15000)
if (!latest) fail('The portal has no agent bundle to offer right now.')
console.log(`  Latest version:    ${latest}`)

if (compareVersions(current, latest) >= 0) {
  console.log('\n✔ This kiosk is already up to date.')
  process.exit(0)
}

if (!(await confirm())) {
  console.log('Cancelled — nothing was changed.')
  process.exit(0)
}

console.log(`\nDownloading ${latest}…`)
const bundle = await api('/sms-gateway/agent/bundle', 120000)
if (!Array.isArray(bundle.files) || !bundle.files.length) fail('The portal sent an empty bundle.')

// Keep the files owned by the service user (smsgw on Linux), not by root.
const owner = isWin ? null : statSync(join(APP_DIR, 'package.json'))

function ctl(action) {
  spawnSync(process.execPath, [join(APP_DIR, 'scripts', 'ctl.mjs'), action], { cwd: APP_DIR, stdio: 'inherit' })
}

backup()
install(bundle.files)
// A running agent on Windows holds serialport's native module open, so npm
// can't replace it. Linux doesn't care; the service keeps running until restart.
if (isWin) ctl('stop')

if (!build()) {
  console.error('\nThe new version failed to build — putting the previous version back.')
  restore()
  rmSync(BACKUP_DIR, { recursive: true, force: true })
  build()
  if (owner) spawnSync('chown', ['-R', `${owner.uid}:${owner.gid}`, APP_DIR])
  if (isWin) ctl('start')
  fail(`Update to ${bundle.version ?? latest} failed. The kiosk is still running ${current}.`)
}

if (owner) spawnSync('chown', ['-R', `${owner.uid}:${owner.gid}`, APP_DIR])
rmSync(BACKUP_DIR, { recursive: true, force: true })

console.log('\nRestarting the agent…')
ctl('restart')
console.log(`\n✔ Updated ${current} → ${bundle.version ?? latest}.`)
