import { useState } from 'react'
import { motion } from 'framer-motion'

function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative group/tip">
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50
                      opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150">
        <div className="bg-gray-900 text-white text-xs font-medium px-2 py-1 rounded whitespace-nowrap shadow-lg">
          {label}
        </div>
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
      </div>
    </div>
  )
}
import {
  EyeIcon,
  TrashIcon,
  UserIcon,
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
    const parts = [student.last_name, student.first_name, student.middle_name].filter(Boolean)
    const fullName = parts.join(', ')
    return student.ext_name ? `${fullName} ${student.ext_name}` : fullName
  }

  const getGenderColor = (gender: string) => {
    switch (gender) {
      case 'male': return 'blue'
      case 'female': return 'pink'
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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          <span className="ml-3 text-gray-600">Loading students...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="text-center py-12">
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
          <p className="text-gray-500">Get started by creating your first student record.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="w-10 px-4 py-3">
                <Checkbox
                  checked={selectedRows.length === students.length && students.length > 0}
                  onChange={handleSelectAll}
                  indeterminate={selectedRows.length > 0 && selectedRows.length < students.length}
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Student
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                LRN
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Gender
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Current Section
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {students.map((student, index) => (
              <motion.tr
                key={student.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: index * 0.02 }}
                className={`group transition-colors ${
                  isSelected(student) ? 'bg-indigo-50' : 'hover:bg-gray-50'
                }`}
              >
                {/* Checkbox */}
                <td className="px-4 py-2">
                  <Checkbox
                    checked={isSelected(student)}
                    onChange={(checked) => handleSelectStudent(student, checked)}
                  />
                </td>

                {/* Student */}
                <td className="px-4 py-2">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-indigo-100 flex-shrink-0 relative flex items-center justify-center overflow-hidden">
                      {student.profile_picture ? (
                        <img
                          src={student.profile_picture}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover rounded-full"
                        />
                      ) : (
                        <UserIcon className="w-4 h-4 text-indigo-500" />
                      )}
                    </div>
                    <span className="text-sm font-semibold text-gray-900 uppercase">
                      {getFullName(student)}
                    </span>
                  </div>
                </td>

                {/* LRN */}
                <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                  {student.lrn || '—'}
                </td>

                {/* Gender */}
                <td className="px-4 py-2">
                  <Badge color={getGenderColor(student.gender || 'other')}>
                    {(student.gender || 'other').charAt(0).toUpperCase() + (student.gender || 'other').slice(1)}
                  </Badge>
                </td>

                {/* Current Section */}
                <td className="px-4 py-2">
                  {student.current_section ? (
                    <Badge color="indigo">{student.current_section}</Badge>
                  ) : (
                    <span className="text-sm text-gray-400">—</span>
                  )}
                </td>

                {/* Actions */}
                <td className="px-4 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <Tooltip label="View details">
                      <button
                        onClick={() => onView(student)}
                        className="p-1.5 rounded text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                      >
                        <EyeIcon className="w-4 h-4" />
                      </button>
                    </Tooltip>
                    <Tooltip label="Edit student">
                      <button
                        onClick={() => onEdit(student)}
                        className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                    </Tooltip>
                    <Tooltip label="Assign RFID tag">
                      <button
                        onClick={() => openRfidModal(student)}
                        className="p-1.5 rounded text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                      >
                        <CpuChipIcon className="w-4 h-4" />
                      </button>
                    </Tooltip>
                    <Tooltip label="Download QR code">
                      <button
                        onClick={() => handleDownloadQR(student)}
                        className="p-1.5 rounded text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                      >
                        <ArrowDownTrayIcon className="w-4 h-4" />
                      </button>
                    </Tooltip>
                    <Tooltip label="Reset portal password">
                      <button
                        onClick={() => onPasswordReset(student)}
                        className="p-1.5 rounded text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                      >
                        <KeyIcon className="w-4 h-4" />
                      </button>
                    </Tooltip>
                    <Tooltip label="Delete student">
                      <button
                        onClick={() => onDelete(student)}
                        className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </Tooltip>
                  </div>

                  {/* Hidden QR canvas for download */}
                  {qrStudent?.id === student.id && (
                    <div className="absolute -top-[9999px] -left-[9999px] pointer-events-none">
                      <QRCodeCanvas id={`qr-canvas-${student.id}`} value={student.id} size={400} level="M" />
                    </div>
                  )}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
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
