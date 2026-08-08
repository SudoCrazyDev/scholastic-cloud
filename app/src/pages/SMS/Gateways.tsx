import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import {
  Smartphone, Plus, Trash2, RefreshCw, Wifi, WifiOff, HelpCircle, Copy, Check, Signal, Download,
  Usb, Unplug, Terminal, X,
} from 'lucide-react'
import { smsService, type SmsGatewayLogLine } from '../../services/smsService'
import { Button } from '../../components/button'
import { Input } from '../../components/input'
import { Dialog } from '../../components/dialog'
import type { SmsGateway } from '../../types'

const StatusBadge: React.FC<{ status: SmsGateway['status'] }> = ({ status }) => {
  if (status === 'online') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <Wifi className="w-3 h-3" /> Online
      </span>
    )
  }
  if (status === 'offline') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
        <WifiOff className="w-3 h-3" /> Offline
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
      <HelpCircle className="w-3 h-3" /> Unknown
    </span>
  )
}

/**
 * Whether the USB modem itself answered its last check — a different question
 * from whether the kiosk is online. A running agent with an unplugged dongle
 * reports Online + Disconnected, which is exactly the case worth spotting.
 */
const ModemBadge: React.FC<{ gateway: SmsGateway; checking: boolean }> = ({ gateway, checking }) => {
  if (checking) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600">
        <RefreshCw className="w-3 h-3 animate-spin" /> Checking…
      </span>
    )
  }
  if (gateway.modem_connected === true) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <Usb className="w-3 h-3" /> Connected
      </span>
    )
  }
  if (gateway.modem_connected === false) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700"
        title={gateway.modem_error ?? undefined}
      >
        <Unplug className="w-3 h-3" /> Disconnected
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500"
      title="No modem check reported yet. Agents older than 0.2.0 do not send one."
    >
      <HelpCircle className="w-3 h-3" /> Unknown
    </span>
  )
}

const LEVEL_CLASS: Record<SmsGatewayLogLine['level'], string> = {
  debug: 'text-zinc-500',
  info: 'text-zinc-300',
  warn: 'text-amber-300',
  error: 'text-red-400',
}

/**
 * Live tail of the kiosk agent's log — what `npm run logs` shows on the device,
 * without needing a shell on it. Nothing is stored: the agent keeps its last
 * few hundred lines in memory and pushes them only while this is open, and the
 * server holds them in a short-lived cache entry.
 */
