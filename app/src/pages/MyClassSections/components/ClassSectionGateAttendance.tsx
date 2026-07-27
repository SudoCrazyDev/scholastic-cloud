import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { Loader2, RefreshCw, ScanLine, Search, User, LogIn, LogOut } from 'lucide-react'
import { Input } from '../../../components/input'
import { Badge } from '../../../components/badge'
import { useDebounce } from '../../../hooks/useDebounce'
import { rfidScanLogService } from '../../../services/rfidScanLogService'
import type { ClassSectionDailyAttendanceRow } from '../../../types'

interface ClassSectionGateAttendanceProps {
  classSectionId: string
}

function formatTime(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function fullName(student: ClassSectionDailyAttendanceRow['student']) {
  return [student.last_name, student.first_name, student.middle_name].filter(Boolean).join(', ')
}

const ClassSectionGateAttendance: React.FC<ClassSectionGateAttendanceProps> = ({ classSectionId }) => {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 400)

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['class-section-gate-attendance', classSectionId, date, debouncedSearch],
    queryFn: () =>
      rfidScanLogService.getClassSectionDaily({
        class_section_id: classSectionId,
        date,
        search: debouncedSearch || undefined,
      }),
    enabled: !!classSectionId && !!date,
    placeholderData: (previousData) => previousData,
  })

  const rows: ClassSectionDailyAttendanceRow[] = data?.data ?? []
  const summary = data?.summary

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <div className="flex items-center gap-2 lg:mr-auto">
            <ScanLine className="w-5 h-5 text-primary-600" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Gate Attendance</h3>
              <p className="text-xs text-gray-500">Recorded from RFID / ID scans at the school gates</p>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <div className="min-w-[240px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Student</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 z-10" />
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or LRN…"
                className="pl-9"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            title="Refresh"
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-400 hover:text-gray-700 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-gray-500">Students</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{summary.total_students}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-gray-500">Scanned In</p>
            <p className="mt-1 text-2xl font-semibold text-green-600">{summary.present}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-gray-500">No Scan</p>
            <p className="mt-1 text-2xl font-semibold text-red-600">{summary.absent}</p>
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="min-h-[240px] flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary-600" />
            <p className="mt-2 text-sm text-gray-600">Loading gate records…</p>
          </div>
        </div>
      ) : error ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <p className="text-red-600">Failed to load gate attendance.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <User className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No students found</h3>
          <p className="text-gray-600">
            {search ? `No students match "${search}"` : 'No students are assigned to this class section'}
          </p>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden ${
            isFetching ? 'opacity-60' : ''
          }`}
        >
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Student
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    <div className="flex items-center gap-1.5">
                      <LogIn className="w-4 h-4" />
                      Time In
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    <div className="flex items-center gap-1.5">
                      <LogOut className="w-4 h-4" />
                      Time Out
                    </div>
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Scans
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rows.map((row) => (
                  <tr key={row.student.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 uppercase">{fullName(row.student)}</div>
                      {row.student.lrn && <div className="text-xs text-gray-500">LRN: {row.student.lrn}</div>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{formatTime(row.first_in)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{formatTime(row.last_out)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600">
                      {row.scan_count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <Badge color={row.status === 'present' ? 'green' : 'red'}>
                        {row.status === 'present' ? 'Present' : 'No scan'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  )
}

export default ClassSectionGateAttendance
