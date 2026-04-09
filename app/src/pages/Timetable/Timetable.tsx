import React, { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { CalendarDays, AlertTriangle, Clock, BookOpen, ChevronDown, Edit2, Maximize2, Minimize2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { classSectionService } from '../../services/classSectionService'
import { useSectionTimetable, useTimetableConflicts, useUpdateSubjectSchedule } from '../../hooks/useTimetable'
import { useAuth } from '../../hooks/useAuth'
import { Autocomplete } from '../../components/autocomplete'
import TimetableGrid from './TimetableGrid'
import ScheduleModal from './ScheduleModal'
import TeacherTimetableTab from './TeacherTimetableTab'
import type { Subject } from '../../types'

type ActiveTab = 'section' | 'teacher'

const DAY_LABELS: Record<string, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
}

const Timetable: React.FC = () => {
  const { user } = useAuth()
  const institutionId = user?.user_institutions?.[0]?.institution_id ?? ''

  const [activeTab, setActiveTab] = useState<ActiveTab>('section')
  const [selectedSection, setSelectedSection] = useState<{ id: string; label: string } | null>(null)
  const [showConflicts, setShowConflicts] = useState(false)
  const [sectionSearch, setSectionSearch] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  // Fetch sections for the dropdown — server-side search, limited to 5 results
  const { data: sectionsResponse, isLoading: sectionsLoading } = useQuery({
    queryKey: ['class-sections-timetable', institutionId, sectionSearch],
    queryFn: () => classSectionService.getClassSectionsByInstitution(institutionId, {
      search: sectionSearch || undefined,
      per_page: 5,
    }),
    enabled: !!institutionId,
    staleTime: 30 * 1000,
  })
  const sections = sectionsResponse?.data ?? []

  const sectionOptions = sections.map(s => ({
    id: s.id,
    label: `${s.grade_level} – ${s.title}`,
    description: s.academic_year ?? undefined,
  }))

  // Timetable data for selected section
  const { data: timetableResponse, isLoading: timetableLoading } = useSectionTimetable(selectedSection?.id ?? null)
  const subjects = timetableResponse?.data?.subjects ?? []

  // Conflict detection
  const { data: conflictsResponse } = useTimetableConflicts(!!institutionId)
  const conflicts = conflictsResponse?.data ?? []

  const conflictSubjectIds = React.useMemo(() => {
    const ids = new Set<string>()
    conflicts.forEach(c => {
      ids.add(c.subject_a.id)
      ids.add(c.subject_b.id)
    })
    return ids
  }, [conflicts])

  // Schedule modal
  const {
    mutation: scheduleMutation,
    scheduleModalOpen,
    editingSubject,
    openScheduleModal,
    closeScheduleModal,
  } = useUpdateSubjectSchedule()

  const scheduledSubjects = subjects.filter(s => s.start_time && s.end_time)
  const unscheduledSubjects = subjects.filter(s => !s.start_time || !s.end_time)

  return (
    <div
      ref={containerRef}
      className={`space-y-6 ${isFullscreen ? 'bg-gray-50 p-6 overflow-y-auto h-screen' : ''}`}
    >
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <CalendarDays className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Timetable</h1>
            <p className="text-sm text-gray-500">Schedule subjects across the week for each section</p>
          </div>
        </div>

        <button
          type="button"
          onClick={toggleFullscreen}
          className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
        </button>

        {activeTab === 'section' && conflicts.length > 0 && (
          <button
            type="button"
            onClick={() => setShowConflicts(v => !v)}
            className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors"
          >
            <AlertTriangle className="w-4 h-4" />
            {conflicts.length} Conflict{conflicts.length !== 1 ? 's' : ''} Detected
            <ChevronDown className={`w-4 h-4 transition-transform ${showConflicts ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          type="button"
          onClick={() => setActiveTab('section')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'section'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <CalendarDays className="w-4 h-4" />
          Class Section
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('teacher')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'teacher'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Teacher Schedule
        </button>
      </div>

      {activeTab === 'section' && (
        <>
          {/* Conflicts Panel */}
          {showConflicts && conflicts.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3"
            >
              <h3 className="text-sm font-semibold text-red-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Teacher Scheduling Conflicts
              </h3>
              <div className="space-y-2">
                {conflicts.map((conflict, i) => (
                  <div key={i} className="bg-white border border-red-200 rounded-lg px-4 py-3 text-sm">
                    <p className="font-medium text-red-800 mb-1">
                      {conflict.teacher_name} — overlapping on{' '}
                      {conflict.shared_days.map(d => DAY_LABELS[d] ?? d).join(', ')}
                    </p>
                    <div className="flex gap-4 text-red-600 text-xs">
                      <span>
                        {conflict.subject_a.title} ({conflict.subject_a.section}) · {conflict.subject_a.start_time}–{conflict.subject_a.end_time}
                      </span>
                      <span className="text-red-400">vs</span>
                      <span>
                        {conflict.subject_b.title} ({conflict.subject_b.section}) · {conflict.subject_b.start_time}–{conflict.subject_b.end_time}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Section Selector */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Class Section</label>
            <div className="w-full sm:max-w-sm">
              <Autocomplete
                value={selectedSection}
                onChange={setSelectedSection}
                options={sectionOptions}
                placeholder="Search class section..."
                loading={sectionsLoading}
                disabled={sectionsLoading}
                onQueryChange={setSectionSearch}
                filter={() => true}
              />
            </div>
          </div>

          {/* Main content */}
          {!selectedSection ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 py-16 flex flex-col items-center justify-center text-center">
              <CalendarDays className="w-12 h-12 text-gray-300 mb-3" />
              <p className="text-gray-400 text-sm">Select a class section to view and edit its timetable</p>
            </div>
          ) : timetableLoading && selectedSection ? (
            <div className="bg-white rounded-xl border border-gray-200 py-16 flex items-center justify-center">
              <svg className="animate-spin w-8 h-8 text-indigo-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6">
              {/* Grid */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-500">
                    {scheduledSubjects.length} of {subjects.length} subjects scheduled
                  </span>
                </div>
                {scheduledSubjects.length === 0 ? (
                  <div className="bg-white rounded-xl border border-dashed border-gray-200 py-12 flex flex-col items-center justify-center text-center">
                    <Clock className="w-10 h-10 text-gray-300 mb-2" />
                    <p className="text-gray-400 text-sm">No subjects have a schedule yet.</p>
                    <p className="text-gray-400 text-xs mt-1">Use the panel on the right to assign times.</p>
                  </div>
                ) : (
                  <TimetableGrid
                    subjects={subjects}
                    conflictSubjectIds={conflictSubjectIds}
                    onEditSchedule={openScheduleModal}
                  />
                )}
              </div>

              {/* Side panel: subject list */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden self-start">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-indigo-500" />
                  <span className="text-sm font-semibold text-gray-700">Subjects</span>
                </div>

                <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                  {subjects.length === 0 && (
                    <p className="text-center text-sm text-gray-400 py-6">No subjects in this section.</p>
                  )}

                  {subjects.map((subject: Subject) => {
                    const isScheduled = !!(subject.start_time && subject.end_time)
                    const isConflict = conflictSubjectIds.has(subject.id)

                    return (
                      <button
                        key={subject.id}
                        type="button"
                        onClick={() => openScheduleModal(subject)}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">
                              {subject.title}
                              {subject.variant ? <span className="text-gray-400 font-normal"> · {subject.variant}</span> : null}
                            </p>
                            {isScheduled ? (
                              <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {subject.start_time?.slice(0, 5)}–{subject.end_time?.slice(0, 5)}
                                {' · '}
                                {subject.meeting_days?.map(d => DAY_LABELS[d] ?? d).join(', ')}
                              </p>
                            ) : (
                              <p className="text-xs text-amber-500 mt-0.5">Not scheduled</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                            {isConflict && (
                              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                            )}
                            <Edit2 className="w-3.5 h-3.5 text-gray-300 group-hover:text-indigo-500 transition-colors" />
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>

                {unscheduledSubjects.length > 0 && (
                  <div className="px-4 py-2 bg-amber-50 border-t border-amber-100">
                    <p className="text-xs text-amber-600">
                      {unscheduledSubjects.length} subject{unscheduledSubjects.length !== 1 ? 's' : ''} not yet scheduled
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Schedule Modal */}
          <ScheduleModal
            isOpen={scheduleModalOpen}
            subject={editingSubject}
            onClose={closeScheduleModal}
            onSave={(subjectId, data) => scheduleMutation.mutate({ subjectId, data })}
            loading={scheduleMutation.isPending}
            error={
              scheduleMutation.isError
                ? (scheduleMutation.error as any)?.response?.data?.message ?? 'Failed to save schedule'
                : null
            }
          />
        </>
      )}

      {activeTab === 'teacher' && <TeacherTimetableTab />}
    </div>
  )
}

export default Timetable
