import React, { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import {
  XMarkIcon,
  ArrowPathIcon,
  AcademicCapIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline'
import { Button } from '../../../components/button'
import { Select } from '../../../components/select'
import { classSectionService } from '../../../services/classSectionService'
import { subjectService } from '../../../services/subjectService'
import { studentRunningGradeService } from '../../../services/studentRunningGradeService'
import type { Student, ClassSection, Subject } from '../../../types'

interface TransferStudentModalProps {
  isOpen: boolean
  onClose: () => void
  student: Student | null
  sectionId: string
  sectionTitle?: string
  currentSubjects: Subject[]
  availableSections: ClassSection[]
  onSuccess?: () => void
}

type Step = 1 | 2 | 3

const STEPS = [
  { id: 1, title: 'Select Section', icon: ArrowPathIcon },
  { id: 2, title: 'Map Subjects', icon: AcademicCapIcon },
  { id: 3, title: 'Review & Confirm', icon: CheckCircleIcon },
]

const getStudentName = (student: Student) =>
  `${student.first_name} ${student.middle_name || ''} ${student.last_name} ${student.ext_name || ''}`.trim()

export const TransferStudentModal: React.FC<TransferStudentModalProps> = ({
  isOpen,
  onClose,
  student,
  sectionId,
  sectionTitle,
  currentSubjects,
  availableSections,
  onSuccess,
}) => {
  const queryClient = useQueryClient()
  const [currentStep, setCurrentStep] = useState<Step>(1)
  const [targetSectionId, setTargetSectionId] = useState<string>('')
  // source_subject_id -> target_subject_id
  const [subjectMappings, setSubjectMappings] = useState<Map<string, string>>(new Map())

  const targetSection = useMemo(
    () => availableSections.find(s => s.id === targetSectionId) || null,
    [availableSections, targetSectionId]
  )

  // Fetch the student's running grades to determine which subjects need mapping
  const { data: gradesResponse, isLoading: gradesLoading } = useQuery({
    queryKey: ['student-running-grades', { student_id: student?.id }],
    queryFn: () => studentRunningGradeService.list({ student_id: student?.id }),
    enabled: isOpen && !!student?.id,
  })

  // Subject IDs (within the current section) the student actually has active grades in
  const gradedSubjectIds = useMemo(() => {
    const currentSectionSubjectIds = new Set(currentSubjects.map(s => s.id))
    const ids = new Set<string>()
    const rows = gradesResponse?.data
    if (Array.isArray(rows)) {
      rows.forEach((g: { subject_id?: string }) => {
        if (g.subject_id && currentSectionSubjectIds.has(g.subject_id)) {
          ids.add(g.subject_id)
        }
      })
    }
    return ids
  }, [gradesResponse?.data, currentSubjects])

  // Only show subjects relevant to the student's grades. A parent is relevant if it
  // (or any of its children) has grades; within it we surface only the graded children.
  const relevantHierarchy = useMemo(() => {
    const parents = currentSubjects.filter(s => s.subject_type === 'parent')
    return parents
      .map(parent => {
        const gradedChildren = currentSubjects.filter(
          s => s.parent_subject_id === parent.id && gradedSubjectIds.has(s.id)
        )
        return {
          ...parent,
          parentHasGrade: gradedSubjectIds.has(parent.id),
          graded_children: gradedChildren,
        }
      })
      .filter(p => p.parentHasGrade || p.graded_children.length > 0)
  }, [currentSubjects, gradedSubjectIds])

  const hasGradesToMap = relevantHierarchy.length > 0

  // Fetch target section subjects once a section is chosen
  const { data: targetSubjectsResponse, isLoading: targetSubjectsLoading } = useQuery({
    queryKey: ['subjects', { class_section_id: targetSectionId }],
    queryFn: () => subjectService.getSubjects({ class_section_id: targetSectionId }),
    enabled: !!targetSectionId && currentStep >= 2,
    staleTime: 5 * 60 * 1000,
  })

  const targetSubjects: Subject[] = useMemo(
    () => targetSubjectsResponse?.data || [],
    [targetSubjectsResponse?.data]
  )

  const handleMapSubject = (sourceSubjectId: string, targetSubjectId: string) => {
    setSubjectMappings(prev => {
      const newMap = new Map(prev)
      if (!targetSubjectId) {
        newMap.delete(sourceSubjectId)
      } else {
        newMap.set(sourceSubjectId, targetSubjectId)
      }
      return newMap
    })
  }

  // Auto-map current subjects to target subjects by matching titles
  const handleAutoMap = () => {
    if (targetSubjects.length === 0) return
    setSubjectMappings(prev => {
      const newMap = new Map(prev)
      relevantHierarchy.forEach(parent => {
        const matchingParent = targetSubjects.find(
          t => t.subject_type === 'parent' &&
            t.title.toLowerCase().trim() === parent.title.toLowerCase().trim()
        )
        if (parent.parentHasGrade && matchingParent) {
          newMap.set(parent.id, matchingParent.id)
        }
        if (matchingParent) {
          parent.graded_children.forEach(child => {
            const matchingChild = targetSubjects.find(
              t => t.parent_subject_id === matchingParent.id &&
                t.title.toLowerCase().trim() === child.title.toLowerCase().trim()
            )
            if (matchingChild) {
              newMap.set(child.id, matchingChild.id)
            }
          })
        }
      })
      return newMap
    })
  }

  const resetState = () => {
    setCurrentStep(1)
    setTargetSectionId('')
    setSubjectMappings(new Map())
  }

  const transferMutation = useMutation({
    mutationFn: () =>
      classSectionService.transferStudent(sectionId, {
        student_id: student!.id,
        target_section_id: targetSectionId,
        subject_mappings: Array.from(subjectMappings.entries()).map(([source_subject_id, target_subject_id]) => ({
          source_subject_id,
          target_subject_id,
        })),
      }),
    onSuccess: () => {
      toast.success('Student transferred successfully!', { duration: 4000, position: 'top-right' })
      queryClient.invalidateQueries({ queryKey: ['students-by-section'] })
      queryClient.invalidateQueries({ queryKey: ['class-sections'] })
      queryClient.invalidateQueries({ queryKey: ['student-running-grades'] })
      onSuccess?.()
      handleClose()
    },
    onError: (error: any) => {
      const message =
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message ||
        'Failed to transfer student. Please try again.'
      toast.error(message, { duration: 5000, position: 'top-right' })
    },
  })

  const handleClose = () => {
    if (!transferMutation.isPending) {
      resetState()
      onClose()
    }
  }

  useEffect(() => {
    if (isOpen) {
      resetState()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const canProceedToStep2 = !!targetSectionId
  const canConfirm = !!targetSectionId && !!student

  const handleNext = () => {
    if (currentStep === 1 && canProceedToStep2) {
      setCurrentStep(2)
    } else if (currentStep === 2) {
      setCurrentStep(3)
    }
  }

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as Step)
    }
  }

  const sectionOptions = useMemo(
    () => [
      { value: '', label: 'Select a section...' },
      ...availableSections.map(s => ({
        value: s.id,
        label: s.grade_level ? `${s.title} (${s.grade_level})` : s.title,
      })),
    ],
    [availableSections]
  )

  if (!student) return null

  // Step 1: Select target section
  const renderStep1 = () => (
    <div className="space-y-4">
      <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
        <p className="text-sm text-indigo-700">
          Transferring <span className="font-semibold">{getStudentName(student)}</span>
          {sectionTitle ? <> from <span className="font-semibold">{sectionTitle}</span></> : null}. Choose the section to
          move this student to.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Target Section</label>
        {availableSections.length === 0 ? (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-700">
              <ExclamationCircleIcon className="w-4 h-4 inline mr-1" />
              No other sections are available to transfer to.
            </p>
          </div>
        ) : (
          <Select
            value={targetSectionId}
            onChange={e => setTargetSectionId(e.target.value)}
            options={sectionOptions}
            className="w-full"
          />
        )}
      </div>
    </div>
  )

  // Step 2: Map subjects
  const renderStep2 = () => {
    if (gradesLoading) {
      return (
        <div className="p-8 text-center bg-gray-50 rounded-lg">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-3" />
          <p className="text-gray-500">Loading the student's grades...</p>
        </div>
      )
    }

    if (!hasGradesToMap) {
      return (
        <div className="p-8 text-center bg-gray-50 rounded-lg">
          <AcademicCapIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">No grades to map</p>
          <p className="text-sm text-gray-500 mt-1">
            This student has no recorded grades in {sectionTitle || 'this section'}. You can proceed with the transfer.
          </p>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-700">
            This student has grades in the subjects below. Map each one to a subject in{' '}
            <span className="font-semibold">{targetSection?.title}</span> to carry the grades over. Unmapped subjects
            will keep their grades in the original section.
          </p>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleAutoMap} variant="outline" size="sm" className="text-xs" disabled={targetSubjectsLoading}>
            Auto-map by title
          </Button>
        </div>

        {targetSubjectsLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Loading subjects for {targetSection?.title}...</p>
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                    Current Section Subjects
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-700 w-12" />
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                    {targetSection?.title || 'Target'} Subjects
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {relevantHierarchy.map(parent => {
                  const parentTargetId = subjectMappings.get(parent.id) || ''
                  const mappedTargetParent = parentTargetId
                    ? targetSubjects.find(s => s.id === parentTargetId)
                    : null

                  // Target parent subjects already used by another mapping (excluding this one)
                  const usedTargetIds = new Set(
                    Array.from(subjectMappings.entries())
                      .filter(([source]) => source !== parent.id)
                      .map(([, target]) => target)
                  )
                  const availableParentTargets = targetSubjects.filter(
                    s => s.subject_type === 'parent' && (s.id === parentTargetId || !usedTargetIds.has(s.id))
                  )

                  return (
                    <React.Fragment key={parent.id}>
                      {/* Parent row — only an editable mapping when the parent itself has grades */}
                      <tr className="bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-gray-900">
                            {parent.title}
                            {parent.variant && <span className="text-xs text-gray-500 ml-1">- {parent.variant}</span>}
                            {!parent.parentHasGrade && (
                              <span className="text-xs text-gray-400 ml-2">(map to enable children)</span>
                            )}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <ArrowRightIcon className="w-5 h-5 text-gray-400 mx-auto" />
                        </td>
                        <td className="px-4 py-3">
                          <Select
                            value={parentTargetId}
                            onChange={e => handleMapSubject(parent.id, e.target.value)}
                            options={[
                              { value: '', label: 'Select subject...' },
                              ...availableParentTargets.map(s => ({
                                value: s.id,
                                label: s.variant ? `${s.title} - ${s.variant}` : s.title,
                              })),
                            ]}
                            className="w-full"
                          />
                        </td>
                      </tr>

                      {/* Graded child rows */}
                      {parent.graded_children.map(child => {
                        const childTargetId = subjectMappings.get(child.id) || ''
                        const childTargetOptions = mappedTargetParent
                          ? targetSubjects.filter(s => s.parent_subject_id === mappedTargetParent.id)
                          : []
                        const usedChildTargetIds = new Set(
                          Array.from(subjectMappings.entries())
                            .filter(([source]) => source !== child.id)
                            .map(([, target]) => target)
                        )
                        const availableChildTargets = childTargetOptions.filter(
                          s => s.id === childTargetId || !usedChildTargetIds.has(s.id)
                        )

                        return (
                          <tr key={child.id}>
                            <td className="px-4 py-3 pl-8">
                              <p className="text-sm font-medium text-gray-700">
                                <span className="text-xs text-gray-500 mr-2">└─</span>
                                {child.title}
                                {child.variant && <span className="text-xs text-gray-500 ml-1">- {child.variant}</span>}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <ArrowRightIcon className="w-5 h-5 text-gray-400 mx-auto" />
                            </td>
                            <td className="px-4 py-3">
                              <Select
                                value={childTargetId}
                                onChange={e => handleMapSubject(child.id, e.target.value)}
                                disabled={!mappedTargetParent}
                                options={[
                                  {
                                    value: '',
                                    label: mappedTargetParent ? 'Select subject...' : 'Map parent first...',
                                  },
                                  ...availableChildTargets.map(s => ({
                                    value: s.id,
                                    label: s.variant ? `${s.title} - ${s.variant}` : s.title,
                                  })),
                                ]}
                                className="w-full"
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  // Step 3: Review & confirm
  const renderStep3 = () => {
    const mappedList = Array.from(subjectMappings.entries())
      .map(([sourceId, targetId]) => {
        const source = currentSubjects.find(s => s.id === sourceId)
        const target = targetSubjects.find(s => s.id === targetId)
        if (!source || !target) return null
        return { source, target }
      })
      .filter(Boolean) as Array<{ source: Subject; target: Subject }>

    return (
      <div className="space-y-4">
        <div className="border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">Student</p>
          <p className="text-base font-semibold text-gray-900">{getStudentName(student)}</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-500">From</p>
            <p className="text-base font-semibold text-gray-900">{sectionTitle || 'Current Section'}</p>
          </div>
          <ArrowRightIcon className="w-6 h-6 text-indigo-500 flex-shrink-0" />
          <div className="flex-1 border border-indigo-200 bg-indigo-50 rounded-lg p-4">
            <p className="text-sm text-indigo-500">To</p>
            <p className="text-base font-semibold text-indigo-900">{targetSection?.title || 'Target Section'}</p>
          </div>
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <p className="text-sm font-medium text-gray-700 mb-2">Grade Mapping</p>
          {mappedList.length === 0 ? (
            <p className="text-sm text-gray-500">
              No subjects mapped. {hasGradesToMap
                ? 'Existing grades will remain in the original section.'
                : 'This student has no grades to carry over.'}
            </p>
          ) : (
            <div className="space-y-1">
              {mappedList.map(({ source, target }) => (
                <p key={source.id} className="text-sm text-gray-600">
                  • {source.title} <span className="text-gray-400">→</span> {target.title}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-75 transition-opacity"
            onClick={handleClose}
          />

          <div className="flex min-h-full items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-3xl bg-white rounded-lg shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">Transfer Student</h3>
                  <p className="text-sm text-gray-500 mt-1">Step {currentStep} of {STEPS.length}</p>
                </div>
                <button
                  onClick={handleClose}
                  disabled={transferMutation.isPending}
                  className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>

              {/* Stepper */}
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <div className="flex items-center justify-between">
                  {STEPS.map((step, index) => {
                    const StepIcon = step.icon
                    const isActive = currentStep === step.id
                    const isCompleted = currentStep > step.id
                    return (
                      <React.Fragment key={step.id}>
                        <div className="flex flex-col items-center space-y-1">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                              isCompleted
                                ? 'bg-green-500 text-white'
                                : isActive
                                ? 'bg-indigo-600 text-white'
                                : 'bg-gray-300 text-gray-600'
                            }`}
                          >
                            {isCompleted ? <CheckCircleIcon className="w-6 h-6" /> : <StepIcon className="w-5 h-5" />}
                          </div>
                          <span
                            className={`text-xs font-medium ${
                              isActive ? 'text-indigo-600' : isCompleted ? 'text-green-600' : 'text-gray-500'
                            }`}
                          >
                            {step.title}
                          </span>
                        </div>
                        {index < STEPS.length - 1 && (
                          <div className={`flex-1 h-0.5 mx-2 ${isCompleted ? 'bg-green-500' : 'bg-gray-300'}`} />
                        )}
                      </React.Fragment>
                    )
                  })}
                </div>
              </div>

              {/* Content */}
              <div className="p-6 max-h-[60vh] overflow-y-auto">
                {currentStep === 1 && renderStep1()}
                {currentStep === 2 && renderStep2()}
                {currentStep === 3 && renderStep3()}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between p-6 border-t border-gray-200">
                <Button type="button" onClick={handleClose} disabled={transferMutation.isPending} variant="outline">
                  Cancel
                </Button>
                <div className="flex items-center space-x-3">
                  {currentStep > 1 && (
                    <Button
                      type="button"
                      onClick={handlePrevious}
                      disabled={transferMutation.isPending}
                      variant="outline"
                    >
                      Previous
                    </Button>
                  )}
                  {currentStep < 3 ? (
                    <Button
                      type="button"
                      onClick={handleNext}
                      disabled={currentStep === 1 && !canProceedToStep2}
                      className="bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500"
                    >
                      Next
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={() => transferMutation.mutate()}
                      disabled={!canConfirm || transferMutation.isPending}
                      loading={transferMutation.isPending}
                      className="bg-green-600 hover:bg-green-700 focus:ring-green-500"
                    >
                      {transferMutation.isPending ? 'Transferring...' : 'Confirm & Transfer'}
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
}

export default TransferStudentModal
