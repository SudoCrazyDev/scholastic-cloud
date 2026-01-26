import { motion, AnimatePresence } from 'framer-motion'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { Button } from './button'
import PrintReportCard from './studentReportCard/studentReportCard.tsx'
import { Component, type ReactNode, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { staffService } from '../services/staffService'
import type { User } from '../types'

class PdfErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    // Keep a console trace for debugging
    // eslint-disable-next-line no-console
    console.error('ReportCard PDF render error:', error)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="w-full h-full flex items-center justify-center">
          <div className="max-w-lg rounded-lg border border-red-200 bg-red-50 p-4 text-sm">
            <div className="font-semibold text-red-800">PDF preview failed to render.</div>
            <div className="mt-2 text-red-700">{this.state.error.message}</div>
            <div className="mt-2 text-xs text-red-700/80">
              Open DevTools Console for the full stack trace.
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

interface StudentReportCardModalProps {
  isOpen: boolean
  onClose: () => void
  studentName?: string
  studentId?: string
  classSectionId?: string
  institutionId?: string
  academicYear?: string
}

export function StudentReportCardModal({
  isOpen,
  onClose,
  studentName,
  studentId,
  classSectionId,
  institutionId,
  academicYear,
}: StudentReportCardModalProps) {
  const handleClose = () => {
    onClose()
  }

  // Fetch principals from staff list (filter by role slug)
  const { data: staffsResponse } = useQuery({
    queryKey: ['staffs', { purpose: 'report-card-principals' }],
    queryFn: () => staffService.getStaffs({ limit: 200 }),
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const principals = useMemo(() => {
    const staffs = (staffsResponse?.data || []) as User[]
    const isPrincipal = (u: any) =>
      u?.role?.slug === 'principal' ||
      (Array.isArray(u?.user_institutions) && u.user_institutions.some((ui: any) => ui?.role?.slug === 'principal'))

    return staffs.filter(isPrincipal).sort((a, b) => {
      const al = (a.last_name || '').toLowerCase()
      const bl = (b.last_name || '').toLowerCase()
      const af = (a.first_name || '').toLowerCase()
      const bf = (b.first_name || '').toLowerCase()
      return al.localeCompare(bl) || af.localeCompare(bf)
    })
  }, [staffsResponse?.data])

  const formatPersonName = (u: Partial<User> | null | undefined) => {
    const first = (u?.first_name || '').trim()
    const last = (u?.last_name || '').trim()
    const middle = (u?.middle_name || '').trim()
    const ext = (u?.ext_name || '').trim()
    const mi = middle ? `${middle.charAt(0)}.` : ''
    const base = [first, mi, last].filter(Boolean).join(' ')
    return (ext ? `${base} ${ext}` : base).trim().toUpperCase()
  }

  const [selectedPrincipalId, setSelectedPrincipalId] = useState<string>('')

  useEffect(() => {
    if (!isOpen) return
    if (selectedPrincipalId) return
    if (principals.length > 0) {
      setSelectedPrincipalId(principals[0].id)
    }
  }, [isOpen, principals, selectedPrincipalId])

  const selectedPrincipal = useMemo(() => {
    return principals.find((p) => p.id === selectedPrincipalId) || null
  }, [principals, selectedPrincipalId])

  const principalName = formatPersonName(selectedPrincipal)

  const pdfKey = useMemo(() => {
    // include principal selection so PDFViewer remounts (avoids react-pdf incremental update bug)
    return `${studentId || ''}|${classSectionId || ''}|${institutionId || ''}|${academicYear || ''}|${selectedPrincipalId || ''}`
  }, [studentId, classSectionId, institutionId, academicYear, selectedPrincipalId])

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
            onClick={handleClose}
          />

          {/* Modal */}
          <div className="flex min-h-full items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-6xl bg-white rounded-lg shadow-xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <div className="flex items-center space-x-3">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Report Card - {studentName || 'Student'}
                  </h3>
                </div>
                <button
                  onClick={handleClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6">
                {principals.length > 1 && (
                  <div className="mb-3 flex items-center gap-3">
                    <div className="text-sm font-medium text-gray-700">Principal</div>
                    <select
                      className="border border-gray-300 rounded-md px-3 py-1 text-sm"
                      value={selectedPrincipalId}
                      onChange={(e) => setSelectedPrincipalId(e.target.value)}
                    >
                      {principals.map((p) => (
                        <option key={p.id} value={p.id}>
                          {formatPersonName(p)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="w-full h-[600px]">
                  <PdfErrorBoundary>
                    <PrintReportCard
                      viewerKey={pdfKey}
                      viewerHeight="100%"
                      principalName={principalName}
                      studentId={studentId || ''}
                      classSectionId={classSectionId || ''}
                      institutionId={institutionId || ''}
                      academicYear={academicYear}
                    />
                  </PdfErrorBoundary>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200">
                <Button
                  variant="outline"
                  onClick={handleClose}
                >
                  Close
                </Button>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
} 