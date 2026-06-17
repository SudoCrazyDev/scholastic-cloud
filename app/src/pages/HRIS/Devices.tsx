import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { Fingerprint, Plus, Trash2, RefreshCw, Wifi, WifiOff, HelpCircle, Copy, Check, DownloadCloud } from 'lucide-react'
import { biometricService } from '../../services/biometricService'
import { Button } from '../../components/button'
import { Input } from '../../components/input'
import type { BiometricDevice } from '../../types'

const StatusBadge: React.FC<{ status: BiometricDevice['status'] }> = ({ status }) => {
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
        <button
          onClick={handleCopy}
          className="p-1.5 rounded hover:bg-indigo-100 transition-colors"
          title="Copy code"
        >
          {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-indigo-500" />}
        </button>
      </div>
      {expiresAt && (
        <p className="text-xs text-indigo-500 mt-1">
          Expires {new Date(expiresAt).toLocaleTimeString()}
        </p>
      )}
      <p className="text-xs text-indigo-600 mt-2">
        Enter this code in the ZKTeco Bridge app on the device's local machine.
      </p>
    </div>
  )
}

const Devices: React.FC = () => {
  const queryClient = useQueryClient()
  const [showAddForm, setShowAddForm] = useState(false)
  const [newDeviceName, setNewDeviceName] = useState('')
  const [newDeviceSerial, setNewDeviceSerial] = useState('')
  const [newDeviceResult, setNewDeviceResult] = useState<{ pairing_code: string; expires_at: string | null } | null>(null)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [refreshedCode, setRefreshedCode] = useState<{ id: string; code: string; expires_at: string | null } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['biometric-devices'],
    queryFn: () => biometricService.getDevices(),
    refetchInterval: 30_000,
  })

  const devices: BiometricDevice[] = data?.data ?? []

  const createMutation = useMutation({
    mutationFn: ({ name, serial }: { name: string; serial: string }) =>
      biometricService.createDevice(name, serial || undefined),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['biometric-devices'] })
      setNewDeviceName('')
      setNewDeviceSerial('')
      if (res.data.pairing_code) {
        // Bridge flow — surface the one-time pairing code.
        setNewDeviceResult({ pairing_code: res.data.pairing_code, expires_at: res.data.pairing_code_expires_at })
      } else {
        // Direct-ADMS flow — no pairing code; the device connects on its own.
        setShowAddForm(false)
        toast.success(res.message ?? 'Device registered')
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to register device'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => biometricService.deleteDevice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['biometric-devices'] })
      toast.success('Device removed')
    },
    onError: () => toast.error('Failed to remove device'),
  })

  const fetchUsersMutation = useMutation({
    mutationFn: (id: string) => biometricService.fetchUsersFromDevice(id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['zk-users'] })
      toast.success(res.message ?? 'Fetch queued')
    },
    onError: () => toast.error('Failed to queue user fetch'),
  })

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDeviceName.trim()) return
    setNewDeviceResult(null)
    createMutation.mutate({ name: newDeviceName.trim(), serial: newDeviceSerial.trim() })
  }

  const handleRefreshCode = async (id: string) => {
    setRefreshingId(id)
    try {
      const res = await biometricService.refreshPairingCode(id)
      setRefreshedCode({ id, code: res.data.pairing_code, expires_at: res.data.expires_at })
      toast.success('New pairing code generated')
    } catch {
      toast.error('Failed to refresh pairing code')
    } finally {
      setRefreshingId(null)
    }
  }

  const handleDelete = (device: BiometricDevice) => {
    if (!window.confirm(`Remove "${device.name}"? This will also delete all ZK user mappings for this device.`)) return
    deleteMutation.mutate(device.id)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Fingerprint className="w-7 h-7 text-indigo-600" />
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Biometric Devices</h1>
            <p className="text-sm text-gray-500">Manage ZKTeco devices and bridge connections</p>
          </div>
        </div>
        <Button onClick={() => { setShowAddForm(!showAddForm); setNewDeviceResult(null) }}>
          <Plus className="w-4 h-4 mr-1" /> Add Device
        </Button>
      </div>

      {/* Add Device Form */}
      {showAddForm && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm"
        >
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Register New Device</h2>
          <form onSubmit={handleCreate} className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Device name</label>
              <Input
                value={newDeviceName}
                onChange={(e) => setNewDeviceName(e.target.value)}
                placeholder="e.g. Main Gate — Building A"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Serial number <span className="text-gray-400">(direct ADMS)</span></label>
              <Input
                value={newDeviceSerial}
                onChange={(e) => setNewDeviceSerial(e.target.value)}
                placeholder="e.g. UDP3253900609"
              />
            </div>
            <Button type="submit" disabled={createMutation.isPending || !newDeviceName.trim()}>
              {createMutation.isPending ? 'Registering…' : 'Register'}
            </Button>
          </form>
          <p className="text-xs text-gray-400 mt-2">
            Enter the device <strong>serial number</strong> for a ZKTeco device that pushes directly via ADMS (e.g. MB-10VL) — it registers under your institution and connects automatically.
            Leave it blank only if you're using the on-prem bridge app (you'll get a pairing code instead).
          </p>
          {newDeviceResult && (
            <PairingCodeDisplay code={newDeviceResult.pairing_code} expiresAt={newDeviceResult.expires_at} />
          )}
        </motion.div>
      )}

      {/* Device Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading devices…</div>
        ) : devices.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            No devices yet. Click <strong>Add Device</strong> to get started.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-gray-500">Name</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Mode</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Serial / MAC</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Last seen</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {devices.map((device) => (
                <tr key={device.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-800">{device.name}</td>
                  <td className="px-4 py-3"><StatusBadge status={device.status} /></td>
                  <td className="px-4 py-3">
                    {device.connection === 'bridge' ? (
                      <span className="text-xs text-green-700 font-medium">Bridge</span>
                    ) : device.connection === 'adms' ? (
                      <span className="text-xs text-indigo-600 font-medium">ADMS</span>
                    ) : (
                      <span className="text-xs text-amber-600 font-medium">Awaiting device</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                    {device.serial_number ?? '—'} {device.mac_address ? `/ ${device.mac_address}` : ''}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {device.last_seen_at
                      ? new Date(device.last_seen_at).toLocaleString()
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => fetchUsersMutation.mutate(device.id)}
                        disabled={fetchUsersMutation.isPending}
                        className="p-1.5 rounded hover:bg-gray-100 transition-colors text-gray-400 hover:text-indigo-600 disabled:opacity-40"
                        title="Fetch enrolled users from this device"
                      >
                        <DownloadCloud className={`w-4 h-4 ${fetchUsersMutation.isPending && fetchUsersMutation.variables === device.id ? 'animate-pulse' : ''}`} />
                      </button>
                      {!device.is_paired && (
                        <button
                          onClick={() => handleRefreshCode(device.id)}
                          disabled={refreshingId === device.id}
                          className="p-1.5 rounded hover:bg-gray-100 transition-colors text-gray-400 hover:text-indigo-600"
                          title="Regenerate pairing code"
                        >
                          <RefreshCw className={`w-4 h-4 ${refreshingId === device.id ? 'animate-spin' : ''}`} />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(device)}
                        disabled={deleteMutation.isPending}
                        className="p-1.5 rounded hover:bg-gray-100 transition-colors text-gray-400 hover:text-red-600"
                        title="Remove device"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {refreshedCode?.id === device.id && (
                      <div className="mt-2">
                        <PairingCodeDisplay code={refreshedCode.code} expiresAt={refreshedCode.expires_at} />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </motion.div>
  )
}

export default Devices
