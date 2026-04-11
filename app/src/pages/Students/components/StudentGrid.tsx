import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  EyeIcon,
  TrashIcon,
  UserIcon,
  CalendarIcon,
  AcademicCapIcon,
  PencilIcon,
  KeyIcon,
  CpuChipIcon,
  ArrowDownTrayIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { QRCodeCanvas } from 'qrcode.react'
import { Checkbox } from '../../../components/checkbox'
import { Badge } from '../../../components/badge'
import { Button } from '../../../components/button'
import { Input } from '../../../components/input'
import { studentRfidTagService } from '../../../services/studentRfidTagService'
import { toast } from 'react-hot-toast'
import type { Student } from '../../../types'

interface StudentGridProps {
  students: Student[]
  loading: boolean
  error: string | null
  selectedRows: Student[]
  onSelectionChange: (students: Student[]) => void
  onView: (student: Student) => void
  onEdit: (student: Student) => void
  onPasswordReset: (student: Student) => void
  onDelete: (student: Student) => void
}

export const StudentGrid: React.FC<StudentGridProps> = ({
  students,
  loading,
  error,
  selectedRows,
  onSelectionChange,
  onView,
  onEdit,
  onPasswordReset,
  onDelete,
}) => {
  const [rfidStudent, setRfidStudent] = useState<Student | null>(null)
  const [rfidValue, setRfidValue] = useState('')
  const [rfidSaving, setRfidSaving] = useState(false)
  const [qrStudent, setQrStudent] = useState<Student | null>(null)

  const handleSelectAll = (checked: boolean) => {
    onSelectionChange(checked ? students : [])
  }

  const handleSelectStudent = (student: Student, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedRows, student])
    } else {
      onSelectionChange(selectedRows.filter(item => item.id !== student.id))
    }
  }

  const isSelected = (student: Student) => selectedRows.some(item => item.id === student.id)

  const getFullName = (student: Student) => {
    const parts = [student.first_name, student.middle_name, student.last_name].filter(Boolean)
    const fullName = parts.join(' ')
    return student.ext_name ? `${fullName} ${student.ext_name}` : fullName
  }

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

  const getGenderColor = (gender: string) => {
    switch (gender) {
      case 'male': return 'blue'
      case 'female': return 'pink'
      default: return 'zinc'
    }
  }

  const getReligionColor = (religion: string) => {
    switch (religion) {
      case 'Islam': return 'green'
      case 'Catholic': return 'purple'
      case 'Iglesia Ni Cristo': return 'blue'
      case 'Baptists': return 'indigo'
      default: return 'zinc'
    }
  }

  const openRfidModal = (student: Student) => {
    setRfidStudent(student)
    setRfidValue('')
  }

  const handleRfidSave = async () => {
    if (!rfidStudent || !rfidValue.trim()) return
    setRfidSaving(true)
    try {
      // Check for existing tag first
      const existing = await studentRfidTagService.getByStudent(rfidStudent.id)
      const tag = existing.data?.[0]
      if (tag) {
        await studentRfidTagService.update(tag.id, { rfid_uid: rfidValue.trim() })
        toast.success('RFID tag updated.')
      } else {
        await studentRfidTagService.create({ student_id: rfidStudent.id, rfid_uid: rfidValue.trim() })
        toast.success('RFID tag assigned.')
      }
      setRfidStudent(null)
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to save RFID tag.')
    } finally {
      setRfidSaving(false)
    }
  }

  const handleDownloadQR = (student: Student) => {
    setQrStudent(student)
    // Allow the hidden canvas to render, then download
    setTimeout(() => {
      const canvas = document.getElementById(`qr-canvas-${student.id}`) as HTMLCanvasElement
      if (!canvas) return
      const out = document.createElement('canvas')
      out.width = 400
      out.height = 400
      const ctx = out.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, 400, 400)
      ctx.drawImage(canvas, 0, 0, 400, 400)
      const a = document.createElement('a')
      a.href = out.toDataURL('image/png')
      a.download = `${student.last_name}-${student.first_name}-student-qr.png`
      a.click()
      setQrStudent(null)
    }, 50)
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <span className="ml-3 text-gray-600">Loading students...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Students</h3>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  if (students.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <UserIcon className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Students Found</h3>
          <p className="text-gray-500 mb-6">Get started by creating your first student record.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        {/* Header with select all */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <Checkbox
              checked={selectedRows.length === students.length && students.length > 0}
              onChange={handleSelectAll}
              indeterminate={selectedRows.length > 0 && selectedRows.length < students.length}
            />
            <span className="text-sm text-gray-600">
              {selectedRows.length > 0
                ? `${selectedRows.length} of ${students.length} selected`
                : `${students.length} students`}
            </span>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {students.map((student) => (
            <motion.div
              key={student.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={`relative group border rounded-lg p-4 transition-all duration-200 hover:shadow-md ${
                isSelected(student)
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              {/* Selection checkbox */}
              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <Checkbox
                  checked={isSelected(student)}
                  onChange={(checked) => handleSelectStudent(student, checked)}
                />
              </div>

              {/* Avatar */}
              <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-3 overflow-hidden">
                {student.profile_picture ? (
                  <img
                    src={student.profile_picture}
                    alt={`${getFullName(student)} profile`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <UserIcon className="w-6 h-6 text-indigo-600" />
                )}
              </div>

              {/* Student info */}
              <div className="space-y-2">
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm truncate uppercase" title={getFullName(student)}>
                    {getFullName(student)}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge color={getGenderColor(student.gender || 'other')}>
                      {(student.gender || 'other').charAt(0).toUpperCase() + (student.gender || 'other').slice(1)}
                    </Badge>
                    <Badge color={getReligionColor(student.religion || 'Others')}>
                      {student.religion || 'Others'}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center text-xs text-gray-600">
                    <AcademicCapIcon className="w-3 h-3 mr-1 flex-shrink-0" />
                    <span className="truncate" title={student.lrn}>LRN: {student.lrn}</span>
                  </div>
                  <div className="flex items-center text-xs text-gray-600">
                    <CalendarIcon className="w-3 h-3 mr-1 flex-shrink-0" />
                    <span className="truncate">Born {formatDate(student.birthdate)}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-1">
                <button
                  onClick={() => onView(student)}
                  className="p-1 text-gray-400 hover:text-indigo-600 transition-colors"
                  title="View student details"
                >
                  <EyeIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onEdit(student)}
                  className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                  title="Edit student"
                >
                  <PencilIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => openRfidModal(student)}
                  className="p-1 text-gray-400 hover:text-green-600 transition-colors"
                  title="Assign RFID tag"
                >
                  <CpuChipIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDownloadQR(student)}
                  className="p-1 text-gray-400 hover:text-purple-600 transition-colors"
                  title="Download QR code"
                >
                  <ArrowDownTrayIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onPasswordReset(student)}
                  className="p-1 text-gray-400 hover:text-amber-600 transition-colors"
                  title="Reset portal password"
                >
                  <KeyIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onDelete(student)}
                  className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                  title="Delete student"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>

              {/* Hidden QR canvas for download */}
              {qrStudent?.id === student.id && (
                <div className="absolute -top-[9999px] -left-[9999px] pointer-events-none">
                  <QRCodeCanvas
                    id={`qr-canvas-${student.id}`}
                    value={student.id}
                    size={400}
                    level="M"
                  />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>

      {/* RFID Modal */}
      {rfidStudent && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-500/75" onClick={() => setRfidStudent(null)} />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6 z-10">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <CpuChipIcon className="w-5 h-5 text-indigo-600" />
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">Assign RFID Tag</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {rfidStudent.last_name}, {rfidStudent.first_name}
                    </p>
                  </div>
                </div>
                <button onClick={() => setRfidStudent(null)} className="text-gray-400 hover:text-gray-600">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">RFID UID</label>
                <Input
                  type="text"
                  placeholder="Scan or enter RFID UID"
                  value={rfidValue}
                  onChange={(e) => setRfidValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRfidSave()}
                  autoFocus
                />
                <p className="mt-1.5 text-xs text-gray-400">
                  You can scan the RFID card directly into this field.
                </p>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <Button variant="outline" onClick={() => setRfidStudent(null)}>Cancel</Button>
                <Button
                  onClick={handleRfidSave}
                  loading={rfidSaving}
                  disabled={rfidSaving || !rfidValue.trim()}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  Assign
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
