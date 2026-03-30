import React, { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, Users } from 'lucide-react'
import { Autocomplete } from '../../components/autocomplete'
import { staffService } from '../../services/staffService'
import { classSectionService } from '../../services/classSectionService'
import { timetableService } from '../../services/timetableService'
import type { TeacherTimetableData } from '../../services/timetableService'
import { AddScheduleModal } from './AddScheduleModal'

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
type Day = typeof DAYS[number]

const DAY_LABELS: Record<Day, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
}

const START_HOUR = 6   // 6 AM
const END_HOUR = 18    // 6 PM
const PX_PER_HOUR = 80
const GRID_HEIGHT = (END_HOUR - START_HOUR) * PX_PER_HOUR

// One color per teacher column (cycles if > 5 selected)
const COLUMN_COLORS = [
  'bg-indigo-100 border-indigo-300 text-indigo-800',
  'bg-emerald-100 border-emerald-300 text-emerald-800',
  'bg-amber-100 border-amber-300 text-amber-800',
  'bg-rose-100 border-rose-300 text-rose-800',
  'bg-sky-100 border-sky-300 text-sky-800',
  'bg-purple-100 border-purple-300 text-purple-800',
  'bg-orange-100 border-orange-300 text-orange-800',
]

const CHIP_COLORS = [
  'bg-indigo-100 text-indigo-800 hover:bg-indigo-200',
  'bg-emerald-100 text-emerald-800 hover:bg-emerald-200',
  'bg-amber-100 text-amber-800 hover:bg-amber-200',
  'bg-rose-100 text-rose-800 hover:bg-rose-200',
  'bg-sky-100 text-sky-800 hover:bg-sky-200',
  'bg-purple-100 text-purple-800 hover:bg-purple-200',
  'bg-orange-100 text-orange-800 hover:bg-orange-200',
]

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function formatHour(hour: number): string {
  if (hour === 12) return '12 PM'
  if (hour === 0) return '12 AM'
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`
}

interface TeacherOption {
  id: string
  label: string
}

const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i)

const TeacherTimetableTab: React.FC = () => {
  const [teacherSearch, setTeacherSearch] = useState('')
  const [autocompleteValue, setAutocompleteValue] = useState<TeacherOption | null>(null)
  const [selectedTeachers, setSelectedTeachers] = useState<TeacherOption[]>([])
  const [selectedDay, setSelectedDay] = useState<Day>('monday')
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('')
  const [addScheduleOpen, setAddScheduleOpen] = useState(false)
  const [slotDefaults, setSlotDefaults] = useState<{ start: string; end: string }>({ start: '', end: '' })

  // Fetch available academic years
  const { data: academicYearsResponse } = useQuery({
    queryKey: ['academic-years'],
    queryFn: () => classSectionService.getAcademicYears(),
    staleTime: 5 * 60 * 1000,
  })
  const academicYears = academicYearsResponse?.data ?? []

  const openAtSlot = useCallback((hour: number) => {
    const pad = (n: number) => String(n).padStart(2, '0')
    setSlotDefaults({ start: `${pad(hour)}:00`, end: `${pad(hour + 1)}:00` })
    setAddScheduleOpen(true)
  }, [])

  // Debounced server-side teacher search
  const { data: staffResponse, isLoading: staffLoading } = useQuery({
    queryKey: ['staff-search-timetable', teacherSearch],
    queryFn: () => staffService.getStaffs({ search: teacherSearch || undefined, limit: 10 }),
    staleTime: 30 * 1000,
  })

  const staffOptions = (staffResponse?.data ?? [])
    .filter(s => !selectedTeachers.find(t => t.id === s.id))
    .map(s => ({
      id: s.id,
      label: `${s.first_name} ${s.last_name}`,
      description: (s as any).role?.name ?? undefined,
    }))

  // Fetch timetable data for all selected teachers in one request
  const teacherIds = selectedTeachers.map(t => t.id)
  const { data: timetableResponse, isLoading: timetableLoading } = useQuery({
    queryKey: ['teacher-timetable', ...teacherIds, selectedAcademicYear],
    queryFn: () => timetableService.getTeachersTimetable(teacherIds, selectedAcademicYear || undefined),
    enabled: teacherIds.length > 0,
    staleTime: 60 * 1000,
  })
  const timetableData: TeacherTimetableData = (timetableResponse?.data as any) ?? {}

  const handleTeacherSelect = useCallback((option: TeacherOption | null) => {
    if (!option) return
    setSelectedTeachers(prev => {
      if (prev.find(t => t.id === option.id)) return prev
      return [...prev, option]
    })
    setAutocompleteValue(null)
  }, [])

  const removeTeacher = useCallback((id: string) => {
    setSelectedTeachers(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <div className="space-y-4">
      {/* Teacher selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Select Teachers</label>
          <p className="text-xs text-gray-400">Search and select teachers to compare their schedules side by side.</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 sm:max-w-sm">
            <Autocomplete
              value={autocompleteValue}
              onChange={handleTeacherSelect}
              options={staffOptions}
              placeholder="Search teacher by name..."
              loading={staffLoading}
              onQueryChange={setTeacherSearch}
              filter={() => true}
            />
          </div>
          <div className="w-40 shrink-0">
            <select
              value={selectedAcademicYear}
              onChange={(e) => setSelectedAcademicYear(e.target.value)}
              className="w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-[calc(--spacing(2.5)-1px)] sm:py-[calc(--spacing(1.5)-1px)] text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All years</option>
              {academicYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {selectedTeachers.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {selectedTeachers.map((teacher, i) => (
              <span
                key={teacher.id}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium transition-colors ${CHIP_COLORS[i % CHIP_COLORS.length]}`}
              >
                {teacher.label}
                <button
                  type="button"
                  onClick={() => removeTeacher(teacher.id)}
                  className="rounded-full p-0.5 transition-opacity hover:opacity-70"
                  aria-label={`Remove ${teacher.label}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Empty state */}
      {selectedTeachers.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 py-16 flex flex-col items-center justify-center text-center">
          <Users className="w-12 h-12 text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm font-medium">No teachers selected</p>
          <p className="text-gray-400 text-xs mt-1">Search and add teachers above to view their weekly schedule</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Day tabs */}
          <div className="flex items-center gap-1 border-b border-gray-100 px-4 pt-3 overflow-x-auto">
            {DAYS.map(day => (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedDay(day)}
                className={`px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors whitespace-nowrap ${
                  selectedDay === day
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                {DAY_LABELS[day]}
              </button>
            ))}
          </div>

          {/* Loading */}
          {timetableLoading ? (
            <div className="py-16 flex items-center justify-center">
              <svg className="animate-spin w-8 h-8 text-indigo-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="flex min-w-max">
                {/* Time labels column */}
                <div className="w-16 flex-shrink-0 border-r border-gray-100 select-none">
                  {/* Header spacer to align with column headers */}
                  <div className="h-10 border-b border-gray-100" />
                  <div className="relative" style={{ height: GRID_HEIGHT }}>
                    {HOURS.map(hour => (
                      <div
                        key={hour}
                        className="absolute left-0 right-0 flex items-center justify-end pr-2"
                        style={{ top: (hour - START_HOUR) * PX_PER_HOUR - 8 }}
                      >
                        <span className="text-[10px] text-gray-400 leading-none">{formatHour(hour)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Teacher columns */}
                {selectedTeachers.map((teacher, colIdx) => {
                  const subjects = (timetableData[teacher.id] ?? []).filter(s =>
                    s.meeting_days?.includes(selectedDay)
                  )
                  const blockColor = COLUMN_COLORS[colIdx % COLUMN_COLORS.length]

                  return (
                    <div key={teacher.id} className="w-48 flex-shrink-0 border-r border-gray-100 last:border-r-0">
                      {/* Column header */}
                      <div className="h-10 border-b border-gray-100 px-2 flex items-center justify-center">
                        <span className="text-xs font-semibold text-gray-700 truncate text-center leading-tight">
                          {teacher.label}
                        </span>
                      </div>

                      {/* Schedule column body */}
                      <div className="relative" style={{ height: GRID_HEIGHT }}>
                        {/* Clickable per-hour slots */}
                        {HOURS.slice(0, -1).map(hour => (
                          <div
                            key={`slot-${hour}`}
                            className="absolute left-0 right-0 border-t border-gray-100 cursor-pointer hover:bg-indigo-50/50 transition-colors"
                            style={{ top: (hour - START_HOUR) * PX_PER_HOUR, height: PX_PER_HOUR }}
                            onClick={() => openAtSlot(hour)}
                          >
                            {/* 30-min line inside each slot */}
                            <div
                              className="absolute left-0 right-0 border-t border-gray-50"
                              style={{ top: PX_PER_HOUR / 2 }}
                            />
                          </div>
                        ))}
                        {/* Last border line */}
                        <div
                          className="absolute left-0 right-0 border-t border-gray-100"
                          style={{ top: (END_HOUR - START_HOUR) * PX_PER_HOUR }}
                        />

                        {/* Subject blocks */}
                        {subjects.map(subject => {
                          const startMin = timeToMinutes(subject.start_time)
                          const endMin = timeToMinutes(subject.end_time)
                          const clampedStart = Math.max(startMin, START_HOUR * 60)
                          const clampedEnd = Math.min(endMin, END_HOUR * 60)
                          const top = ((clampedStart - START_HOUR * 60) / 60) * PX_PER_HOUR
                          const height = ((clampedEnd - clampedStart) / 60) * PX_PER_HOUR

                          if (height <= 0) return null

                          return (
                            <div
                              key={subject.id}
                              className={`absolute left-1 right-1 rounded border px-1.5 py-1 overflow-hidden ${blockColor}`}
                              style={{ top: top + 1, height: Math.max(height - 2, 20) }}
                              title={`${subject.title} · ${subject.grade_level ?? ''} ${subject.section ?? ''} · ${subject.start_time.slice(0, 5)}–${subject.end_time.slice(0, 5)}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <p className="text-[11px] font-semibold leading-tight truncate">{subject.title}</p>
                              {height > 30 && subject.section && (
                                <p className="text-[10px] opacity-70 leading-tight truncate">
                                  {subject.grade_level} – {subject.section}
                                </p>
                              )}
                              {height > 45 && (
                                <p className="text-[10px] opacity-60 leading-tight">
                                  {subject.start_time.slice(0, 5)}–{subject.end_time.slice(0, 5)}
                                </p>
                              )}
                            </div>
                          )
                        })}

                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
      <AddScheduleModal
        isOpen={addScheduleOpen}
        onClose={() => setAddScheduleOpen(false)}
        defaultStartTime={slotDefaults.start}
        defaultEndTime={slotDefaults.end}
      />
    </div>
  )
}

export default TeacherTimetableTab
