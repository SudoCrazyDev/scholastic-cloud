import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { CpuChipIcon, PencilIcon, TrashIcon, PlusIcon, XMarkIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { Button } from '../../../components/button'
import { Input } from '../../../components/input'
import { studentRfidTagService } from '../../../services/studentRfidTagService'
import { StudentIdCardPrint } from './StudentIdCardPrint'
import { toast } from 'react-hot-toast'
import type { Student, StudentRfidTag } from '../../../types'

interface StudentIdTabProps {
  student: Student
}

export function StudentIdTab({ student }: StudentIdTabProps) {
  const [rfidTag, setRfidTag] = useState<StudentRfidTag | null>(null)
  const [loadingRfid, setLoadingRfid] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [rfidValue, setRfidValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)

  useEffect(() => {
    fetchRfidTag()
  }, [student.id])

  const fetchRfidTag = async () => {
    setLoadingRfid(true)
    try {
      const res = await studentRfidTagService.getByStudent(student.id)
      setRfidTag(res.data?.[0] ?? null)
    } catch {
      setRfidTag(null)
    } finally {
      setLoadingRfid(false)
    }
  }

  const openModal = () => {
    setRfidValue(rfidTag?.rfid_uid ?? '')
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!rfidValue.trim()) return
    setSaving(true)
    try {
      if (rfidTag) {
        const res = await studentRfidTagService.update(rfidTag.id, { rfid_uid: rfidValue.trim() })
        setRfidTag(res.data)
        toast.success('RFID tag updated.')
      } else {
        const res = await studentRfidTagService.create({ student_id: student.id, rfid_uid: rfidValue.trim() })
        setRfidTag(res.data)
        toast.success('RFID tag assigned.')
      }
      setModalOpen(false)
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to save RFID tag.')
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    if (!rfidTag) return
    setRemoving(true)
    try {
      await studentRfidTagService.remove(rfidTag.id)
      setRfidTag(null)
      toast.success('RFID tag removed.')
    } catch {
      toast.error('Failed to remove RFID tag.')
    } finally {
      setRemoving(false)
    }
  }

  const fullName = [student.first_name, student.middle_name, student.last_name]
    .filter(Boolean)
    .join(' ')

  const downloadQR = () => {
    const svg = document.getElementById('student-qr-code') as unknown as SVGSVGElement
    if (!svg) return
    const serialized = new XMLSerializer().serializeToString(svg)
    const blob = new Blob([serialized], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 400
      canvas.height = 400
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, 400, 400)
      ctx.drawImage(img, 0, 0, 400, 400)
      URL.revokeObjectURL(url)
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = `${student.last_name}-${student.first_name}-student-qr.png`
      a.click()
    }
    img.src = url
  }

  return (
    <div className="space-y-6">
      {/* Print a designed ID card (from saved templates) */}
      <StudentIdCardPrint student={student} />

      {/* Quick ID Card (auto-generated QR) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-6">Quick ID Card</h3>

        <div className="flex flex-col items-center gap-4">
          <div className="w-80 rounded-2xl overflow-hidden shadow-lg border border-indigo-100 bg-gradient-to-br from-indigo-600 to-indigo-800 text-white">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-indigo-500/40">
              <p className="text-xs font-semibold uppercase tracking-widest text-indigo-200">
                ScholasticCloud
              </p>
              <p className="text-sm text-indigo-200 mt-0.5">Student Identification Card</p>
            </div>

            {/* Body */}
            <div className="px-6 py-5 flex items-center gap-5">
              <div className="w-16 h-16 rounded-full overflow-hidden bg-indigo-500/40 flex-shrink-0 border-2 border-white/30">
                {student.profile_picture ? (
                  <img src={student.profile_picture} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white text-2xl font-bold">
                    {student.first_name?.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-base leading-tight truncate uppercase">{fullName}</p>
                {student.lrn && (
                  <p className="text-xs text-indigo-200 mt-1">LRN: {student.lrn}</p>
                )}
                {student.gender && (
                  <p className="text-xs text-indigo-200 capitalize mt-0.5">{student.gender}</p>
                )}
              </div>
            </div>

            {/* QR Code */}
            <div className="bg-white mx-4 mb-5 rounded-xl p-4 flex justify-center">
              <QRCodeSVG
                id="student-qr-code"
                value={student.id}
                size={160}
                level="M"
                includeMargin={false}
              />
            </div>
          </div>

          <Button variant="outline" size="sm" onClick={downloadQR}>
            <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
            Download QR Code
          </Button>
        </div>
      </div>

      {/* RFID Tag */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CpuChipIcon className="w-5 h-5 text-indigo-600" />
            <h3 className="text-base font-semibold text-gray-900">RFID Tag</h3>
          </div>
          <Button size="sm" onClick={openModal} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            <PlusIcon className="w-4 h-4 mr-1.5" />
            {rfidTag ? 'Update Tag' : 'Assign Tag'}
          </Button>
        </div>

        {loadingRfid ? (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-500" />
            Loading...
          </div>
        ) : rfidTag ? (
          <div className="flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3">
            <div>
              <p className="text-xs text-indigo-500 font-medium uppercase tracking-wide">UID</p>
              <p className="text-sm font-mono font-semibold text-indigo-900 mt-0.5">{rfidTag.rfid_uid}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${rfidTag.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {rfidTag.is_active ? 'Active' : 'Inactive'}
              </span>
              <button
                onClick={openModal}
                className="p-1.5 text-indigo-400 hover:text-indigo-600 transition-colors"
                title="Edit RFID tag"
              >
                <PencilIcon className="w-4 h-4" />
              </button>
              <button
                onClick={handleRemove}
                disabled={removing}
                className="p-1.5 text-red-400 hover:text-red-600 transition-colors disabled:opacity-50"
                title="Remove RFID tag"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">No RFID tag assigned to this student.</p>
        )}
      </div>

      {/* RFID Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-500/75" onClick={() => setModalOpen(false)} />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6 z-10">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <CpuChipIcon className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-base font-semibold text-gray-900">
                    {rfidTag ? 'Update RFID Tag' : 'Assign RFID Tag'}
                  </h3>
                </div>
                <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600">
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
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                  autoFocus
                />
                <p className="mt-1.5 text-xs text-gray-400">
                  You can scan the RFID card directly into this field.
                </p>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button
                  onClick={handleSave}
                  loading={saving}
                  disabled={saving || !rfidValue.trim()}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {rfidTag ? 'Update' : 'Assign'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
