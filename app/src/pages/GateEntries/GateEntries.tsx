import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ScanLine, Copy, ExternalLink, LogIn, LogOut } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { rfidScanLogService } from '../../services/rfidScanLogService'
import type { RfidScanLog } from '../../types'

type GateTab = 'enter' | 'exit'

function formatScannedAt(value: string) {
  const d = new Date(value)
  return d.toLocaleString()
}

function studentName(log: RfidScanLog) {
  const s = log.student
  if (!s) return '—'
  const parts = [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(' ')
  return parts || '—'
}

export default function GateEntries() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<GateTab>('enter')

  const institutionId =
    user?.user_institutions?.find((ui: { is_default?: boolean }) => ui.is_default)?.institution_id
    ?? user?.user_institutions?.[0]?.institution_id

  const enterUrl = useMemo(() => {
    if (!institutionId || typeof window === 'undefined') return ''
    return `${window.location.origin}/gate-enter?institution_id=${institutionId}`
  }, [institutionId])

  const exitUrl = useMemo(() => {
    if (!institutionId || typeof window === 'undefined') return ''
    return `${window.location.origin}/gate-exit?institution_id=${institutionId}`
  }, [institutionId])

  const activeUrl = activeTab === 'enter' ? enterUrl : exitUrl

  const { data, isLoading, error } = useQuery({
    queryKey: ['gate-entries', institutionId, activeTab],
    queryFn: () =>
      rfidScanLogService.getLogs({
        institution_id: institutionId!,
        type: activeTab,
      }),
    enabled: !!institutionId,
  })

  const logs: RfidScanLog[] = data?.data ?? []

  const copyUrl = async () => {
    if (!activeUrl) {
      toast.error('No institution context for this account.')
      return
    }
    try {
      await navigator.clipboard.writeText(activeUrl)
      toast.success(`${activeTab === 'enter' ? 'Entrance' : 'Exit'} gate URL copied.`)
    } catch {
      toast.error('Could not copy URL.')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <ScanLine className="w-8 h-8 text-indigo-600" />
            Gate Entries
          </h1>
          <p className="mt-2 text-gray-600">
            View RFID scan logs and access kiosk URLs for your institution's gates.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setActiveTab('enter')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'enter'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <LogIn className="w-4 h-4" />
            Entrance Gate
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('exit')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'exit'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <LogOut className="w-4 h-4" />
            Exit Gate
          </button>
        </div>

        {/* Kiosk URL card */}
        {institutionId ? (
          <div className="bg-white rounded-lg shadow-sm ring-1 ring-gray-200 p-4 mb-6">
            <p className="text-sm font-medium text-gray-700 mb-2">
              {activeTab === 'enter' ? 'Entrance Gate' : 'Exit Gate'} Kiosk URL
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-800 truncate select-all">
                {activeUrl}
              </code>
              <button
                type="button"
                onClick={copyUrl}
                title="Copy URL"
                className="shrink-0 flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
              >
                <Copy className="w-4 h-4" />
                Copy
              </button>
              <a
                href={activeUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Open kiosk in new tab"
                className="shrink-0 flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Open
              </a>
            </div>
          </div>
        ) : (
          <p className="mb-6 text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm">
            No institution is linked to this account. Contact an administrator if you need access.
          </p>
        )}

        {/* Logs table */}
        {!institutionId ? null : isLoading ? (
          <p className="text-gray-600">Loading…</p>
        ) : error ? (
          <p className="text-red-600">Failed to load scan logs.</p>
        ) : logs.length === 0 ? (
          <p className="text-gray-600">No {activeTab === 'enter' ? 'entrance' : 'exit'} records found.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Student
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    LRN
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Device
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Scanned At
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{studentName(log)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{log.student?.lrn ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{log.device_name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatScannedAt(log.scanned_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
