import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Clock, Calendar } from 'lucide-react'
import type { Subject, UpdateSubjectScheduleData } from '../../types'

const DAYS = [
  { key: 'monday',    label: 'Mon' },
  { key: 'tuesday',   label: 'Tue' },
  { key: 'wednesday', label: 'Wed' },
  { key: 'thursday',  label: 'Thu' },
  { key: 'friday',    label: 'Fri' },
  { key: 'saturday',  label: 'Sat' },
]

interface ScheduleModalProps {
  isOpen: boolean
  subject: Subject | null
  onClose: () => void
  onSave: (subjectId: string, data: UpdateSubjectScheduleData) => void
  loading?: boolean
  error?: string | null
}

const ScheduleModal: React.FC<ScheduleModalProps> = ({
  isOpen,
  subject,
  onClose,
  onSave,
  loading,
  error,
}) => {
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime]     = useState('')
  const [selectedDays, setSelectedDays] = useState<string[]>([])

  useEffect(() => {
    if (subject) {
      setStartTime(subject.start_time?.slice(0, 5) ?? '')
      setEndTime(subject.end_time?.slice(0, 5) ?? '')
      setSelectedDays(subject.meeting_days ?? [])
    }
  }, [subject])

  const toggleDay = (day: string) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    )
  }

  const handleClear = () => {
    if (!subject) return
    onSave(subject.id, { start_time: null, end_time: null, meeting_days: null })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!subject) return
    onSave(subject.id, {
      start_time: startTime || null,
      end_time: endTime || null,
      meeting_days: selectedDays.length > 0 ? selectedDays : null,
    })
  }

  const isScheduled = !!(subject?.start_time || subject?.end_time || subject?.meeting_days?.length)

  return (
    <AnimatePresence>
      {isOpen && subject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.15 }}
            className="relative bg-white rounded-xl shadow-2xl w-full max-w-md z-10"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Set Schedule</h2>
                <p className="text-sm text-gray-500 mt-0.5">{subject.title}{subject.variant ? ` — ${subject.variant}` : ''}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Days */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                  <Calendar className="w-4 h-4 text-indigo-500" />
                  Meeting Days
                </label>
                <div className="flex gap-2 flex-wrap">
                  {DAYS.map(day => (
                    <button
                      key={day.key}
                      type="button"
                      onClick={() => toggleDay(day.key)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                        selectedDays.includes(day.key)
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                    <Clock className="w-4 h-4 text-indigo-500" />
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                    <Clock className="w-4 h-4 text-indigo-500" />
                    End Time
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={e => setEndTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2">
                {isScheduled ? (
                  <button
                    type="button"
                    onClick={handleClear}
                    disabled={loading}
                    className="text-sm text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
                  >
                    Clear schedule
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={loading}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {loading && (
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                    )}
                    Save Schedule
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export default ScheduleModal
