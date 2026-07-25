import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import {
  Smartphone, Plus, Trash2, RefreshCw, Wifi, WifiOff, HelpCircle, Copy, Check, Signal,
} from 'lucide-react'
import { smsService } from '../../services/smsService'
import { Button } from '../../components/button'
import { Input } from '../../components/input'
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

  const { data, isLoading } = useQuery({
    queryKey: ['sms-gateways'],
    queryFn: () => smsService.getGateways(),
    refetchInterval: 30_000,
  })

  const gateways: SmsGateway[] = data?.data ?? []

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
              <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
            )}
            {!isLoading && gateways.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No gateways yet. Add one to get started.</td></tr>
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
                    <td colSpan={9} className="px-4 pb-4 bg-gray-50">
                      <PairingCodeDisplay code={refreshedCode.code} expiresAt={refreshedCode.expires_at} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default Gateways
