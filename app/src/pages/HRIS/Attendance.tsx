import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { RefreshCw, Clock, Fingerprint, CreditCard, Scan, KeyRound, HelpCircle, DownloadCloud } from 'lucide-react'
import { attendanceLogService } from '../../services/attendanceService'
import { biometricService } from '../../services/biometricService'
import { Select } from '../../components/select'
import type { AttendanceLog, BiometricDevice } from '../../types'

const PER_PAGE = 50

interface StaffDayRow {
  key: string
  date: string
  staffName: string
  linked: boolean
  checkIn: AttendanceLog | null
  checkOut: AttendanceLog | null
  first: AttendanceLog
}

// punched_at is the device's local wall-clock time, so read the clock straight off the string.
const formatTime = (punchedAt: string) => {
  const [h, m] = punchedAt.slice(11, 16).split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

// One row per staff per day. Check-in is the earliest check-in punch (or the earliest
// punch of any kind); check-out is the latest check-out punch (or the latest other punch).
const groupByStaffDay = (logs: AttendanceLog[]): StaffDayRow[] => {
  const groups = new Map<string, AttendanceLog[]>()
  for (const log of logs) {
    const key = `${log.user_id ?? `zk:${log.zk_user_id}`}|${log.punched_at.slice(0, 10)}`
    const group = groups.get(key)
    if (group) group.push(log)
    else groups.set(key, [log])
  }

  const rows: StaffDayRow[] = []
  groups.forEach((punches, key) => {
    const sorted = [...punches].sort((a, b) => a.punched_at.localeCompare(b.punched_at))
    const first = sorted[0]
    const checkIn = sorted.find((p) => p.punch_type === 'check_in') ?? first
    const checkOut = [...sorted].reverse().find((p) => p.punch_type === 'check_out')
      ?? (sorted.length > 1 && sorted[sorted.length - 1] !== checkIn ? sorted[sorted.length - 1] : null)
    rows.push({
      key,
      date: first.punched_at.slice(0, 10),
      staffName: first.user ? `${first.user.first_name} ${first.user.last_name}` : `ZK #${first.zk_user_id}`,
      linked: !!first.user,
      checkIn,
      checkOut,
      first,
    })
  })

  return rows.sort((a, b) => b.date.localeCompare(a.date) || a.staffName.localeCompare(b.staffName))
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
    queryKey: ['attendance-logs', deviceId, fromDate, toDate],
    // Rows are grouped per staff per day, so pull every punch in the range and page the rows here.
    queryFn: () => attendanceLogService.getLogs({
      device_id: deviceId || undefined,
      from: fromDate || undefined,
      to: toDate || undefined,
      per_page: 5000,
    }),
    refetchInterval: 30_000,
  })

  const logs: AttendanceLog[] = logsQuery.data?.data ?? []
  const rows = groupByStaffDay(logs)
  const lastPage = Math.max(1, Math.ceil(rows.length / PER_PAGE))
  const pageRows = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  // The date is only worth showing when the filter spans more than one day.
  const singleDay = !!fromDate && fromDate === toDate

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
          <Clock className="w-7 h-7 text-primary-600" />
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Attendance Logs</h1>
            <p className="text-sm text-gray-500">Biometric punch records from ZKTeco devices</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchMutation.mutate()}
            disabled={fetchMutation.isPending || devices.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-primary-200 bg-primary-50 text-sm font-medium text-primary-700 hover:bg-primary-100 transition-colors disabled:opacity-40"
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
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400"
          />
          <label className="text-xs font-medium text-gray-500">To</label>
          <input
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => { setToDate(e.target.value); setPage(1) }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400"
          />
        </div>
        <button
          onClick={() => { setFromDate(''); setToDate(''); setPage(1) }}
          className="text-xs text-primary-600 hover:underline"
        >
          Clear dates
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {logsQuery.isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading attendance logs…</div>
        ) : rows.length === 0 ? (
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
                <th className="px-4 py-3 text-left font-medium text-gray-500">Check-In</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Check-Out</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Verify</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Device</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {pageRows.map((row) => (
                <tr key={row.key} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{row.staffName}</div>
                    {!singleDay && (
                      <div className="text-xs text-gray-400">{row.date}</div>
                    )}
                    {!row.linked && (
                      <div className="text-xs text-gray-400">Not linked to staff</div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-green-700">
                    {row.checkIn ? formatTime(row.checkIn.punched_at) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-blue-700">
                    {row.checkOut ? formatTime(row.checkOut.punched_at) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500 capitalize">
                      <VerifyIcon type={row.first.verify_type} />
                      {row.first.verify_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {row.first.device?.name ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {lastPage > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>
            Showing {((page - 1) * PER_PAGE) + 1}–{Math.min(page * PER_PAGE, rows.length)} of {rows.length}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
            >Previous</button>
            <button
              onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
              disabled={page === lastPage}
              className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
            >Next</button>
          </div>
        </div>
      )}

      {/* ADMS setup hint */}
      <div className="bg-primary-50 border border-primary-100 rounded-xl p-4 text-sm text-primary-700">
        <strong>Device setup (ADMS mode):</strong> On your ZKTeco device go to
        <strong> Menu → Comm → Cloud Server Setting</strong>, set Server Mode to
        <strong> ADMS</strong>, and set the Server Address to your API host
        (e.g. <code className="bg-primary-100 px-1 rounded">192.168.1.x:8000</code>).
        Punches will appear here automatically.
      </div>
    </motion.div>
  )
}

export default Attendance
