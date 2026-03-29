import React from 'react'
import { Edit2 } from 'lucide-react'
import type { Subject } from '../../types'

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const DAY_LABELS: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
}

// Generate half-hour slots from 6:00 to 19:00
const TIME_SLOTS: string[] = []
for (let h = 6; h < 19; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`)
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`)
}
TIME_SLOTS.push('19:00')

const SLOT_HEIGHT_PX = 40 // px per 30-min slot

const SUBJECT_COLORS = [
  'bg-indigo-100 border-indigo-300 text-indigo-800',
  'bg-emerald-100 border-emerald-300 text-emerald-800',
  'bg-amber-100 border-amber-300 text-amber-800',
  'bg-rose-100 border-rose-300 text-rose-800',
  'bg-violet-100 border-violet-300 text-violet-800',
  'bg-cyan-100 border-cyan-300 text-cyan-800',
  'bg-orange-100 border-orange-300 text-orange-800',
  'bg-teal-100 border-teal-300 text-teal-800',
  'bg-pink-100 border-pink-300 text-pink-800',
  'bg-sky-100 border-sky-300 text-sky-800',
]

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function minutesToOffset(minutes: number): number {
  const startMin = 6 * 60
  const relMin = minutes - startMin
  return (relMin / 30) * SLOT_HEIGHT_PX
}

function durationToPx(startTime: string, endTime: string): number {
  const diff = timeToMinutes(endTime) - timeToMinutes(startTime)
  return (diff / 30) * SLOT_HEIGHT_PX
}

interface SubjectBlock {
  subject: Subject
  colorClass: string
}

interface TimetableGridProps {
  subjects: Subject[]
  conflictSubjectIds: Set<string>
  onEditSchedule: (subject: Subject) => void
}

const TimetableGrid: React.FC<TimetableGridProps> = ({ subjects, conflictSubjectIds, onEditSchedule }) => {
  // Map subject id to color index (stable across renders)
  const colorMap = React.useMemo(() => {
    const map = new Map<string, string>()
    subjects.forEach((s, i) => {
      map.set(s.id, SUBJECT_COLORS[i % SUBJECT_COLORS.length])
    })
    return map
  }, [subjects])

  // Build a map: day -> list of SubjectBlocks
  const daySubjects = React.useMemo(() => {
    const map: Record<string, SubjectBlock[]> = {}
    DAYS.forEach(d => (map[d] = []))

    subjects.forEach(subject => {
      if (!subject.start_time || !subject.end_time || !subject.meeting_days?.length) return
      subject.meeting_days.forEach(day => {
        if (map[day]) {
          map[day].push({
            subject,
            colorClass: colorMap.get(subject.id) ?? SUBJECT_COLORS[0],
          })
        }
      })
    })
    return map
  }, [subjects, colorMap])

  const totalHeight = TIME_SLOTS.length * SLOT_HEIGHT_PX

  return (
    <div className="overflow-auto rounded-xl border border-gray-200 bg-white">
      {/* Header row */}
      <div className="flex border-b border-gray-200 bg-gray-50 sticky top-0 z-10">
        {/* Time gutter */}
        <div className="w-16 flex-shrink-0" />
        {DAYS.map(day => (
          <div
            key={day}
            className="flex-1 min-w-[120px] py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider border-l border-gray-200"
          >
            {DAY_LABELS[day]}
          </div>
        ))}
      </div>

      {/* Grid body */}
      <div className="flex">
        {/* Time labels */}
        <div className="w-16 flex-shrink-0 relative" style={{ height: totalHeight }}>
          {TIME_SLOTS.map((slot, i) => (
            <div
              key={slot}
              className="absolute right-2 text-[10px] text-gray-400 leading-none"
              style={{ top: i * SLOT_HEIGHT_PX - 6 }}
            >
              {i % 2 === 0 ? slot : ''}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {DAYS.map(day => (
          <div
            key={day}
            className="flex-1 min-w-[120px] relative border-l border-gray-200"
            style={{ height: totalHeight }}
          >
            {/* Horizontal slot lines */}
            {TIME_SLOTS.map((_, i) => (
              <div
                key={i}
                className={`absolute w-full border-t ${i % 2 === 0 ? 'border-gray-200' : 'border-gray-100'}`}
                style={{ top: i * SLOT_HEIGHT_PX }}
              />
            ))}

            {/* Subject blocks */}
            {daySubjects[day].map(({ subject, colorClass }) => {
              const topPx = minutesToOffset(timeToMinutes(subject.start_time!.slice(0, 5)))
              const heightPx = durationToPx(subject.start_time!.slice(0, 5), subject.end_time!.slice(0, 5))
              const isConflict = conflictSubjectIds.has(subject.id)

              return (
                <div
                  key={subject.id}
                  className={`absolute left-1 right-1 rounded-md border px-2 py-1 overflow-hidden cursor-pointer group transition-shadow hover:shadow-md ${colorClass} ${
                    isConflict ? 'ring-2 ring-red-400 ring-offset-1' : ''
                  }`}
                  style={{ top: topPx + 1, height: Math.max(heightPx - 2, 20) }}
                  onClick={() => onEditSchedule(subject)}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate leading-tight">{subject.title}</p>
                      {subject.variant && (
                        <p className="text-[10px] truncate opacity-70">{subject.variant}</p>
                      )}
                      {heightPx >= 50 && (
                        <p className="text-[10px] opacity-60 mt-0.5">
                          {subject.start_time?.slice(0, 5)} – {subject.end_time?.slice(0, 5)}
                        </p>
                      )}
                    </div>
                    <Edit2 className="w-3 h-3 flex-shrink-0 opacity-0 group-hover:opacity-60 mt-0.5 transition-opacity" />
                  </div>
                  {isConflict && (
                    <span className="absolute bottom-1 right-1 text-[9px] bg-red-500 text-white rounded px-1">
                      conflict
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export default TimetableGrid
