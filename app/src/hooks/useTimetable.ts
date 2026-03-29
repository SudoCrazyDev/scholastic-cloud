import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { timetableService } from '../services/timetableService'
import type { Subject, UpdateSubjectScheduleData } from '../types'

export const useSectionTimetable = (sectionId: string | null) => {
  return useQuery({
    queryKey: ['timetable', sectionId],
    queryFn: () => timetableService.getSectionTimetable(sectionId!),
    enabled: !!sectionId,
    staleTime: 2 * 60 * 1000,
  })
}

export const useTimetableConflicts = (enabled = true) => {
  return useQuery({
    queryKey: ['timetable-conflicts'],
    queryFn: () => timetableService.getConflicts(),
    enabled,
    staleTime: 60 * 1000,
  })
}

export const useUpdateSubjectSchedule = () => {
  const queryClient = useQueryClient()
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null)

  const mutation = useMutation({
    mutationFn: ({ subjectId, data }: { subjectId: string; data: UpdateSubjectScheduleData }) =>
      timetableService.updateSubjectSchedule(subjectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timetable'] })
      queryClient.invalidateQueries({ queryKey: ['timetable-conflicts'] })
      queryClient.invalidateQueries({ queryKey: ['subjects'] })
      setScheduleModalOpen(false)
      setEditingSubject(null)
    },
  })

  const openScheduleModal = (subject: Subject) => {
    setEditingSubject(subject)
    setScheduleModalOpen(true)
  }

  const closeScheduleModal = () => {
    setScheduleModalOpen(false)
    setEditingSubject(null)
  }

  return {
    mutation,
    scheduleModalOpen,
    editingSubject,
    openScheduleModal,
    closeScheduleModal,
  }
}
