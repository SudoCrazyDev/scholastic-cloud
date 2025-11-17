import React, { useState, useRef, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { subjectService } from '../../../services/subjectService'
import { classSectionService } from '../../../services/classSectionService'
import { 
  XMarkIcon, 
  MagnifyingGlassIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  AcademicCapIcon,
  UserGroupIcon,
  ArrowPathIcon,
  PlusIcon,
  TrashIcon,
  PencilIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline'
import { Button } from '../../../components/button'
import type { Student, ClassSection, Subject } from '../../../types'

interface DissolveSectionModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm?: (data: DissolveSectionData) => void // Optional - if not provided, modal handles API call
  students: Student[]
  sectionTitle?: string
  sectionId?: string
  availableSections?: ClassSection[] // Other sections students can be transferred to
  currentSubjects?: Subject[] // Subjects in the dissolving section
  loading?: boolean
  studentsError?: string | null // Error from fetching students
}

export interface DissolveSectionData {
  studentAssignments: Array<{
    studentId: string
    targetSectionId: string
  }>
  subjectMappings: Array<{
    sourceSubjectId: string
    targetSubjectId: string
    targetSectionId: string
  }>
}

type Step = 1 | 2 | 3 | 4

const STEPS = [
  { id: 1, title: 'Select Students', icon: UserGroupIcon },
  { id: 2, title: 'Assign Sections', icon: ArrowPathIcon },
  { id: 3, title: 'Map Subjects', icon: AcademicCapIcon },
  { id: 4, title: 'Review & Confirm', icon: CheckCircleIcon },
]

export const DissolveSectionModal: React.FC<DissolveSectionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  students,
  sectionTitle,
  sectionId,
  availableSections = [],
  currentSubjects = [],
  loading = false,
  studentsError = null,
}) => {
  const queryClient = useQueryClient()
  const [currentStep, setCurrentStep] = useState<Step>(1)
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [studentAssignments, setStudentAssignments] = useState<Map<string, string>>(new Map()) // studentId -> sectionId
  const [subjectMappings, setSubjectMappings] = useState<Map<string, { targetSubjectId: string; targetSectionId: string }>>(new Map()) // sourceSubjectId -> { targetSubjectId, targetSectionId }
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [studentGroups, setStudentGroups] = useState<Map<string, Set<string>>>(new Map()) // groupId -> Set<studentId>
  const [groupNames, setGroupNames] = useState<Map<string, string>>(new Map()) // groupId -> name
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingGroupName, setEditingGroupName] = useState<string>('')
  const [nextGroupId, setNextGroupId] = useState(1)
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null)

  // Placeholder available sections if none provided
  const sections = useMemo(() => {
    if (availableSections.length > 0) return availableSections
    // Placeholder sections for demo
    return [
      { id: 'section-1', title: 'Grade 7 - Section A', grade_level: 'Grade 7', institution_id: '' },
      { id: 'section-2', title: 'Grade 7 - Section B', grade_level: 'Grade 7', institution_id: '' },
      { id: 'section-3', title: 'Grade 8 - Section A', grade_level: 'Grade 8', institution_id: '' },
    ] as ClassSection[]
  }, [availableSections])

  // Get unique target section IDs from student assignments
  const targetSectionIds = useMemo(() => {
    const sectionIds = new Set<string>()
    studentAssignments.forEach(sectionId => {
      if (sectionId) sectionIds.add(sectionId)
    })
    return Array.from(sectionIds)
  }, [studentAssignments])

  // Fetch subjects for all target sections using useQueries
  const targetSectionSubjectsQueries = useQueries({
    queries: targetSectionIds.map(sectionId => ({
      queryKey: ['subjects', { class_section_id: sectionId }],
      queryFn: () => subjectService.getSubjects({ class_section_id: sectionId }),
      enabled: !!sectionId && currentStep >= 3, // Only fetch when on Step 3 or later
      staleTime: 5 * 60 * 1000, // 5 minutes
    })),
  })

  // Create a map of sectionId -> subjects
  const targetSectionSubjectsMap = useMemo(() => {
    const map = new Map<string, Subject[]>()
    targetSectionIds.forEach((sectionId, index) => {
      const queryResult = targetSectionSubjectsQueries[index]
      if (queryResult?.data?.data) {
        map.set(sectionId, queryResult.data.data)
      }
    })
    return map
  }, [targetSectionIds, targetSectionSubjectsQueries])

  // Helper function to get subjects for a target section
  const getTargetSectionSubjects = (sectionId: string): Subject[] => {
    return targetSectionSubjectsMap.get(sectionId) || []
  }

  // Get students that are in groups
  const groupedStudentIds = useMemo(() => {
    const grouped = new Set<string>()
    studentGroups.forEach(group => {
      group.forEach(studentId => grouped.add(studentId))
    })
    return grouped
  }, [studentGroups])

  // Filter students based on search term and exclude those already in groups
  const filteredStudents = useMemo(() => {
    return students.filter(student => {
      // Exclude students that are already in a group
      if (groupedStudentIds.has(student.id)) {
        return false
      }
      const fullName = `${student.first_name} ${student.middle_name || ''} ${student.last_name} ${student.ext_name || ''}`.toLowerCase()
      const lrn = student.lrn?.toLowerCase() || ''
      const search = searchTerm.toLowerCase()
      return fullName.includes(search) || lrn.includes(search)
    })
  }, [students, searchTerm, groupedStudentIds])

  // Calculate select all state only for ungrouped students in the filtered list
  const ungroupedFilteredStudentIds = useMemo(() => {
    return filteredStudents.map(s => s.id)
  }, [filteredStudents])

  // Get total students (selected + grouped)
  const totalStudentsCount = useMemo(() => {
    const groupedCount = Array.from(studentGroups.values()).reduce((sum, group) => sum + group.size, 0)
    return selectedStudentIds.size + groupedCount
  }, [selectedStudentIds, studentGroups])

  // Get all students that need to be assigned (selected + grouped)
  const allStudentsToAssign = useMemo(() => {
    const allStudents = new Set(selectedStudentIds)
    // Add all students from groups
    studentGroups.forEach(group => {
      group.forEach(studentId => allStudents.add(studentId))
    })
    return Array.from(allStudents)
  }, [selectedStudentIds, studentGroups])

  // Check if all selected students are in groups
  const allSelectedStudentsInGroups = useMemo(() => {
    if (selectedStudentIds.size === 0) {
      // If no students are selected, check if there are any groups
      return studentGroups.size > 0
    }
    // All selected students must be in groups
    return Array.from(selectedStudentIds).every(id => groupedStudentIds.has(id))
  }, [selectedStudentIds, groupedStudentIds, studentGroups])

  // Build subject hierarchy (parent with children)
  const subjectHierarchy = useMemo(() => {
    const parentSubjects = currentSubjects.filter(s => s.subject_type === 'parent')
    return parentSubjects.map(parent => {
      const children = currentSubjects.filter(s => s.parent_subject_id === parent.id)
      return { ...parent, child_subjects: children }
    })
  }, [currentSubjects])

  // Note: Subject mapping is now optional - unmapped subjects will be marked as deleted with note 'Dissolved - No Mapping'

  // Validation
  const canProceedToStep2 = totalStudentsCount > 0 && allSelectedStudentsInGroups
  const canProceedToStep3 = allStudentsToAssign.every(id => studentAssignments.has(id))
  const canProceedToStep4 = true // Subject mapping is optional - can proceed even if subjects aren't mapped
  const canConfirm = canProceedToStep3 && !!sectionId // Section ID is required

  const handleToggleStudent = (studentId: string) => {
    setSelectedStudentIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(studentId)) {
        newSet.delete(studentId)
        // Remove assignment if student is deselected
        setStudentAssignments(prev => {
          const newMap = new Map(prev)
          newMap.delete(studentId)
          return newMap
        })
      } else {
        newSet.add(studentId)
      }
      return newSet
    })
  }

  const handleSelectAll = () => {
    const allFilteredSelected = ungroupedFilteredStudentIds.length > 0 && 
      ungroupedFilteredStudentIds.every(id => selectedStudentIds.has(id))
    
    if (allFilteredSelected) {
      // Deselect all ungrouped filtered students
      setSelectedStudentIds(prev => {
        const newSet = new Set(prev)
        ungroupedFilteredStudentIds.forEach(id => newSet.delete(id))
        return newSet
      })
      // Remove assignments for deselected students
      setStudentAssignments(prev => {
        const newMap = new Map(prev)
        ungroupedFilteredStudentIds.forEach(id => newMap.delete(id))
        return newMap
      })
    } else {
      // Select all ungrouped filtered students
      setSelectedStudentIds(prev => {
        const newSet = new Set(prev)
        ungroupedFilteredStudentIds.forEach(id => newSet.add(id))
        return newSet
      })
    }
  }

  const handleAssignStudent = (studentId: string, sectionId: string) => {
    setStudentAssignments(prev => {
      const newMap = new Map(prev)
      if (sectionId === '') {
        newMap.delete(studentId)
      } else {
        newMap.set(studentId, sectionId)
      }
      return newMap
    })
  }

  const handleAssignAllToSection = (sectionId: string) => {
    setStudentAssignments(prev => {
      const newMap = new Map(prev)
      // Assign all students (selected + grouped)
      allStudentsToAssign.forEach(studentId => {
        newMap.set(studentId, sectionId)
      })
      return newMap
    })
  }

  // Group management handlers
  const handleCreateGroup = () => {
    const groupId = `group-${nextGroupId}`
    const groupName = `Group ${nextGroupId}`
    setStudentGroups(prev => {
      const newMap = new Map(prev)
      newMap.set(groupId, new Set())
      return newMap
    })
    setGroupNames(prev => {
      const newMap = new Map(prev)
      newMap.set(groupId, groupName)
      return newMap
    })
    setNextGroupId(prev => prev + 1)
    setEditingGroupId(groupId)
    setEditingGroupName(groupName)
  }

  const handleAddSelectedToGroup = (groupId: string) => {
    setStudentGroups(prev => {
      const newMap = new Map(prev)
      const group = newMap.get(groupId) || new Set<string>()
      selectedStudentIds.forEach(studentId => {
        group.add(studentId)
        // Remove from other groups
        newMap.forEach((otherGroup, otherGroupId) => {
          if (otherGroupId !== groupId) {
            otherGroup.delete(studentId)
          }
        })
      })
      newMap.set(groupId, group)
      return newMap
    })
    // Reset selected students after adding to group
    setSelectedStudentIds(new Set())
  }

  const handleRemoveStudentFromGroup = (groupId: string, studentId: string) => {
    setStudentGroups(prev => {
      const newMap = new Map(prev)
      const group = newMap.get(groupId)
      if (group) {
        group.delete(studentId)
        if (group.size === 0) {
          newMap.delete(groupId)
          setGroupNames(prevNames => {
            const newNames = new Map(prevNames)
            newNames.delete(groupId)
            return newNames
          })
        } else {
          newMap.set(groupId, group)
        }
      }
      return newMap
    })
  }

  const handleDeleteGroup = (groupId: string) => {
    setStudentGroups(prev => {
      const newMap = new Map(prev)
      newMap.delete(groupId)
      return newMap
    })
    setGroupNames(prev => {
      const newMap = new Map(prev)
      newMap.delete(groupId)
      return newMap
    })
  }

  const handleStartEditGroupName = (groupId: string) => {
    setEditingGroupId(groupId)
    setEditingGroupName(groupNames.get(groupId) || '')
  }

  const handleSaveGroupName = (groupId: string) => {
    if (editingGroupName.trim()) {
      setGroupNames(prev => {
        const newMap = new Map(prev)
        newMap.set(groupId, editingGroupName.trim())
        return newMap
      })
    }
    setEditingGroupId(null)
    setEditingGroupName('')
  }

  const handleAssignGroupToSection = (groupId: string, sectionId: string) => {
    const group = studentGroups.get(groupId)
    if (group) {
      setStudentAssignments(prev => {
        const newMap = new Map(prev)
        group.forEach(studentId => {
          newMap.set(studentId, sectionId)
        })
        return newMap
      })
    }
  }

  // Get students not in any group
  const ungroupedStudents = useMemo(() => {
    return Array.from(selectedStudentIds).filter(id => !groupedStudentIds.has(id))
  }, [selectedStudentIds, groupedStudentIds])

  const handleMapSubject = (sourceSubjectId: string, targetSubjectId: string, targetSectionId: string) => {
    setSubjectMappings(prev => {
      const newMap = new Map(prev)
      if (targetSubjectId === '') {
        newMap.delete(sourceSubjectId)
      } else {
        newMap.set(sourceSubjectId, { targetSubjectId, targetSectionId })
      }
      return newMap
    })
  }

  // Auto-map subjects by matching titles
  const handleAutoMap = (assignedSectionId: string) => {
    const targetSubjects = getTargetSectionSubjects(assignedSectionId)
    if (!targetSubjects || targetSubjects.length === 0) return

    setSubjectMappings(prev => {
      const newMap = new Map(prev)
      
      // Auto-map parent subjects
      subjectHierarchy.forEach(parentSubject => {
        // Skip if already mapped to this section
        const existingMapping = newMap.get(parentSubject.id)
        if (existingMapping?.targetSectionId === assignedSectionId) return

        // Find matching target parent subject by title
        const matchingParent = targetSubjects.find(target => 
          target.subject_type === 'parent' &&
          target.title.toLowerCase().trim() === parentSubject.title.toLowerCase().trim()
        )

        if (matchingParent) {
          newMap.set(parentSubject.id, {
            targetSubjectId: matchingParent.id,
            targetSectionId: assignedSectionId,
          })

          // Auto-map child subjects if parent is matched
          if (parentSubject.child_subjects && parentSubject.child_subjects.length > 0) {
            const matchingParentChildren = targetSubjects.filter(target => 
              target.parent_subject_id === matchingParent.id
            )

            parentSubject.child_subjects.forEach(childSubject => {
              // Skip if already mapped to this section
              const existingChildMapping = newMap.get(childSubject.id)
              if (existingChildMapping?.targetSectionId === assignedSectionId) return

              // Find matching child subject by title
              const matchingChild = matchingParentChildren.find(target => 
                target.title.toLowerCase().trim() === childSubject.title.toLowerCase().trim()
              )

              if (matchingChild) {
                newMap.set(childSubject.id, {
                  targetSubjectId: matchingChild.id,
                  targetSectionId: assignedSectionId,
                })
              }
            })
          }
        }
      })

      return newMap
    })
  }

  const handleToggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev)
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId)
      } else {
        newSet.add(sectionId)
      }
      return newSet
    })
  }

  const handleNext = () => {
    if (currentStep === 1 && canProceedToStep2) {
      setCurrentStep(2)
    } else if (currentStep === 2 && canProceedToStep3) {
      setCurrentStep(3)
    } else if (currentStep === 3 && canProceedToStep4) {
      setCurrentStep(4)
    }
  }

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as Step)
    }
  }

  const handleClose = () => {
    if (!loading) {
      setCurrentStep(1)
      setSelectedStudentIds(new Set())
      setSearchTerm('')
      setStudentAssignments(new Map())
      setSubjectMappings(new Map())
      setExpandedSections(new Set())
      setStudentGroups(new Map())
      setGroupNames(new Map())
      setEditingGroupId(null)
      setEditingGroupName('')
      setNextGroupId(1)
      onClose()
    }
  }

  // Dissolve section mutation
  const dissolveMutation = useMutation({
    mutationFn: (data: {
      student_assignments: Array<{
        student_id: string
        target_section_id: string
      }>
      subject_mappings: Array<{
        source_subject_id: string
        target_subject_id: string
        target_section_id: string
      }>
    }) => {
      if (!sectionId) {
        throw new Error('Section ID is required')
      }
      return classSectionService.dissolveSection(sectionId, data)
    },
    onSuccess: () => {
      toast.success('Students transferred successfully!', {
        duration: 4000,
        position: 'top-right',
      })
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['class-sections'] })
      queryClient.invalidateQueries({ queryKey: ['students'] })
      queryClient.invalidateQueries({ queryKey: ['subjects'] })
      queryClient.invalidateQueries({ queryKey: ['students-by-section'] })
      // Close modal
      handleClose()
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          error.message || 
                          'Failed to transfer students. Please try again.'
      toast.error(errorMessage, {
        duration: 5000,
        position: 'top-right',
      })
    },
  })

  const handleConfirm = () => {
    if (!loading && canConfirm && !dissolveMutation.isPending) {
      const data: DissolveSectionData = {
        studentAssignments: Array.from(studentAssignments.entries()).map(([studentId, targetSectionId]) => ({
          studentId,
          targetSectionId,
        })),
        subjectMappings: Array.from(subjectMappings.entries()).map(([sourceSubjectId, mapping]) => ({
          sourceSubjectId,
          targetSubjectId: mapping.targetSubjectId,
          targetSectionId: mapping.targetSectionId,
        })),
      }

      // Transform data to match API format
      const apiData = {
        student_assignments: data.studentAssignments.map(assignment => ({
          student_id: assignment.studentId,
          target_section_id: assignment.targetSectionId,
        })),
        subject_mappings: data.subjectMappings.map(mapping => ({
          source_subject_id: mapping.sourceSubjectId,
          target_subject_id: mapping.targetSubjectId,
          target_section_id: mapping.targetSectionId,
        })),
      }

      // If onConfirm is provided, call it (for backward compatibility)
      // Otherwise, use the mutation to call the API
      if (onConfirm) {
        onConfirm(data)
      } else {
        dissolveMutation.mutate(apiData)
      }
    }
  }

  const allSelected = ungroupedFilteredStudentIds.length > 0 && 
    ungroupedFilteredStudentIds.every(id => selectedStudentIds.has(id))
  const someSelected = ungroupedFilteredStudentIds.some(id => selectedStudentIds.has(id)) && 
    !allSelected

  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate = someSelected
    }
  }, [someSelected])

  // Reset to step 1 when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1)
    }
  }, [isOpen])

  // Render Step 1: Select Students
  const renderStep1 = () => (
    <div className="space-y-4">
      <div className="mb-6 p-6 bg-red-50 border-2 border-red-300 rounded-lg">
        <p className="text-2xl font-bold text-red-700 text-center">
          This will transfer students to other sections and dissolve the current section. This action can't be recovered.
        </p>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="p-8 text-center bg-gray-50 rounded-lg">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-3"></div>
          <p className="text-gray-500">Loading students...</p>
        </div>
      )}

      {/* Error State */}
      {studentsError && !loading && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">
            <ExclamationCircleIcon className="w-4 h-4 inline mr-1" />
            Error loading students: {studentsError}
          </p>
        </div>
      )}

      {!loading && !studentsError && (
        <>
          <div className="mb-4">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search students by name or LRN..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    ref={selectAllCheckboxRef}
                    checked={allSelected}
                    onChange={handleSelectAll}
                    className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                  />
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  LRN
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Gender
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                    {searchTerm ? 'No students found matching your search.' : 'No students in this section.'}
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student) => (
                  <tr
                    key={student.id}
                    className={`hover:bg-gray-50 ${
                      selectedStudentIds.has(student.id) ? 'bg-red-50' : ''
                    }`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedStudentIds.has(student.id)}
                        onChange={() => handleToggleStudent(student.id)}
                        className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {student.lrn || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {`${student.first_name} ${student.middle_name || ''} ${student.last_name} ${student.ext_name || ''}`.trim()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {student.gender || 'N/A'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

          {selectedStudentIds.size > 0 && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-700">
                {selectedStudentIds.size} student{selectedStudentIds.size !== 1 ? 's' : ''} selected
              </p>
            </div>
          )}

          {/* Student Groups Section */}
          {(studentGroups.size > 0 || selectedStudentIds.size > 0) && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-lg font-medium text-gray-900">Student Groups</h4>
            <Button
              onClick={handleCreateGroup}
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <PlusIcon className="w-4 h-4 mr-1" />
              Create Group
            </Button>
          </div>

          <div className="text-sm text-gray-600 mb-4">
            Organize selected students into groups for easier assignment in the next step.
          </div>

          {/* Groups List */}
          {studentGroups.size > 0 && (
            <div className="space-y-3">
              {Array.from(studentGroups.entries()).map(([groupId, groupStudentIds]) => {
                const groupName = groupNames.get(groupId) || `Group ${groupId}`
                const isEditing = editingGroupId === groupId
                const groupStudents = Array.from(groupStudentIds)
                  .map(id => students.find(s => s.id === id))
                  .filter(Boolean) as Student[]

                return (
                  <div key={groupId} className="border border-gray-200 rounded-lg p-4 bg-white">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex-1">
                        {isEditing ? (
                          <div className="flex items-center space-x-2">
                            <input
                              type="text"
                              value={editingGroupName}
                              onChange={(e) => setEditingGroupName(e.target.value)}
                              onBlur={() => handleSaveGroupName(groupId)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleSaveGroupName(groupId)
                                } else if (e.key === 'Escape') {
                                  setEditingGroupId(null)
                                  setEditingGroupName('')
                                }
                              }}
                              className="px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                              autoFocus
                            />
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2">
                            <UserGroupIcon className="w-5 h-5 text-indigo-600" />
                            <h5 className="font-medium text-gray-900">{groupName}</h5>
                            <span className="text-sm text-gray-500">
                              ({groupStudentIds.size} student{groupStudentIds.size !== 1 ? 's' : ''})
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        {!isEditing && (
                          <>
                            <button
                              onClick={() => handleStartEditGroupName(groupId)}
                              className="p-1 text-gray-400 hover:text-indigo-600 transition-colors"
                              title="Edit group name"
                            >
                              <PencilIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteGroup(groupId)}
                              className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                              title="Delete group"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Add Selected Students Button */}
                    {selectedStudentIds.size > 0 && (
                      <div className="mb-3">
                        <Button
                          onClick={() => handleAddSelectedToGroup(groupId)}
                          size="sm"
                          variant="outline"
                          className="text-xs"
                        >
                          <PlusIcon className="w-3 h-3 mr-1" />
                          Add Selected Students
                        </Button>
                      </div>
                    )}

                    {/* Group Students List */}
                    {groupStudents.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {groupStudents.map(student => (
                          <div
                            key={student.id}
                            className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                          >
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">
                                {`${student.first_name} ${student.middle_name || ''} ${student.last_name} ${student.ext_name || ''}`.trim()}
                              </p>
                              <p className="text-xs text-gray-500">{student.lrn || 'No LRN'}</p>
                            </div>
                            <button
                              onClick={() => handleRemoveStudentFromGroup(groupId, student.id)}
                              className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                              title="Remove from group"
                            >
                              <XMarkIcon className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Ungrouped Students */}
          {ungroupedStudents.length > 0 && (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <h5 className="text-sm font-medium text-gray-700">
                  Ungrouped Students ({ungroupedStudents.length})
                </h5>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                These students are not in any group. You can still assign them individually in the next step.
              </p>
              <div className="space-y-1">
                {ungroupedStudents.slice(0, 5).map(studentId => {
                  const student = students.find(s => s.id === studentId)
                  if (!student) return null
                  return (
                    <div key={studentId} className="text-xs text-gray-600">
                      • {`${student.first_name} ${student.middle_name || ''} ${student.last_name} ${student.ext_name || ''}`.trim()}
                    </div>
                  )
                })}
                {ungroupedStudents.length > 5 && (
                  <p className="text-xs text-gray-500">
                    ... and {ungroupedStudents.length - 5} more
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
          )}
        </>
      )}
    </div>
  )

  // Render Step 2: Assign to Sections
  const renderStep2 = () => {
    const unassignedStudents = allStudentsToAssign.filter(id => !studentAssignments.has(id))
    const assignedCount = allStudentsToAssign.length - unassignedStudents.length

    // Get groups with their assignment status
    const groupsWithStatus = Array.from(studentGroups.entries()).map(([groupId, groupStudentIds]) => {
      const groupName = groupNames.get(groupId) || `Group ${groupId}`
      const groupStudents = Array.from(groupStudentIds)
        .map(id => students.find(s => s.id === id))
        .filter(Boolean) as Student[]
      const assignedInGroup = Array.from(groupStudentIds).filter(id => studentAssignments.has(id))
      const allAssigned = assignedInGroup.length === groupStudentIds.size
      const someAssigned = assignedInGroup.length > 0 && !allAssigned
      const assignedSectionId = allAssigned ? studentAssignments.get(Array.from(groupStudentIds)[0]) : null

      return {
        groupId,
        groupName,
        groupStudents,
        allAssigned,
        someAssigned,
        assignedSectionId,
        assignedCount: assignedInGroup.length,
        totalCount: groupStudentIds.size,
      }
    })

    return (
      <div className="space-y-4">
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-700">
            Assign groups or individual students to target sections. All students must be assigned before proceeding.
          </p>
        </div>

        {unassignedStudents.length > 0 && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-700">
              <ExclamationCircleIcon className="w-4 h-4 inline mr-1" />
              {unassignedStudents.length} student{unassignedStudents.length !== 1 ? 's' : ''} still need to be assigned to a section.
            </p>
          </div>
        )}

        {assignedCount === allStudentsToAssign.length && allStudentsToAssign.length > 0 && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-700">
              <CheckCircleIcon className="w-4 h-4 inline mr-1" />
              All {allStudentsToAssign.length} student{allStudentsToAssign.length !== 1 ? 's' : ''} have been assigned to sections.
            </p>
          </div>
        )}

        {/* Quick Assign All */}
        <div className="mb-4 p-4 bg-gray-50 rounded-lg">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Quick Assign All Students To:
          </label>
          <div className="flex gap-2 flex-wrap">
            {sections.map(section => (
              <Button
                key={section.id}
                onClick={() => handleAssignAllToSection(section.id)}
                variant="outline"
                size="sm"
                className="text-xs"
              >
                {section.title}
              </Button>
            ))}
          </div>
        </div>

        {/* Groups Section */}
        {groupsWithStatus.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-lg font-medium text-gray-900">Student Groups</h4>
            {groupsWithStatus.map(({ groupId, groupName, groupStudents, allAssigned, someAssigned, assignedSectionId, assignedCount, totalCount }) => {
              const isExpanded = expandedSections.has(`group-${groupId}`)
              
              return (
                <div key={groupId} className={`border rounded-lg overflow-hidden ${
                  allAssigned ? 'border-green-300 bg-green-50' : someAssigned ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200 bg-white'
                }`}>
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center space-x-3 flex-1">
                      <UserGroupIcon className={`w-5 h-5 ${
                        allAssigned ? 'text-green-600' : someAssigned ? 'text-yellow-600' : 'text-gray-400'
                      }`} />
                      <div className="flex-1">
                        <h5 className="font-medium text-gray-900">{groupName}</h5>
                        <p className="text-sm text-gray-500">
                          {allAssigned ? (
                            <span className="text-green-700">
                              All {totalCount} students assigned to {sections.find(s => s.id === assignedSectionId)?.title || 'section'}
                            </span>
                          ) : someAssigned ? (
                            <span className="text-yellow-700">
                              {assignedCount} of {totalCount} students assigned
                            </span>
                          ) : (
                            <span className="text-gray-600">
                              {totalCount} student{totalCount !== 1 ? 's' : ''} - Not assigned
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      {!allAssigned && (
                        <select
                          value={assignedSectionId || ''}
                          onChange={(e) => handleAssignGroupToSection(groupId, e.target.value)}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-w-[200px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="">Assign group to section...</option>
                          {sections.map(section => (
                            <option key={section.id} value={section.id}>
                              {section.title}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        onClick={() => handleToggleSection(`group-${groupId}`)}
                        className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDownIcon className="w-5 h-5" />
                        ) : (
                          <ChevronRightIcon className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="p-4 bg-white border-t border-gray-200">
                      <div className="space-y-2">
                        {groupStudents.map(student => {
                          const studentSectionId = studentAssignments.get(student.id)
                          return (
                            <div key={student.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                              <div className="flex-1">
                                <p className="text-sm font-medium text-gray-900">
                                  {`${student.first_name} ${student.middle_name || ''} ${student.last_name} ${student.ext_name || ''}`.trim()}
                                </p>
                                <p className="text-xs text-gray-500">{student.lrn || 'No LRN'}</p>
                              </div>
                              <select
                                value={studentSectionId || ''}
                                onChange={(e) => handleAssignStudent(student.id, e.target.value)}
                                className="ml-4 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                              >
                                <option value="">Select section...</option>
                                {sections.map(sec => (
                                  <option key={sec.id} value={sec.id}>
                                    {sec.title}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Ungrouped Students */}
        {ungroupedStudents.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-lg font-medium text-gray-900">Ungrouped Students</h4>
            <div className="border-2 border-dashed border-gray-300 rounded-lg overflow-hidden">
              <button
                onClick={() => handleToggleSection('ungrouped')}
                className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center space-x-3">
                  {expandedSections.has('ungrouped') ? (
                    <ChevronDownIcon className="w-5 h-5 text-gray-500" />
                  ) : (
                    <ChevronRightIcon className="w-5 h-5 text-gray-500" />
                  )}
                  <span className="font-medium text-gray-900">
                    Ungrouped Students
                  </span>
                  <span className="text-sm text-gray-500">
                    ({ungroupedStudents.length})
                  </span>
                </div>
              </button>

              {expandedSections.has('ungrouped') && (
                <div className="p-4 bg-white">
                  <div className="space-y-2">
                    {ungroupedStudents.map(studentId => {
                      const student = students.find(s => s.id === studentId)
                      if (!student) return null
                      return (
                        <div key={student.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">
                              {`${student.first_name} ${student.middle_name || ''} ${student.last_name} ${student.ext_name || ''}`.trim()}
                            </p>
                            <p className="text-xs text-gray-500">{student.lrn || 'No LRN'}</p>
                          </div>
                          <select
                            value={studentAssignments.get(student.id) || ''}
                            onChange={(e) => handleAssignStudent(student.id, e.target.value)}
                            className="ml-4 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                          >
                            <option value="">Select section...</option>
                            {sections.map(sec => (
                              <option key={sec.id} value={sec.id}>
                                {sec.title}
                              </option>
                            ))}
                          </select>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    )
  }

  // Render Step 3: Map Subjects
  const renderStep3 = () => {
    // Get groups with their assigned sections
    const groupsWithSections = Array.from(studentGroups.entries())
      .map(([groupId, groupStudentIds]) => {
        const groupName = groupNames.get(groupId) || `Group ${groupId}`
        // Get the assigned section for this group (all students in group should have same section)
        const firstStudentId = Array.from(groupStudentIds)[0]
        const assignedSectionId = firstStudentId ? studentAssignments.get(firstStudentId) : null
        const assignedSection = assignedSectionId ? sections.find(s => s.id === assignedSectionId) : null

        return {
          groupId,
          groupName,
          assignedSectionId,
          assignedSection,
        }
      })
      .filter(group => group.assignedSectionId !== null && group.assignedSectionId !== undefined)

    return (
      <div className="space-y-4">
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-700">
            <strong>Optional:</strong> Map subjects from the dissolving section to subjects in the target sections. Mapped subjects will have their grades transferred. Unmapped subjects will be marked as deleted.
          </p>
        </div>

        {/* Auto-map button for each group */}
        {groupsWithSections.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {groupsWithSections.map(({ groupId, groupName, assignedSectionId, assignedSection }) => (
              <Button
                key={groupId}
                onClick={() => handleAutoMap(assignedSectionId!)}
                variant="outline"
                size="sm"
                className="text-xs"
              >
                Auto-map for {groupName} → {assignedSection?.title}
              </Button>
            ))}
          </div>
        )}

        {currentSubjects.length === 0 ? (
          <div className="p-8 text-center bg-gray-50 rounded-lg">
            <AcademicCapIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No subjects in this section to map.</p>
          </div>
        ) : groupsWithSections.length === 0 ? (
          <div className="p-8 text-center bg-gray-50 rounded-lg">
            <UserGroupIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No groups have been assigned to sections yet. Please complete Step 2 first.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {groupsWithSections.map(({ groupId, groupName, assignedSectionId, assignedSection }) => {
              const isExpanded = expandedSections.has(`subject-group-${groupId}`)
              const targetSubjects = assignedSectionId ? getTargetSectionSubjects(assignedSectionId) : []
              const targetSubjectsQueryIndex = assignedSectionId ? targetSectionIds.indexOf(assignedSectionId) : -1
              const targetSubjectsQuery = targetSubjectsQueryIndex >= 0 
                ? targetSectionSubjectsQueries[targetSubjectsQueryIndex]
                : null
              const targetSubjectsLoading = targetSubjectsQuery?.isLoading || false
              const targetSubjectsError = targetSubjectsQuery?.error

              return (
                <div key={groupId} className="border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => handleToggleSection(`subject-group-${groupId}`)}
                    className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      {isExpanded ? (
                        <ChevronDownIcon className="w-5 h-5 text-gray-500" />
                      ) : (
                        <ChevronRightIcon className="w-5 h-5 text-gray-500" />
                      )}
                      <UserGroupIcon className="w-5 h-5 text-indigo-600" />
                      <div className="text-left">
                        <span className="font-medium text-gray-900">{groupName}</span>
                        <span className="text-sm text-gray-500 ml-2">
                          → {assignedSection?.title || 'Unknown Section'}
                        </span>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="p-4 bg-white border-t border-gray-200">
                      <div className="space-y-4">
                        {targetSubjectsLoading ? (
                          <div className="p-8 text-center">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mx-auto mb-3"></div>
                            <p className="text-sm text-gray-500">Loading subjects for {assignedSection?.title}...</p>
                          </div>
                        ) : targetSubjectsError ? (
                          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-sm text-red-700">
                              <ExclamationCircleIcon className="w-4 h-4 inline mr-1" />
                              Error loading subjects for {assignedSection?.title}
                            </p>
                          </div>
                        ) : subjectHierarchy.length === 0 ? (
                          <p className="text-sm text-gray-500 text-center py-4">
                            No subjects to map for this group.
                          </p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="min-w-full">
                              <thead>
                                <tr className="border-b border-gray-200">
                                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                                    Current Section Subjects
                                  </th>
                                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-700 w-12">
                                    {/* Arrow column */}
                                  </th>
                                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                                    Target Section Subjects
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {subjectHierarchy.map((parentSubject) => {
                                  const parentMapping = subjectMappings.get(parentSubject.id)
                                  const currentParentMapping = parentMapping?.targetSectionId === assignedSectionId ? parentMapping : null
                                  const hasChildren = parentSubject.child_subjects && parentSubject.child_subjects.length > 0

                                  // Get all mapped target subject IDs for this section (excluding current selection)
                                  const mappedTargetSubjectIds = new Set(
                                    Array.from(subjectMappings.entries())
                                      .filter(([sourceId, mapping]) => 
                                        mapping.targetSectionId === assignedSectionId && 
                                        mapping.targetSubjectId !== '' &&
                                        sourceId !== parentSubject.id // Exclude current subject
                                      )
                                      .map(([, mapping]) => mapping.targetSubjectId)
                                  )

                                  // Filter available parent subjects (exclude already mapped ones, but include currently selected)
                                  const availableParentSubjects = targetSubjects.filter(s => 
                                    s.subject_type === 'parent' && 
                                    (s.id === currentParentMapping?.targetSubjectId || !mappedTargetSubjectIds.has(s.id))
                                  )

                                  return (
                                    <React.Fragment key={parentSubject.id}>
                                      {/* Parent Subject Row */}
                                      <tr className="hover:bg-gray-50 bg-gray-50">
                                        <td className="px-4 py-3">
                                          <div>
                                            <p className="text-sm font-medium text-gray-900">
                                              {parentSubject.title}
                                              {parentSubject.variant && (
                                                <span className="text-xs text-gray-500 ml-1">
                                                  - {parentSubject.variant}
                                                </span>
                                              )}
                                            </p>
                                          </div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                          <ArrowRightIcon className="w-5 h-5 text-gray-400 mx-auto" />
                                        </td>
                                        <td className="px-4 py-3">
                                          <select
                                            value={currentParentMapping?.targetSubjectId || ''}
                                            onChange={(e) => {
                                              if (e.target.value) {
                                                handleMapSubject(parentSubject.id, e.target.value, assignedSectionId!)
                                              } else {
                                                handleMapSubject(parentSubject.id, '', '')
                                              }
                                            }}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                          >
                                            <option value="">Select subject...</option>
                                            {availableParentSubjects.map(subject => (
                                              <option key={subject.id} value={subject.id}>
                                                {subject.title}
                                                {subject.variant && ` - ${subject.variant}`}
                                              </option>
                                            ))}
                                          </select>
                                        </td>
                                      </tr>
                                      {/* Child Subjects Rows */}
                                      {hasChildren && parentSubject.child_subjects!.map((childSubject) => {
                                        const childMapping = subjectMappings.get(childSubject.id)
                                        const currentChildMapping = childMapping?.targetSectionId === assignedSectionId ? childMapping : null
                                        // Get the mapped parent subject to find its children
                                        const mappedParentId = currentParentMapping?.targetSubjectId
                                        const mappedParent = mappedParentId ? targetSubjects.find(s => s.id === mappedParentId) : null
                                        const allChildTargetSubjects = mappedParent ? targetSubjects.filter(s => s.parent_subject_id === mappedParentId) : []

                                        // Get all mapped target child subject IDs for this section (excluding current selection)
                                        const mappedTargetChildSubjectIds = new Set(
                                          Array.from(subjectMappings.entries())
                                            .filter(([sourceId, mapping]) => 
                                              mapping.targetSectionId === assignedSectionId && 
                                              mapping.targetSubjectId !== '' &&
                                              sourceId !== childSubject.id // Exclude current child subject
                                            )
                                            .map(([, mapping]) => mapping.targetSubjectId)
                                        )

                                        // Filter available child subjects (exclude already mapped ones, but include currently selected)
                                        const availableChildTargetSubjects = allChildTargetSubjects.filter(s => 
                                          s.id === currentChildMapping?.targetSubjectId || !mappedTargetChildSubjectIds.has(s.id)
                                        )

                                        return (
                                          <tr key={childSubject.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 pl-8">
                                              <div>
                                                <p className="text-sm font-medium text-gray-700">
                                                  <span className="text-xs text-gray-500 mr-2">└─</span>
                                                  {childSubject.title}
                                                  {childSubject.variant && (
                                                    <span className="text-xs text-gray-500 ml-1">
                                                      - {childSubject.variant}
                                                    </span>
                                                  )}
                                                </p>
                                              </div>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                              <ArrowRightIcon className="w-5 h-5 text-gray-400 mx-auto" />
                                            </td>
                                            <td className="px-4 py-3">
                                              <select
                                                value={currentChildMapping?.targetSubjectId || ''}
                                                onChange={(e) => {
                                                  if (e.target.value) {
                                                    handleMapSubject(childSubject.id, e.target.value, assignedSectionId!)
                                                  } else {
                                                    handleMapSubject(childSubject.id, '', '')
                                                  }
                                                }}
                                                disabled={!currentParentMapping?.targetSubjectId}
                                                className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                                                  !currentParentMapping?.targetSubjectId ? 'bg-gray-100 cursor-not-allowed' : ''
                                                }`}
                                              >
                                                <option value="">
                                                  {!currentParentMapping?.targetSubjectId 
                                                    ? 'Select parent subject first...' 
                                                    : 'Select subject...'}
                                                </option>
                                                {availableChildTargetSubjects.map(subject => (
                                                  <option key={subject.id} value={subject.id}>
                                                    {subject.title}
                                                    {subject.variant && ` - ${subject.variant}`}
                                                  </option>
                                                ))}
                                              </select>
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
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

      </div>
    )
  }

  // Render Step 4: Review & Confirm
  const renderStep4 = () => {
    const summaryBySection = new Map<string, { students: Student[]; subjects: Subject[] }>()
    
    Array.from(studentAssignments.entries()).forEach(([studentId, sectionId]) => {
      const student = students.find(s => s.id === studentId)
      if (student) {
        if (!summaryBySection.has(sectionId)) {
          summaryBySection.set(sectionId, { students: [], subjects: [] })
        }
        summaryBySection.get(sectionId)!.students.push(student)
      }
    })

    // Add subject mappings to summary
    Array.from(subjectMappings.entries()).forEach(([sourceSubjectId, mapping]) => {
      const sectionData = summaryBySection.get(mapping.targetSectionId)
      if (sectionData) {
        const sourceSubject = currentSubjects.find(s => s.id === sourceSubjectId)
        if (sourceSubject) {
          sectionData.subjects.push(sourceSubject)
        }
      }
    })

    return (
      <div className="space-y-4">
        <div className="mb-4 p-4 bg-red-50 border-2 border-red-300 rounded-lg">
          <p className="text-xl font-bold text-red-700 text-center">
            Final Review: Student Transfer
          </p>
          <p className="text-sm text-red-600 text-center mt-2">
            This action cannot be undone. Please review all details carefully.
          </p>
        </div>

        <div className="space-y-4">
          {Array.from(summaryBySection.entries()).map(([sectionId, data]) => {
            const section = sections.find(s => s.id === sectionId)
            return (
              <div key={sectionId} className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-3">{section?.title || 'Unknown Section'}</h4>
                
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      Students ({data.students.length}):
                    </p>
                    <div className="pl-4 space-y-1">
                      {data.students.map(student => (
                        <p key={student.id} className="text-sm text-gray-600">
                          • {`${student.first_name} ${student.middle_name || ''} ${student.last_name} ${student.ext_name || ''}`.trim()}
                        </p>
                      ))}
                    </div>
                  </div>

                  {data.subjects.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">
                        Subject Mappings ({data.subjects.length}):
                      </p>
                      <div className="pl-4 space-y-1">
                        {data.subjects.map(subject => {
                          const mapping = subjectMappings.get(subject.id)
                          const targetSubject = getTargetSectionSubjects(sectionId).find(s => s.id === mapping?.targetSubjectId)
                          return (
                            <p key={subject.id} className="text-sm text-gray-600">
                              • {subject.title} → {targetSubject?.title || 'Unmapped'}
                            </p>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-700">
            <strong>Total Students:</strong> {selectedStudentIds.size}
          </p>
          <p className="text-sm text-gray-700">
            <strong>Target Sections:</strong> {summaryBySection.size}
          </p>
          <p className="text-sm text-gray-700">
            <strong>Subject Mappings:</strong> {subjectMappings.size}
          </p>
        </div>
      </div>
    )
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          {/* Dark Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-75 transition-opacity"
            onClick={handleClose}
          />

          {/* Modal */}
          <div className="flex min-h-full items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-5xl bg-white rounded-lg shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">
                    Student Transfer{sectionTitle ? `: ${sectionTitle}` : ''}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">Step {currentStep} of {STEPS.length}</p>
                </div>
                <button
                  onClick={handleClose}
                  disabled={loading}
                  className="text-gray-400 hover:text-gray-600 transition-colors duration-200 disabled:opacity-50"
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
                    const isClickable = currentStep > step.id

                    return (
                      <React.Fragment key={step.id}>
                        <div className="flex items-center">
                          <button
                            onClick={() => isClickable && setCurrentStep(step.id as Step)}
                            disabled={!isClickable}
                            className={`flex flex-col items-center space-y-1 ${
                              isClickable ? 'cursor-pointer' : 'cursor-not-allowed'
                            }`}
                          >
                            <div
                              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                                isCompleted
                                  ? 'bg-green-500 text-white'
                                  : isActive
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-gray-300 text-gray-600'
                              }`}
                            >
                              {isCompleted ? (
                                <CheckCircleIcon className="w-6 h-6" />
                              ) : (
                                <StepIcon className="w-5 h-5" />
                              )}
                            </div>
                            <span
                              className={`text-xs font-medium ${
                                isActive ? 'text-indigo-600' : isCompleted ? 'text-green-600' : 'text-gray-500'
                              }`}
                            >
                              {step.title}
                            </span>
                          </button>
                        </div>
                        {index < STEPS.length - 1 && (
                          <div
                            className={`flex-1 h-0.5 mx-2 ${
                              isCompleted ? 'bg-green-500' : 'bg-gray-300'
                            }`}
                          />
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
                {currentStep === 4 && renderStep4()}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between p-6 border-t border-gray-200">
                <Button
                  type="button"
                  onClick={handleClose}
                  disabled={loading}
                  variant="outline"
                >
                  Cancel
                </Button>
                <div className="flex items-center space-x-3">
                  {currentStep > 1 && (
                    <Button
                      type="button"
                      onClick={handlePrevious}
                      disabled={loading}
                      variant="outline"
                    >
                      Previous
                    </Button>
                  )}
                  {currentStep < 4 ? (
                    <Button
                      type="button"
                      onClick={handleNext}
                      disabled={
                        loading ||
                        (currentStep === 1 && !canProceedToStep2) ||
                        (currentStep === 2 && !canProceedToStep3) ||
                        (currentStep === 3 && !canProceedToStep4)
                      }
                      className="bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500"
                    >
                      Next
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={handleConfirm}
                      disabled={loading || !canConfirm || dissolveMutation.isPending || !sectionId}
                      loading={dissolveMutation.isPending}
                      className="bg-green-600 hover:bg-green-700 focus:ring-green-500"
                    >
                      {dissolveMutation.isPending ? 'Transferring Students...' : 'Confirm & Transfer Students'}
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