const LogViewer: React.FC<{ gateway: SmsGateway; onClose: () => void }> = ({ gateway, onClose }) => {
  const [lines, setLines] = useState<SmsGatewayLogLine[]>([])
  const [loaded, setLoaded] = useState(false)
  const [agentOnline, setAgentOnline] = useState(true)
  const [follow, setFollow] = useState(true)
  const runIdRef = useRef<string | null>(null)
  const sinceRef = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Polling is also what keeps the agent pushing — the server treats each read
  // as "someone is watching" and stops asking ~45s after this closes.
  useEffect(() => {
    let cancelled = false

    const tick = async () => {
      try {
        const res = await smsService.getGatewayLogs(gateway.id, sinceRef.current)
        if (cancelled) return
        const payload = res.data
        setAgentOnline(payload.agent_online)

        // A restarted agent numbers its lines from 1 again, so start over
        // rather than stitching the new run onto the tail of the old one.
        if (payload.run_id && runIdRef.current && payload.run_id !== runIdRef.current) {
          runIdRef.current = payload.run_id
          sinceRef.current = 0
          setLines([])
          return
        }
        runIdRef.current = payload.run_id

        if (payload.lines.length) {
          sinceRef.current = payload.lines[payload.lines.length - 1].seq
          setLines((prev) => [...prev, ...payload.lines].slice(-500))
        }
      } catch {
        /* transient — the next tick retries */
      } finally {
        if (!cancelled) setLoaded(true)
      }
    }

    void tick()
    const timer = setInterval(tick, 3000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [gateway.id])

  useEffect(() => {
    if (follow && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines, follow])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 40)
  }

  return (
    <Dialog open size="4xl" onClose={onClose}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-indigo-600" /> Agent log — {gateway.name}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Live tail from the kiosk, refreshed every few seconds. Not stored — closing this stops it.
          </p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="Close">
          <X className="w-4 h-4" />
        </button>
      </div>

      {!agentOnline && (
        <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          This kiosk has not checked in recently. You are seeing whatever it sent last, if anything.
        </p>
      )}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="mt-3 h-96 overflow-auto rounded-lg bg-zinc-900 p-3 font-mono text-xs leading-relaxed"
      >
        {lines.length === 0 && (
          <p className="text-zinc-500">
            {loaded
              ? 'Waiting for the kiosk to send its log tail — it pushes within a few seconds of this opening.'
              : 'Loading…'}
          </p>
        )}
        {lines.map((line) => (
          <div key={`${line.seq}-${line.ts}`} className="whitespace-pre-wrap break-words">
            <span className="text-zinc-600">{new Date(line.ts).toLocaleTimeString()} </span>
            <span className={LEVEL_CLASS[line.level]}>
              [{line.level.toUpperCase()}] {line.text}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
        <span>
          {lines.length} line{lines.length === 1 ? '' : 's'}
          {!follow && ' · scrolled up, auto-follow paused'}
        </span>
        <button
          onClick={() => {
            setLines([])
            setFollow(true)
          }}
          className="text-indigo-600 hover:underline"
        >
          Clear view
        </button>
      </div>
    </Dialog>
  )
}

// CSQ 0–31 → coarse bars. 99 means "unknown/not detectable".
const SignalIndicator: React.FC<{ csq: number | null }> = ({ csq }) => {
  if (csq === null || csq === 99) {
    return <span className="text-xs text-gray-400">—</span>
  }
  const pct = Math.round((Math.min(csq, 31) / 31) * 100)
  const color = pct >= 60 ? 'text-green-600' : pct >= 30 ? 'text-amber-500' : 'text-red-500'
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${color}`}>
      <Signal className="w-3.5 h-3.5" /> {pct}%
    </span>
  )
}

const PairingCodeDisplay: React.FC<{ code: string; expiresAt: string | null }> = ({ code, expiresAt }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mt-4 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
      <p className="text-sm font-medium text-indigo-800 mb-1">Pairing Code</p>
      <div className="flex items-center gap-3">
        <span className="text-2xl font-mono font-bold tracking-widest text-indigo-700">{code}</span>
        <button onClick={handleCopy} className="p-1.5 rounded hover:bg-indigo-100 transition-colors" title="Copy code">
          {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-indigo-500" />}
        </button>
      </div>
      {expiresAt && (
        <p className="text-xs text-indigo-500 mt-1">Expires {new Date(expiresAt).toLocaleTimeString()}</p>
      )}
      <p className="text-xs text-indigo-600 mt-2">
        Enter this code in the SMS gateway agent's config on the kiosk (Raspberry Pi or Windows PC).
      </p>
    </div>
  )
}

const Gateways: React.FC = () => {
  const queryClient = useQueryClient()
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newLocation, setNewLocation] = useState('')
  const [newResult, setNewResult] = useState<{ pairing_code: string; expires_at: string | null } | null>(null)
  const [refreshedCode, setRefreshedCode] = useState<{ id: string; code: string; expires_at: string | null } | null>(null)
  const [logsFor, setLogsFor] = useState<SmsGateway | null>(null)
  // Gateways we've asked to re-check their modem, with the timestamp we're
  // waiting to see move. The kiosk answers on its own poll, so this is a wait,
  // not a request/response.
  const [checking, setChecking] = useState<Record<string, { since: string | null; startedAt: number }>>({})

  const isChecking = Object.keys(checking).length > 0

  const { data, isLoading } = useQuery({
    queryKey: ['sms-gateways'],
    queryFn: () => smsService.getGateways(),
    // Poll hard only while waiting on a modem check.
    refetchInterval: isChecking ? 2_000 : 30_000,
  })

  // Memoized so the wait-for-check effect below isn't retriggered by every
  // render handing it a fresh empty array.
  const gateways: SmsGateway[] = useMemo(() => data?.data ?? [], [data])

  // A check is done when the kiosk reports a newer reading; give up after 30s
  // (roughly six outbox polls — long enough that a busy kiosk still answers).
  useEffect(() => {
    const waiting = Object.keys(checking)
    if (!waiting.length) return

    const settled = waiting.filter((id) => {
      const gateway = gateways.find((g) => g.id === id)
      const answered = gateway && gateway.modem_checked_at !== checking[id].since
      return answered || Date.now() - checking[id].startedAt > 30_000
    })
    if (!settled.length) return

    settled.forEach((id) => {
      const gateway = gateways.find((g) => g.id === id)
      if (gateway && gateway.modem_checked_at !== checking[id].since) {
        toast.success(
          gateway.modem_connected ? `${gateway.name}: modem responding` : `${gateway.name}: modem not responding`,
        )
      } else {
        toast.error('The kiosk did not answer. Check that the agent service is running.')
      }
    })

    setChecking((prev) => {
      const next = { ...prev }
      settled.forEach((id) => delete next[id])
      return next
    })
  }, [gateways, checking])

  const createMutation = useMutation({
    mutationFn: ({ name, location }: { name: string; location: string }) =>
      smsService.createGateway(name, location || undefined),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['sms-gateways'] })
      setNewName('')
      setNewLocation('')
      if (res.data?.pairing_code) {
        setNewResult({ pairing_code: res.data.pairing_code, expires_at: res.data.pairing_code_expires_at })
      }
      toast.success('Gateway registered')
    },
    onError: () => toast.error('Failed to register gateway'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => smsService.deleteGateway(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sms-gateways'] })
      toast.success('Gateway removed')
    },
    onError: () => toast.error('Failed to remove gateway'),
  })

  const refreshMutation = useMutation({
    mutationFn: (id: string) => smsService.refreshPairingCode(id),
    onSuccess: (res, id) => {
      if (res.data) {
        setRefreshedCode({ id, code: res.data.pairing_code, expires_at: res.data.expires_at })
      }
      toast.success('New pairing code generated')
    },
    onError: () => toast.error('Could not refresh pairing code (already paired?)'),
  })

  const checkModemMutation = useMutation({
    mutationFn: (gateway: SmsGateway) => smsService.refreshGatewayStatus(gateway.id),
    onSuccess: (res, gateway) => {
      setChecking((prev) => ({
        ...prev,
        [gateway.id]: { since: gateway.modem_checked_at, startedAt: Date.now() },
      }))
      toast.success(res.message ?? 'Checking the modem…')
    },
    onError: () => toast.error('Could not ask this kiosk to check its modem'),
  })

  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sms-gateway'

  const handleDownloadInstaller = async (g: SmsGateway) => {
    try {
      const blob = await smsService.getInstaller(g.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `sms-gateway-${slugify(g.name)}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      // Downloading an unpaired gateway may mint a fresh pairing code.
      queryClient.invalidateQueries({ queryKey: ['sms-gateways'] })
      toast.success('Installer downloaded')
    } catch {
      toast.error('Could not download installer')
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Smartphone className="w-6 h-6 text-indigo-600" /> SMS Gateways
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            On-prem kiosks with a USB GSM modem that send and receive SMS over a local SIM.
          </p>
        </div>
        <Button onClick={() => { setShowAddForm((v) => !v); setNewResult(null) }}>
          <Plus className="w-4 h-4 mr-1" /> Add gateway
        </Button>
      </div>

      {showAddForm && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-5 bg-white border border-gray-200 rounded-xl shadow-sm"
        >
          <h2 className="font-semibold text-gray-800 mb-3">Register a new gateway</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Name</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Front Office Kiosk" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Location (optional)</label>
              <Input value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="e.g. Registrar" />
            </div>
          </div>
          <div className="mt-3">
            <Button
              disabled={!newName.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate({ name: newName.trim(), location: newLocation.trim() })}
            >
              {createMutation.isPending ? 'Registering…' : 'Register'}
            </Button>
          </div>
          {newResult && <PairingCodeDisplay code={newResult.pairing_code} expiresAt={newResult.expires_at} />}
        </motion.div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Modem</th>
              <th className="text-left px-4 py-3">Signal</th>
              <th className="text-left px-4 py-3">Operator</th>
              <th className="text-left px-4 py-3">SIM #</th>
              <th className="text-left px-4 py-3">Balance</th>
              <th className="text-left px-4 py-3">Platform</th>
              <th className="text-left px-4 py-3">Last seen</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
            )}
            {!isLoading && gateways.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">No gateways yet. Add one to get started.</td></tr>
            )}
            {gateways.map((g) => (
              <React.Fragment key={g.id}>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{g.name}</div>
                    {g.location && <div className="text-xs text-gray-400">{g.location}</div>}
                    {!g.is_paired && <span className="text-xs text-amber-600">Not paired</span>}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={g.status} /></td>
                  <td className="px-4 py-3">
                    <ModemBadge gateway={g} checking={!!checking[g.id]} />
                    {g.modem_connected === false && g.modem_error && (
                      <div className="text-xs text-red-500 mt-0.5 max-w-52 truncate" title={g.modem_error}>
                        {g.modem_error}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3"><SignalIndicator csq={g.signal_strength} /></td>
                  <td className="px-4 py-3 text-gray-600">{g.network_operator ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{g.sim_msisdn ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{g.sim_balance ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{g.platform}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {g.last_seen_at ? new Date(g.last_seen_at).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {g.is_paired && (
                        <>
                          <button
                            onClick={() => checkModemMutation.mutate(g)}
                            disabled={!!checking[g.id]}
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-40"
                            title="Check the modem now"
                          >
                            <RefreshCw className={`w-4 h-4 ${checking[g.id] ? 'animate-spin' : ''}`} />
                          </button>
                          <button
                            onClick={() => setLogsFor(g)}
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                            title="View the agent log"
                          >
                            <Terminal className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleDownloadInstaller(g)}
                        className="p-1.5 rounded hover:bg-gray-100 text-indigo-600"
                        title="Download installer (.zip — agent + pre-filled config)"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      {!g.is_paired && (
                        <button
                          onClick={() => refreshMutation.mutate(g.id)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                          title="Refresh pairing code"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (confirm(`Remove gateway "${g.name}"?`)) deleteMutation.mutate(g.id)
                        }}
                        className="p-1.5 rounded hover:bg-red-50 text-red-500"
                        title="Remove gateway"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
                {refreshedCode?.id === g.id && (
                  <tr>
                    <td colSpan={10} className="px-4 pb-4 bg-gray-50">
                      <PairingCodeDisplay code={refreshedCode.code} expiresAt={refreshedCode.expires_at} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {logsFor && <LogViewer gateway={logsFor} onClose={() => setLogsFor(null)} />}
    </div>
  )
}

export default Gateways
