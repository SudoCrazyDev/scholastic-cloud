import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { Monitor, Unlink, RefreshCw, Upload, Fingerprint, Plus, AlertCircle, CheckCircle, Clock, Trash2 } from 'lucide-react'
import { biometricService } from '../../services/biometricService'
import { staffService } from '../../services/staffService'
import { Select } from '../../components/select'
import { Button } from '../../components/button'
import type { ZkUserMapping, BiometricDevice } from '../../types'

type Filter = 'all' | 'linked' | 'unlinked'

// ── Push status badge ─────────────────────────────────────────────────────────
const PushBadge: React.FC<{ mapping: ZkUserMapping }> = ({ mapping }) => {
  if (!mapping.push_status) return null
  if (mapping.push_status === 'pending') return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-600 border border-amber-200">
      <Clock className="w-2.5 h-2.5" />
      {mapping.push_action === 'enroll_fingerprint' ? 'FP pending' : 'Enrolling'}
    </span>
  )
  if (mapping.push_status === 'done') return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-600 border border-green-200">
      <CheckCircle className="w-2.5 h-2.5" />
      {mapping.push_action === 'enroll_fingerprint' ? 'FP sent' : 'Enrolled'}
    </span>
  )
  return (
    <span title={mapping.push_error ?? ''} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-600 border border-red-200 cursor-help">
      <AlertCircle className="w-2.5 h-2.5" />Failed
    </span>
  )
}

