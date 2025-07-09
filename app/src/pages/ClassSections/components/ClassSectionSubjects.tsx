import React, { useState } from 'react'
import { motion, Reorder } from 'framer-motion'
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
import { Button } from '../../../components/button'
import type { ClassSection, ClassSectionSubject } from '../../../types'

interface ClassSectionSubjectsProps {
  selectedClassSection: ClassSection | null
  subjects: ClassSectionSubject[]
  onCreateSubject: () => void
  onEditSubject: (subject: ClassSectionSubject) => void
  onDeleteSubject: (subject: ClassSectionSubject) => void
  onReorderSubjects: (subjects: ClassSectionSubject[]) => void
}

export const ClassSectionSubjects: React.FC<ClassSectionSubjectsProps> = ({
  selectedClassSection,
  subjects,
  onCreateSubject,
  onEditSubject,
  onDeleteSubject,
  onReorderSubjects,
}) => {
  const [isDragging, setIsDragging] = useState(false)
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set())
  const [draggedSubject, setDraggedSubject] = useState<ClassSectionSubject | null>(null)
  const [dragOverSubject, setDragOverSubject] = useState<string | null>(null)

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
  const flattenSubjectsForReorder = (subjects: ClassSectionSubject[]): ClassSectionSubject[] => {
    const result: ClassSectionSubject[] = []
    subjects.forEach(subject => {
      result.push(subject)
      if (subject.children && subject.children.length > 0) {
        result.push(...flattenSubjectsForReorder(subject.children))
      }
    })
    return result
  }

  // Drag and drop handlers
  const handleDragStart = (subject: ClassSectionSubject) => {
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

  const handleDrop = (e: React.DragEvent, targetSubjectId: string) => {
    e.preventDefault()
    
    if (!draggedSubject || draggedSubject.id === targetSubjectId) {
      return
    }

    // Get all subjects for this class section
    const allSubjects = flattenSubjectsForReorder(subjects)
    
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

    onReorderSubjects(reorderedWithUpdatedOrder)
    handleDragEnd()
  }



  // Component for rendering individual subject
  const SubjectItem = ({ subject, isChild = false }: { subject: ClassSectionSubject; isChild?: boolean }) => (
    <motion.div
      layout
      draggable
      onDragStart={() => handleDragStart(subject)}
      onDragEnd={handleDragEnd}
      onDragOver={(e) => handleDragOver(e, subject.id)}
      onDrop={(e) => handleDrop(e, subject.id)}
      className={`group relative p-4 rounded-lg border-2 transition-all duration-200 ${
        isDragging && draggedSubject?.id === subject.id
          ? 'border-indigo-500 bg-indigo-50 shadow-lg scale-105'
          : dragOverSubject === subject.id
          ? 'border-green-500 bg-green-50'
          : 'border-gray-200 hover:border-gray-300 bg-white hover:shadow-md'
      } ${isChild ? 'ml-6 border-l-4 border-l-indigo-200' : ''}`}
    >
      {/* Drag Handle */}
      <div className="absolute left-2 top-1/2 transform -translate-y-1/2 cursor-grab active:cursor-grabbing p-1 rounded hover:bg-gray-100 transition-colors">
        <Bars3Icon className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
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
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full flex-shrink-0">
              #{subject.order}
            </span>
            {!subject.subject_teacher && subject.children && subject.children.length > 0 && (
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
            {subject.subject_teacher && (
              <div className="flex items-center text-sm text-gray-600">
                <UserIcon className="w-4 h-4 mr-2 flex-shrink-0" />
                <span className="truncate">{subject.subject_teacher}</span>
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
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Subjects</h2>
          <p className="text-sm text-gray-600">
            {selectedClassSection.title} - {selectedClassSection.grade_level}
          </p>
        </div>
        <Button
          onClick={onCreateSubject}
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          <PlusIcon className="w-4 h-4 mr-2" />
          Add Subject
        </Button>
      </div>

      {/* Subjects List */}
      <div className="space-y-3">
        {subjects.length === 0 ? (
          <div className="text-center py-8">
            <AcademicCapIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-4">No subjects assigned to this class section</p>
            <Button
              onClick={onCreateSubject}
              variant="outline"
              className="border-indigo-200 text-indigo-600 hover:bg-indigo-50"
            >
              <PlusIcon className="w-4 h-4 mr-2" />
              Add First Subject
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {subjects.map((subject) => (
              <div key={subject.id} className="space-y-2">
                {/* Parent Subject */}
                <div className="relative w-full">
                  <div className="flex items-center w-full">
                    {subject.children && subject.children.length > 0 && (
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
                {subject.children && subject.children.length > 0 && isParentExpanded(subject.id) && (
                  <div className="ml-6 space-y-2">
                    {subject.children.map((child) => (
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
      {subjects.length > 1 && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-700">
            💡 Drag and drop subjects to reorder them. You can drag both parent and child subjects. The order will be saved automatically. Use the drag handle (⋮⋮) to drag subjects.
          </p>
        </div>
      )}
    </div>
  )
} 