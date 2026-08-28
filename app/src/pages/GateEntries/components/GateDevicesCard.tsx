import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Copy, MonitorSmartphone, Plus, RefreshCw, Trash2, Unplug } from 'lucide-react'
import { gateDeviceService } from '../../../services/gateDeviceService'
import { Button } from '../../../components/button'
import { Input } from '../../../components/input'
import { ConfirmationModal } from '../../../components/ConfirmationModal'
import type { GateDevice } from '../../../types'

interface GateDevicesCardProps {
  gateType: 'enter' | 'exit'
}

/** A device paired to `both` answers for either direction, so it shows on both tabs. */
const servesGate = (device: GateDevice, gateType: 'enter' | 'exit') =>
  device.gate_type === gateType || device.gate_type === 'both'

const relativeTime = (iso: string | null) => {
  if (!iso) return 'never'
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

const statusStyles: Record<GateDevice['status'], string> = {
  online: 'bg-emerald-500',
  offline: 'bg-gray-300',
  unknown: 'bg-gray-200',
}

export default function GateDevicesCard({ gateType }: GateDevicesCardProps) {
  const queryClient = useQueryClient()

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  /**
   * Codes the admin has just been shown, by device id. The API only ever returns
   * a code on the response that mints it, so this is the one place it exists —
   * losing it means minting another, not reading it back.
   */
  const [codes, setCodes] = useState<Record<string, string>>({})
  const [confirming, setConfirming] = useState<{ device: GateDevice; action: 'unpair' | 'delete' } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['gate-devices'],
    queryFn: () => gateDeviceService.getDevices(),
    // Presence and pending counts move on their own as kiosks check in.
    refetchInterval: 30_000,
  })

  const devices = (data?.data ?? []).filter((device) => servesGate(device, gateType))

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['gate-devices'] })

  const createDevice = useMutation({
    mutationFn: () =>
      gateDeviceService.createDevice({
        name: name.trim(),
        gate_type: gateType,
        location: location.trim() || null,
      }),
    onSuccess: (response) => {
      setCodes((current) => ({ ...current, [response.data.id]: response.data.pairing_code }))
      setName('')
      setLocation('')
      setShowForm(false)
      invalidate()
      toast.success('Device registered — enter the code on the kiosk.')
    },
    onError: () => toast.error('Could not register the device'),
  })

  const refreshCode = useMutation({
    mutationFn: (id: string) => gateDeviceService.refreshPairingCode(id),
    onSuccess: (response, id) => {
      setCodes((current) => ({ ...current, [id]: response.pairing_code }))
      invalidate()
    },
    onError: () => toast.error('Could not issue a new code'),
  })

  const unpair = useMutation({
    mutationFn: (id: string) => gateDeviceService.unpairDevice(id),
    onSuccess: (response, id) => {
      setCodes((current) => ({ ...current, [id]: response.pairing_code }))
      setConfirming(null)
      invalidate()
      toast.success('Device unpaired. It clears its local copy on its next call.')
    },
    onError: () => toast.error('Could not unpair the device'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => gateDeviceService.deleteDevice(id),
    onSuccess: (_response, id) => {
      setCodes((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
      setConfirming(null)
      invalidate()
      toast.success('Device removed')
    },
    onError: () => toast.error('Could not remove the device'),
  })

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    toast.success('Pairing code copied')
  }

  const label = gateType === 'enter' ? 'entrance' : 'exit'

  return (
    <div className="bg-white rounded-lg shadow-sm ring-1 ring-gray-200 p-4 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
            <MonitorSmartphone className="w-4 h-4 text-indigo-600" />
            Kiosk devices on the {label} gate
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Register each physical kiosk here, then pair it once with the code below. A paired kiosk
            identifies itself by its own token instead of the institution ID in the URL.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => setShowForm((open) => !open)}
        >
          Add device
        </Button>
      </div>

      {showForm && (
        <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500">Device name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={gateType === 'enter' ? 'Main Gate Entrance' : 'Main Gate Exit'}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Location (optional)</label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Beside the guard house"
              />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              loading={createDevice.isPending}
              disabled={!name.trim() || createDevice.isPending}
              onClick={() => createDevice.mutate()}
            >
              {createDevice.isPending ? 'Registering…' : 'Register device'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4">
        {isLoading ? (
          <p className="text-sm text-gray-400">Loading devices…</p>
        ) : devices.length === 0 ? (
          <p className="text-sm text-gray-500">
            No kiosk registered for this gate yet. Until one is paired, this gate keeps working the
            old way — online only, with the institution ID in the kiosk URL.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {devices.map((device) => (
              <li key={device.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${statusStyles[device.status]}`}
                        title={device.status}
                      />
                      {device.name}
                      {device.gate_type === 'both' && (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-normal text-gray-500">
                          both gates
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {device.location ? `${device.location} · ` : ''}
                      {device.is_paired ? `paired · seen ${relativeTime(device.last_seen_at)}` : 'not paired yet'}
                      {device.roster_count !== null && ` · ${device.roster_count.toLocaleString()} students cached`}
                      {device.pending_count ? ` · ${device.pending_count} scans waiting to upload` : ''}
                    </p>
                    {device.clock_suspect && (
                      <p className="text-xs text-amber-700 mt-1">
                        This device's clock is off by more than a minute — scans it records offline
                        may carry the wrong time.
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {!device.is_paired && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={refreshCode.isPending}
                        leftIcon={<RefreshCw className="w-4 h-4" />}
                        onClick={() => refreshCode.mutate(device.id)}
                        title="Issue a new pairing code"
                      >
                        New code
                      </Button>
                    )}
                    {device.is_paired && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        leftIcon={<Unplug className="w-4 h-4" />}
                        onClick={() => setConfirming({ device, action: 'unpair' })}
                        title="Revoke this device's token"
                      >
                        Unpair
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      color="danger"
                      size="sm"
                      onClick={() => setConfirming({ device, action: 'delete' })}
                      title="Remove this device"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {codes[device.id] && !device.is_paired && (
                  <div className="mt-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wider text-indigo-500">
                      Pairing code — shown once, expires in 15 minutes
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <code className="font-mono text-lg tracking-[0.25em] text-indigo-900 select-all">
                        {codes[device.id]}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyCode(codes[device.id])}
                        className="rounded-md border border-indigo-200 bg-white px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors inline-flex items-center gap-1"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copy
                      </button>
                    </div>
                    <p className="text-xs text-indigo-700/80 mt-1">
                      Enter this on the kiosk itself. If it expires, press <em>New code</em>.
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmationModal
        isOpen={confirming !== null}
        onClose={() => setConfirming(null)}
        loading={unpair.isPending || remove.isPending}
        variant="danger"
        title={confirming?.action === 'unpair' ? 'Unpair this device?' : 'Remove this device?'}
        confirmText={confirming?.action === 'unpair' ? 'Unpair' : 'Remove'}
        message={
          confirming?.action === 'unpair'
            ? `"${confirming?.device.name}" will be signed out on its next call and will clear the roster and photos it holds. You will get a fresh pairing code to set it up again.`
            : `"${confirming?.device.name}" will be deleted and signed out. Scans it has already uploaded are kept; anything still waiting on the device is lost.`
        }
        onConfirm={() => {
          if (!confirming) return
          if (confirming.action === 'unpair') unpair.mutate(confirming.device.id)
          else remove.mutate(confirming.device.id)
        }}
      />
    </div>
  )
}
