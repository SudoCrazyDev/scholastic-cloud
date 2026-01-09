import React, { useState, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { 
  PlusIcon,
  PencilIcon, 
  TrashIcon,
  Bars3Icon,
  ClockIcon,
  UserIcon,
  AcademicCapIcon,
  ChevronDownIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline'
import { Alert } from '../../../components/alert'
import type { ClassSection, Subject } from '../../../types'

interface ClassSectionSubjectsProps {
  selectedClassSection: ClassSection | null
  subjects: Subject[]
  onCreateSubject: () => void
  onEditSubject: (subject: Subject) => void
  onDeleteSubject: (subject: Subject) => void
  onReorderSubjects: (classSectionId: string, subjectOrders: Array<{ id: string; order: number }>) => Promise<void>
  onDissolveSection?: () => void
  loading?: boolean
}

export const ClassSectionSubjects: React.FC<ClassSectionSubjectsProps> = ({
  selectedClassSection,
  subjects,
  onCreateSubject,
  onEditSubject,
  onDeleteSubject,
  onReorderSubjects,
  onDissolveSection,
  loading = false,
}) => {
  const [isDragging, setIsDragging] = useState(false)
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set())
  const [draggedSubject, setDraggedSubject] = useState<Subject | null>(null)
  const [dragOverSubject, setDragOverSubject] = useState<string | null>(null)
  const [alert, setAlert] = useState<{
    type: 'success' | 'error';
    message: string;
    show: boolean;
  } | null>(null)
  
  // New state for debounced reordering
  const [localSubjects, setLocalSubjects] = useState<Subject[]>(subjects)
  const [pendingChanges, setPendingChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Update local subjects when props change
  React.useEffect(() => {
    setLocalSubjects(subjects)
  }, [subjects])

  const toggleParentExpansion = (parentId: string) => {
    setExpandedParents(prev => {
      const newSet = new Set(prev)
      if (newSet.has(parentId)) {
        newSet.delete(parentId)
      } else {
        newSet.add(parentId)
      }
      return newSet
    })
  }

  const isParentExpanded = (parentId: string) => expandedParents.has(parentId)

  // Helper function to flatten hierarchical subjects for reordering
  const flattenSubjectsForReorder = (subjects: Subject[]): Subject[] => {
    const result: Subject[] = []
    subjects.forEach(subject => {
      result.push(subject)
      if (subject.child_subjects && subject.child_subjects.length > 0) {
        result.push(...flattenSubjectsForReorder(subject.child_subjects))
      }
    })
    return result
  }

  // Debounced save function
  const debouncedSave = useCallback((subjectOrders: Array<{ id: string; order: number }>) => {
    // Clear any existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current)
    }

    // Set new timeout for 5 seconds
    debounceTimeoutRef.current = setTimeout(async () => {
      if (!selectedClassSection) return

      try {
        setIsSaving(true)
        setPendingChanges(false)
        
        await onReorderSubjects(selectedClassSection.id, subjectOrders)
        
        // Show success message
        setAlert({
          type: 'success',
          message: 'Subjects reordered successfully!',
          show: true
        })
        
        // Auto-hide success message after 3 seconds
        setTimeout(() => {
          setAlert(null)
        }, 3000)
      } catch (error) {
        console.error('Failed to reorder subjects:', error)
        // Show error message to user
        setAlert({
          type: 'error',
          message: 'Failed to reorder subjects. Please try again.',
          show: true
        })
        
        // Reset local subjects to match server state
        setLocalSubjects(subjects)
      } finally {
        setIsSaving(false)
      }
    }, 5000) // 5 second delay
  }, [selectedClassSection, onReorderSubjects, subjects])

  // Drag and drop handlers
  const handleDragStart = (subject: Subject) => {
    setDraggedSubject(subject)
    setIsDragging(true)
  }

  const handleDragEnd = () => {
    setIsDragging(false)
    setDraggedSubject(null)
    setDragOverSubject(null)
  }

  const handleDragOver = (e: React.DragEvent, subjectId: string) => {
    e.preventDefault()
    setDragOverSubject(subjectId)
  }

  const handleDrop = async (e: React.DragEvent, targetSubjectId: string) => {
    e.preventDefault()
    
    if (!draggedSubject || draggedSubject.id === targetSubjectId || !selectedClassSection) {
      return
    }

    // Get all subjects for this class section
    const allSubjects = flattenSubjectsForReorder(localSubjects)
    
    // Find the indices of dragged and target subjects
    const draggedIndex = allSubjects.findIndex(s => s.id === draggedSubject.id)
    const targetIndex = allSubjects.findIndex(s => s.id === targetSubjectId)
    
    if (draggedIndex === -1 || targetIndex === -1) {
      return
    }

    // Reorder the subjects
    const reorderedSubjects = [...allSubjects]
    const [removed] = reorderedSubjects.splice(draggedIndex, 1)
    reorderedSubjects.splice(targetIndex, 0, removed)

    // Update order numbers
    const reorderedWithUpdatedOrder = reorderedSubjects.map((subject, index) => ({
      ...subject,
      order: index + 1
    }))

    // Update local state immediately for smooth UI
    setLocalSubjects(() => {
      // This is a simplified update - in a real implementation you'd need to
      // properly reconstruct the hierarchical structure
      return reorderedWithUpdatedOrder
    })
    
    // Set pending changes flag
    setPendingChanges(true)

    // Prepare the subject orders for the API call
    const subjectOrders = reorderedWithUpdatedOrder.map(subject => ({
      id: subject.id,
      order: subject.order
    }))
    
    // Trigger debounced save
    debouncedSave(subjectOrders)
    
    handleDragEnd()
  }

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }
    }
  }, [])

  // Component for rendering individual subject
  const SubjectItem = ({ subject, isChild = false }: { subject: Subject; isChild?: boolean }) => (
    <motion.div
      layout
      draggable={!isSaving}
      onDragStart={() => handleDragStart(subject)}
      onDragEnd={handleDragEnd}
      onDragOver={(e) => handleDragOver(e, subject.id)}
      onDrop={(e) => handleDrop(e, subject.id)}
      className={`group relative p-4 rounded-lg border-2 transition-all duration-200 ${
        isDragging && draggedSubject?.id === subject.id
          ? 'border-indigo-500 bg-indigo-50 shadow-lg scale-105'
          : dragOverSubject === subject.id
          ? 'border-green-500 bg-green-50'
          : isSaving
          ? 'border-gray-200 bg-gray-50 opacity-75'
          : 'border-gray-200 hover:border-gray-300 bg-white hover:shadow-md'
      } ${isChild ? 'ml-6 border-l-4 border-l-indigo-200' : ''}`}
    >
      {/* Drag Handle */}
      <div className={`absolute left-2 top-1/2 transform -translate-y-1/2 p-1 rounded transition-colors ${
        isSaving ? 'cursor-not-allowed opacity-50' : 'cursor-grab active:cursor-grabbing hover:bg-gray-100'
      }`}>
        {isSaving ? (
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600"></div>
        ) : (
          <Bars3Icon className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
        )}
      </div>

      {/* Main Content */}
      <div className="flex items-start justify-between pl-8">
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2 mb-2">
            <AcademicCapIcon className={`w-5 h-5 flex-shrink-0 ${isChild ? 'text-indigo-600' : 'text-green-600'}`} />
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 truncate">
                {subject.title}
                {subject.variant && (
                  <span className="text-gray-600 font-normal ml-1">
                    - {subject.variant}
                  </span>
                )}
              </h3>
            </div>
            {subject.subject_type === 'parent' && (
              <span className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded-full flex-shrink-0">
                Parent
              </span>
            )}
            {subject.variant && (
              <span className="text-xs bg-purple-100 text-purple-600 px-2 py-1 rounded-full flex-shrink-0">
                Variant
              </span>
            )}
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center text-sm text-gray-600">
              <ClockIcon className="w-4 h-4 mr-2 flex-shrink-0" />
              <span>{subject.start_time} - {subject.end_time}</span>
            </div>
            {subject.adviser_user && (
              <div className="flex items-center text-sm text-gray-600">
                <UserIcon className="w-4 h-4 mr-2 flex-shrink-0" />
                <span className="truncate">
                  {subject.adviser_user.first_name} {subject.adviser_user.last_name}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity ml-3">
          <button
            onClick={() => onEditSubject(subject)}
            className="p-1.5 text-gray-400 hover:text-indigo-600 transition-colors rounded"
            title="Edit subject"
          >
            <PencilIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDeleteSubject(subject)}
            className="p-1.5 text-gray-400 hover:text-red-600 transition-colors rounded"
            title="Delete subject"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Reorder indicator */}
      {isDragging && (
        <div className="absolute inset-0 bg-indigo-50 border-2 border-dashed border-indigo-300 rounded-lg flex items-center justify-center">
          <span className="text-indigo-600 font-medium">Drop to reorder</span>
        </div>
      )}
    </motion.div>
  )

  // No class section selected
  if (!selectedClassSection) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="text-center py-12">
          <AcademicCapIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Class Section Selected</h3>
          <p className="text-gray-500">
            Please select a class section from the list to view and manage its subjects.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      {/* Alert */}
      {alert && (
        <div className="mb-4">
          <Alert
            type={alert.type}
            message={alert.message}
            show={alert.show}
            onClose={() => setAlert(null)}
          />
        </div>
      )}
      
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Subjects</h2>
          <p className="text-sm text-gray-600">
            {selectedClassSection.title} - {selectedClassSection.grade_level}
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onCreateSubject}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors duration-200 cursor-pointer flex items-center space-x-2"
          >
            <PlusIcon className="w-4 h-4" />
            <span>Add Subject</span>
          </motion.button>
          {onDissolveSection && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onDissolveSection}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-colors duration-200 cursor-pointer flex items-center space-x-2"
            >
                    <span>Dissolve</span>
            </motion.button>
          )}
        </div>
      </div>

      {/* Pending Changes Indicator */}
      {pendingChanges && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center space-x-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600"></div>
            <p className="text-sm text-yellow-700">
              Changes will be saved automatically in a few seconds...
            </p>
          </div>
        </div>
      )}

      {/* Subjects List */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-3"></div>
            <p className="text-gray-500">Loading subjects...</p>
          </div>
        ) : localSubjects.length === 0 ? (
          <div className="text-center py-8">
            <AcademicCapIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-4">No subjects assigned to this class section</p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onCreateSubject}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors duration-200 cursor-pointer flex items-center space-x-2"
            >
              <PlusIcon className="w-4 h-4" />
              <span>Add First Subject</span>
            </motion.button>
          </div>
        ) : (
          <div className="space-y-3">
            {localSubjects.map((subject) => (
              <div key={subject.id} className="space-y-2">
                {/* Parent Subject */}
                <div className="relative w-full">
                  <div className="flex items-center w-full">
                    {subject.child_subjects && subject.child_subjects.length > 0 && (
                      <button
                        onClick={() => toggleParentExpansion(subject.id)}
                        className="p-1 text-gray-400 hover:text-gray-600 transition-colors mr-2 flex-shrink-0"
                      >
                        {isParentExpanded(subject.id) ? (
                          <ChevronDownIcon className="w-4 h-4" />
                        ) : (
                          <ChevronRightIcon className="w-4 h-4" />
                        )}
                      </button>
                    )}
                    <div className="flex-1 min-w-0">
                      <SubjectItem subject={subject} />
                    </div>
                  </div>
                </div>

                {/* Child Subjects */}
                {subject.child_subjects && subject.child_subjects.length > 0 && isParentExpanded(subject.id) && (
                  <div className="ml-6 space-y-2">
                    {subject.child_subjects.map((child: Subject) => (
                      <SubjectItem key={child.id} subject={child} isChild={true} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Instructions */}
      {localSubjects.length > 1 && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-700">
            💡 Drag and drop subjects to reorder them. Changes will be saved automatically after 5 seconds of inactivity. Use the drag handle (⋮⋮) to drag subjects.
          </p>
        </div>
      )}
    </div>
  )
} 