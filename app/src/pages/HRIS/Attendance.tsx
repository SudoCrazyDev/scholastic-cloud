import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { RefreshCw, Clock, Fingerprint, CreditCard, Scan, KeyRound, HelpCircle, DownloadCloud } from 'lucide-react'
import { attendanceLogService } from '../../services/attendanceService'
import { biometricService } from '../../services/biometricService'
import { Select } from '../../components/select'
import type { AttendanceLog, BiometricDevice } from '../../types'

const PUNCH_LABELS: Record<string, { label: string; color: string }> = {
  check_in:  { label: 'Check In',   color: 'bg-green-100 text-green-700' },
  check_out: { label: 'Check Out',  color: 'bg-blue-100 text-blue-700' },
  break_out: { label: 'Break Out',  color: 'bg-amber-100 text-amber-700' },
  break_in:  { label: 'Break In',   color: 'bg-amber-100 text-amber-700' },
  ot_in:     { label: 'OT In',      color: 'bg-purple-100 text-purple-700' },
  ot_out:    { label: 'OT Out',     color: 'bg-purple-100 text-purple-700' },
  unknown:   { label: 'Unknown',    color: 'bg-gray-100 text-gray-500' },
}

const VerifyIcon: React.FC<{ type: string }> = ({ type }) => {
  const cls = 'w-3.5 h-3.5'
  if (type === 'fingerprint') return <Fingerprint className={cls} />
  if (type === 'card')        return <CreditCard className={cls} />
  if (type === 'face')        return <Scan className={cls} />
  if (type === 'password')    return <KeyRound className={cls} />
  return <HelpCircle className={cls} />
}

const Attendance: React.FC = () => {
  const today = new Date().toISOString().slice(0, 10)
  const [deviceId, setDeviceId] = useState('')
  const [fromDate, setFromDate] = useState(today)
  const [toDate, setToDate]     = useState(today)
  const [page, setPage] = useState(1)

  const devicesQuery = useQuery({
    queryKey: ['biometric-devices'],
    queryFn: () => biometricService.getDevices(),
  })
  const devices: BiometricDevice[] = devicesQuery.data?.data ?? []
  const deviceOptions = [
    { value: '', label: 'All devices' },
    ...devices.map((d) => ({ value: d.id, label: d.name })),
  ]

  const logsQuery = useQuery({
    queryKey: ['attendance-logs', deviceId, fromDate, toDate, page],
    queryFn: () => attendanceLogService.getLogs({
      device_id: deviceId || undefined,
      from: fromDate || undefined,
      to: toDate || undefined,
      page,
      per_page: 50,
    }),
    refetchInterval: 30_000,
  })

  const logs: AttendanceLog[] = logsQuery.data?.data ?? []
  const pagination = logsQuery.data?.pagination

  const queryClient = useQueryClient()
  const fetchMutation = useMutation({
    mutationFn: async () => {
      // Fetch for the selected device, or every device when "All devices" is chosen.
      const targets = deviceId ? [deviceId] : devices.map((d) => d.id)
      if (targets.length === 0) throw new Error('No device to fetch from')
      const results = await Promise.all(
        targets.map((id) => biometricService.fetchAttendanceFromDevice(id, fromDate || undefined, toDate || undefined)),
      )
      return results[0]
    },
    onSuccess: (res) => {
      toast.success(res?.message ?? 'Fetch queued')
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['attendance-logs'] }), 30_000)
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? e?.message ?? 'Failed to fetch from device'),
  })

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
          <Clock className="w-7 h-7 text-indigo-600" />
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Attendance Logs</h1>
            <p className="text-sm text-gray-500">Biometric punch records from ZKTeco devices</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchMutation.mutate()}
            disabled={fetchMutation.isPending || devices.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-indigo-200 bg-indigo-50 text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition-colors disabled:opacity-40"
            title="Pull stored punches from the device for the selected date range"
          >
            <DownloadCloud className={`w-4 h-4 ${fetchMutation.isPending ? 'animate-pulse' : ''}`} />
            {fetchMutation.isPending ? 'Fetching…' : 'Fetch from device'}
          </button>
          <button
            onClick={() => logsQuery.refetch()}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-400 hover:text-gray-700 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${logsQuery.isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-52">
          <Select
            value={deviceId}
            onChange={(e) => { setDeviceId(e.target.value); setPage(1) }}
            options={deviceOptions}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">From</label>
          <input
            type="date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(e) => { setFromDate(e.target.value); setPage(1) }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
          />
          <label className="text-xs font-medium text-gray-500">To</label>
          <input
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => { setToDate(e.target.value); setPage(1) }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
          />
        </div>
        <button
          onClick={() => { setFromDate(''); setToDate(''); setPage(1) }}
          className="text-xs text-indigo-600 hover:underline"
        >
          Clear dates
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {logsQuery.isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading attendance logs…</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <Clock className="w-10 h-10 text-gray-200 mx-auto" />
            <p className="text-gray-400 text-sm">
              No attendance logs yet.
            </p>
            <p className="text-gray-300 text-xs">
              Logs appear here automatically when employees punch in/out on the ZKTeco device.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-gray-500">Staff</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Date & Time</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Type</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Verify</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Device</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {logs.map((log) => {
                const punch = PUNCH_LABELS[log.punch_type] ?? PUNCH_LABELS.unknown
                const staffName = log.user
                  ? `${log.user.first_name} ${log.user.last_name}`
                  : `ZK #${log.zk_user_id}`
                return (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{staffName}</div>
                      {!log.user && (
                        <div className="text-xs text-gray-400">Not linked to staff</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                      {log.punched_at.slice(0, 19).replace('T', ' ')}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${punch.color}`}>
                        {punch.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500 capitalize">
                        <VerifyIcon type={log.verify_type} />
                        {log.verify_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {log.device?.name ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.last_page > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>
            Showing {((page - 1) * 50) + 1}–{Math.min(page * 50, pagination.total)} of {pagination.total}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
            >Previous</button>
            <button
              onClick={() => setPage((p) => Math.min(pagination.last_page, p + 1))}
              disabled={page === pagination.last_page}
              className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
            >Next</button>
          </div>
        </div>
      )}

      {/* ADMS setup hint */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-sm text-indigo-700">
        <strong>Device setup (ADMS mode):</strong> On your ZKTeco device go to
        <strong> Menu → Comm → Cloud Server Setting</strong>, set Server Mode to
        <strong> ADMS</strong>, and set the Server Address to your API host
        (e.g. <code className="bg-indigo-100 px-1 rounded">192.168.1.x:8000</code>).
        Punches will appear here automatically.
      </div>
    </motion.div>
  )
}

export default Attendance