// ── Add-to-device modal ───────────────────────────────────────────────────────
const AddToDeviceModal: React.FC<{
  devices: BiometricDevice[]
  onClose: () => void
  onAdded: () => void
}> = ({ devices, onClose, onAdded }) => {
  const queryClient = useQueryClient()
  const [deviceId, setDeviceId] = useState(devices[0]?.id ?? '')
  const [userId, setUserId] = useState('')
  const [assignedId, setAssignedId] = useState<string | null>(null)

  const staffQuery = useQuery({ queryKey: ['staffs-for-linking'], queryFn: () => staffService.getStaffs({ limit: 200 }) })
  const staffOptions = [
    { value: '', label: 'Select staff…' },
    ...(staffQuery.data?.data ?? []).map((s: any) => ({ value: s.id, label: `${s.first_name} ${s.last_name}` })),
  ]
  const deviceOptions = devices.map((d) => ({ value: d.id, label: d.name }))

  const mutation = useMutation({
    mutationFn: () => biometricService.addStaffToDevice(deviceId, userId, ''),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['zk-users'] })
      setAssignedId(res.data.zk_user_id)
      toast.success('Staff queued for enrollment to device')
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Upload className="w-4 h-4 text-indigo-600" /> Add Staff to Device
        </h2>

        {assignedId ? (
          <div className="text-center py-4">
            <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-3" />
            <p className="text-sm text-gray-700 font-medium">Staff queued for enrollment</p>
            <p className="text-xs text-gray-500 mt-1">
              Assigned ZK User ID: <span className="font-mono font-bold text-indigo-700">{assignedId}</span>
            </p>
            <p className="text-xs text-gray-400 mt-2">The bridge will push the user to the device within 30 seconds.</p>
            <Button onClick={onAdded} className="mt-4">Done</Button>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-500 mb-4">
              A ZK User ID will be auto-assigned (next available slot on the device). The bridge pushes the user automatically.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Device</label>
                <Select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} options={deviceOptions} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Staff member</label>
                <Select value={userId} onChange={(e) => setUserId(e.target.value)} options={staffOptions} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button onClick={onClose} className="bg-gray-100 text-gray-700 hover:bg-gray-200">Cancel</Button>
              <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !deviceId || !userId}>
                {mutation.isPending ? 'Adding…' : 'Add to Device'}
              </Button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
const ZkUsers: React.FC = () => {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedDevice, setSelectedDevice] = useState<string>('')
  const [page, setPage] = useState(1)
  const [showAddModal, setShowAddModal] = useState(false)

  const devicesQuery = useQuery({ queryKey: ['biometric-devices'], queryFn: () => biometricService.getDevices() })
  const devices: BiometricDevice[] = devicesQuery.data?.data ?? []
  const deviceOptions = [
    { value: '', label: 'All devices' },
    ...devices.map((d) => ({ value: d.id, label: d.name })),
  ]

  const zkUsersQuery = useQuery({
    queryKey: ['zk-users', filter, selectedDevice, page],
    queryFn: () => biometricService.getZkUsers({
      device_id: selectedDevice || undefined,
      linked: filter === 'all' ? undefined : filter === 'linked',
      page,
      per_page: 50,
    }),
    refetchInterval: 15_000, // auto-refresh every 15s to pick up push status changes
  })

  const staffQuery = useQuery({ queryKey: ['staffs-for-linking'], queryFn: () => staffService.getStaffs({ limit: 200 }) })
  const staffOptions = (staffQuery.data?.data ?? []).map((s: any) => ({
    value: s.id,
    label: `${s.first_name} ${s.last_name}`,
  }))

  const linkMutation = useMutation({
    mutationFn: ({ mappingId, userId }: { mappingId: string; userId: string }) => biometricService.linkStaff(mappingId, userId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['zk-users'] }); toast.success('Staff linked') },
    onError: () => toast.error('Failed to link staff'),
  })

  const unlinkMutation = useMutation({
    mutationFn: (mappingId: string) => biometricService.unlinkStaff(mappingId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['zk-users'] }); toast.success('Staff unlinked') },
    onError: () => toast.error('Failed to unlink'),
  })


  const enrollMutation = useMutation({
    mutationFn: (mappingId: string) => biometricService.enrollToDevice(mappingId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['zk-users'] }); toast.success('Queued — bridge will push to device within 30s') },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  })

  const fpMutation = useMutation({
    mutationFn: (mappingId: string) => biometricService.triggerFingerprint(mappingId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['zk-users'] }); toast.success('Fingerprint enrollment triggered — employee should go to the device') },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (mappingId: string) => biometricService.deleteZkUser(mappingId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['zk-users'] }); toast.success('ZK user removed') },
    onError: () => toast.error('Failed to delete'),
  })

  const zkUsers: ZkUserMapping[] = zkUsersQuery.data?.data ?? []
  const pagination = zkUsersQuery.data?.pagination

  const filterTabs: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'linked', label: 'Linked' },
    { key: 'unlinked', label: 'Unlinked' },
  ]

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Monitor className="w-7 h-7 text-indigo-600" />
          <div>
            <h1 className="text-xl font-semibold text-gray-900">ZK Users</h1>
            <p className="text-sm text-gray-500">Link and enroll staff on ZKTeco devices</p>
          </div>
        </div>
        <Button onClick={() => setShowAddModal(true)}>
          <Plus className="w-4 h-4 mr-1" /> Add Staff to Device
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-52">
          <Select value={selectedDevice} onChange={(e) => { setSelectedDevice(e.target.value); setPage(1) }} options={deviceOptions} />
        </div>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {filterTabs.map((tab) => (
            <button key={tab.key} onClick={() => { setFilter(tab.key); setPage(1) }}
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${filter === tab.key ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              {tab.label}
            </button>
          ))}
        </div>
        <button onClick={() => queryClient.invalidateQueries({ queryKey: ['zk-users'] })}
          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-400 hover:text-gray-700 transition-colors" title="Refresh">
          <RefreshCw className={`w-4 h-4 ${zkUsersQuery.isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {zkUsersQuery.isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading ZK users…</div>
        ) : zkUsers.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            {filter !== 'all' ? `No ${filter} ZK users found.` : 'No ZK users yet. Sync a device using the bridge app.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-gray-500">ZK ID</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">ZK Name</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Card #</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Device</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 w-52">Linked Staff</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {zkUsers.map((mapping) => (
                <ZkUserRow
                  key={mapping.id}
                  mapping={mapping}
                  staffOptions={staffOptions}
                  onLink={(userId) => linkMutation.mutate({ mappingId: mapping.id, userId })}
                  onUnlink={() => unlinkMutation.mutate(mapping.id)}

                  onFingerprint={() => fpMutation.mutate(mapping.id)}
                  onEnroll={() => enrollMutation.mutate(mapping.id)}
              isBusy={linkMutation.isPending || unlinkMutation.isPending || enrollMutation.isPending || fpMutation.isPending || deleteMutation.isPending}
              onDelete={() => {
                if (window.confirm('Remove this ZK user from the system? This only removes the record here — the user stays on the device.')) {
                  deleteMutation.mutate(mapping.id)
                }
              }}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.last_page > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Showing {((page - 1) * 50) + 1}–{Math.min(page * 50, pagination.total)} of {pagination.total}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40">Previous</button>
            <button onClick={() => setPage((p) => Math.min(pagination.last_page, p + 1))} disabled={page === pagination.last_page}
              className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}

      {/* Add-to-device modal */}
      {showAddModal && (
        <AddToDeviceModal
          devices={devices}
          onClose={() => setShowAddModal(false)}
          onAdded={() => setShowAddModal(false)}
        />
      )}
    </motion.div>
  )
}

// ── Row component ─────────────────────────────────────────────────────────────
interface ZkUserRowProps {
  mapping: ZkUserMapping
  staffOptions: { value: string; label: string }[]
  onLink: (userId: string) => void
  onUnlink: () => void
  onEnroll: () => void
  onFingerprint: () => void
  onDelete: () => void
  isBusy: boolean
}

const ZkUserRow: React.FC<ZkUserRowProps> = ({ mapping, staffOptions, onLink, onUnlink, onEnroll, onFingerprint, onDelete, isBusy }) => {
  const [selectValue, setSelectValue] = useState(mapping.user_id ?? '')

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    setSelectValue(val)
    if (val) onLink(val)
  }

  const linkedName = mapping.user ? `${mapping.user.first_name} ${mapping.user.last_name}` : null
  const isPending = mapping.push_status === 'pending'

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 font-mono text-xs text-gray-600">{mapping.zk_user_id}</td>
      <td className="px-4 py-3 text-gray-800">{mapping.zk_name ?? '—'}</td>
      <td className="px-4 py-3 font-mono text-xs text-gray-500">{mapping.zk_card_no ?? '—'}</td>
      <td className="px-4 py-3 text-gray-500 text-xs">{mapping.device?.name ?? '—'}</td>

      <td className="px-4 py-3">
        {linkedName ? (
          <span className="text-sm text-gray-800 font-medium">{linkedName}</span>
        ) : (
          <div className="w-44">
            <Select value={selectValue} onChange={handleSelect}
              options={[{ value: '', label: 'Select staff…' }, ...staffOptions]} disabled={isBusy} />
          </div>
        )}
      </td>

      <td className="px-4 py-3">
        <PushBadge mapping={mapping} />
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          {/* Enroll to device */}
          {mapping.user_id && (
            <button onClick={onEnroll} disabled={isBusy || isPending}
              title="Push to device with default password '0000'. Employee should then scan fingerprint on the device to replace it."
              className="p-1.5 rounded hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 transition-colors disabled:opacity-40">
              <Upload className="w-4 h-4" />
            </button>
          )}
          {/* Trigger fingerprint enrollment */}
          {mapping.user_id && (
            <button onClick={onFingerprint} disabled={isBusy || isPending}
              title="Trigger fingerprint enrollment on device"
              className="p-1.5 rounded hover:bg-purple-50 text-gray-400 hover:text-purple-600 transition-colors disabled:opacity-40">
              <Fingerprint className="w-4 h-4" />
            </button>
          )}
          {/* Unlink */}
          {mapping.user_id && (
            <button onClick={onUnlink} disabled={isBusy}
              title="Remove staff link"
              className="p-1.5 rounded hover:bg-orange-50 text-gray-400 hover:text-orange-500 transition-colors disabled:opacity-40">
              <Unlink className="w-4 h-4" />
            </button>
          )}
          {/* Delete */}
          <button onClick={onDelete} disabled={isBusy}
            title="Delete ZK user record"
            className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-40">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  )
}

export default ZkUsers
