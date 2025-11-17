import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { subjectService } from '../services/subjectService'
import { studentService } from '../services/studentService'

interface UseClassSectionDetailMutationsOptions {
  classSectionId: string
  onSubjectCreateSuccess?: () => void
  onSubjectUpdateSuccess?: () => void
  onSubjectDeleteSuccess?: () => void
  onSubjectError?: (error: string) => void
  onSubjectDeleteError?: () => void
  onReorderSubjectsSuccess?: () => void
  onReorderChildSubjectsSuccess?: () => void
  onRemoveStudentSuccess?: () => void
  onRemoveStudentError?: (error: unknown) => void
}

export const useClassSectionDetailMutations = (options: UseClassSectionDetailMutationsOptions) => {
  const {
    classSectionId,
    onSubjectCreateSuccess,
    onSubjectUpdateSuccess,
    onSubjectDeleteSuccess,
    onSubjectError,
    onSubjectDeleteError,
    onReorderSubjectsSuccess,
    onReorderChildSubjectsSuccess,
    onRemoveStudentSuccess,
    onRemoveStudentError,
  } = options

  const queryClient = useQueryClient()

  // Subject mutations
  const createSubjectMutation = useMutation({
    mutationFn: (data: any) => subjectService.createSubject(data),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['subjects', { class_section_id: classSectionId }] })
      onSubjectCreateSuccess?.()
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to create subject'
      onSubjectError?.(message)
    }
  })

  const updateSubjectMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => subjectService.updateSubject(id, data),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['subjects', { class_section_id: classSectionId }] })
      onSubjectUpdateSuccess?.()
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to update subject'
      onSubjectError?.(message)
    }
  })

  const deleteSubjectMutation = useMutation({
    mutationFn: (id: string) => subjectService.deleteSubject(id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['subjects', { class_section_id: classSectionId }] })
      onSubjectDeleteSuccess?.()
    },
    onError: () => {
      onSubjectDeleteError?.()
    }
  })

  const reorderSubjectsMutation = useMutation({
    mutationFn: (subjectOrders: Array<{ id: string; order: number }>) => 
      subjectService.reorderSubjects(classSectionId, subjectOrders),
    onSuccess: () => {
      toast.success('Subjects reordered successfully!', {
        duration: 3000,
        position: 'top-right',
        style: {
          background: '#10B981',
          color: '#fff',
        },
      })
      queryClient.removeQueries({ queryKey: ['subjects', { class_section_id: classSectionId }] })
      onReorderSubjectsSuccess?.()
    },
    onError: () => {
      toast.error('Failed to reorder subjects. Please try again.', {
        duration: 4000,
        position: 'top-right',
      })
    }
  })

  const reorderChildSubjectsMutation = useMutation({
    mutationFn: ({ parentId, childOrders }: { parentId: string; childOrders: Array<{ id: string; order: number }> }) => 
      subjectService.reorderChildSubjects(parentId, childOrders),
    onSuccess: () => {
      toast.success('Child subjects reordered successfully!', {
        duration: 3000,
        position: 'top-right',
        style: {
          background: '#10B981',
          color: '#fff',
        },
      })
      queryClient.removeQueries({ queryKey: ['subjects', { class_section_id: classSectionId }] })
      onReorderChildSubjectsSuccess?.()
    },
    onError: () => {
      toast.error('Failed to reorder child subjects. Please try again.', {
        duration: 4000,
        position: 'top-right',
      })
    }
  })

  const removeStudentMutation = useMutation({
    mutationFn: (assignmentId: string) => studentService.removeStudentFromSection(assignmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students-by-section', classSectionId] })
      onRemoveStudentSuccess?.()
    },
    onError: (error: unknown) => {
      onRemoveStudentError?.(error)
    }
  })

  return {
    createSubjectMutation,
    updateSubjectMutation,
    deleteSubjectMutation,
    reorderSubjectsMutation,
    reorderChildSubjectsMutation,
    removeStudentMutation,
  }
}

