import React, { useState, useRef, useCallback } from 'react'
import { motion, Reorder } from 'framer-motion'
import { 
  Plus,
  Edit,
  Trash2,
  GripVertical,
  Clock,
  User,
  BookOpen,
  Loader2,
  AlertCircle
} from 'lucide-react'
import { Button } from '../../../components/button'
import { Badge } from '../../../components/badge'
import { Alert } from '../../../components/alert'
import type { Subject } from '../../../types'

interface SubjectListProps {
  subjects: Subject[]
  loading?: boolean
  error?: any
  reordering?: boolean
  onCreateSubject: () => void
  onEditSubject: (subject: Subject) => void
  onDeleteSubject: (subject: Subject) => void
  onReorderSubjects: (subjectOrders: Array<{ id: string; order: number }>) => Promise<void>
}

export const SubjectList: React.FC<SubjectListProps> = ({
  subjects,
  loading = false,
  error,
  reordering = false,
  onCreateSubject,
  onEditSubject,
  onDeleteSubject,
  onReorderSubjects,
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
  
  // State for debounced reordering
  const [localSubjects, setLocalSubjects] = useState<Subject[]>(subjects)
  const [pendingChanges, setPendingChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Update local subjects when props change
  React.useEffect(() => {
    setLocalSubjects(subjects)
  }, [subjects])

  const getFullName = (user: { first_name?: string; middle_name?: string; last_name?: string; ext_name?: string }) => {
    const parts = [user?.first_name, user?.middle_name, user?.last_name, user?.ext_name]
    return parts.filter(Boolean).join(' ')
  }

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
      if (subject.childSubjects && subject.childSubjects.length > 0) {
        result.push(...flattenSubjectsForReorder(subject.childSubjects))
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

    // Set new timeout for 2 seconds
    debounceTimeoutRef.current = setTimeout(async () => {
      try {
        setIsSaving(true)
        setPendingChanges(false)
        
        await onReorderSubjects(subjectOrders)
        
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
    }, 2000) // 2 second delay
  }, [onReorderSubjects, subjects])

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

  const handleDrop = (e: React.DragEvent, targetSubjectId: string) => {
    e.preventDefault()
    if (!draggedSubject || draggedSubject.id === targetSubjectId) return

    const newSubjects = [...localSubjects]
    const draggedIndex = newSubjects.findIndex(s => s.id === draggedSubject.id)
    const targetIndex = newSubjects.findIndex(s => s.id === targetSubjectId)

    if (draggedIndex !== -1 && targetIndex !== -1) {
      // Remove dragged item
      const [draggedItem] = newSubjects.splice(draggedIndex, 1)
      // Insert at target position
      newSubjects.splice(targetIndex, 0, draggedItem)

      setLocalSubjects(newSubjects)
      setPendingChanges(true)

      // Create new order array
      const subjectOrders = newSubjects.map((subject, index) => ({
        id: subject.id,
        order: index + 1
      }))

      // Debounced save
      debouncedSave(subjectOrders)
    }
  }

  // Build hierarchical structure
  const buildSubjectHierarchy = (subjects: Subject[]) => {
    const subjectMap = new Map<string, Subject>()
    const rootSubjects: Subject[] = []

    // First pass: create map and identify root subjects
    subjects.forEach(subject => {
      subjectMap.set(subject.id, { ...subject, childSubjects: [] })
      if (!subject.parent_subject_id) {
        rootSubjects.push(subjectMap.get(subject.id)!)
      }
    })

    // Second pass: build hierarchy
    subjects.forEach(subject => {
      if (subject.parent_subject_id && subjectMap.has(subject.parent_subject_id)) {
        const parent = subjectMap.get(subject.parent_subject_id)!
        if (!parent.childSubjects) parent.childSubjects = []
        parent.childSubjects.push(subjectMap.get(subject.id)!)
      }
    })

    return rootSubjects
  }

  const hierarchicalSubjects = buildSubjectHierarchy(localSubjects)

  const SubjectItem = ({ subject, level = 0, index = 0 }: { subject: Subject; level?: number; index?: number }) => {
    const hasChildren = subject.childSubjects && subject.childSubjects.length > 0
    const isExpanded = isParentExpanded(subject.id)
    const hasNoAdviser = !subject.adviserUser

    return (
      <motion.div
        key={subject.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05 }}
        className={`relative group ${hasNoAdviser ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'} rounded-lg p-4 border hover:border-gray-300 transition-colors`}
        draggable
        onDragStart={() => handleDragStart(subject)}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleDragOver(e, subject.id)}
        onDrop={(e) => handleDrop(e, subject.id)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-1">
            {/* Drag handle */}
            <div className="flex-shrink-0 cursor-grab active:cursor-grabbing">
              <GripVertical className="w-4 h-4 text-gray-400" />
            </div>

            {/* Subject info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <h4 className={`text-sm font-medium ${hasNoAdviser ? 'text-red-700' : 'text-gray-900'}`}>
                  {subject.title}
                  {subject.variant && (
                    <span className="text-gray-500 ml-2">({subject.variant})</span>
                  )}
                </h4>
                {hasNoAdviser && (
                  <div title="No teacher assigned">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                  </div>
                )}
              </div>
              
              <div className="flex items-center space-x-4 mt-1">
                <Badge color={subject.subject_type === 'parent' ? 'green' : 'blue'}>
                  {subject.subject_type}
                </Badge>
                {subject.start_time && subject.end_time && (
                  <div className="flex items-center space-x-1 text-xs text-gray-500">
                    <Clock className="w-3 h-3" />
                    <span>{subject.start_time} - {subject.end_time}</span>
                  </div>
                )}
                {subject.adviserUser && (
                  <div className="flex items-center space-x-1 text-xs text-gray-500">
                    <User className="w-3 h-3" />
                    <span>{getFullName(subject.adviserUser)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Expand/collapse button for parent subjects */}
            {hasChildren && (
              <button
                onClick={() => toggleParentExpansion(subject.id)}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {isExpanded ? (
                  <BookOpen className="w-4 h-4" />
                ) : (
                  <BookOpen className="w-4 h-4" />
                )}
              </button>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity ml-3">
            <div title="Edit subject">
              <Button
                onClick={() => onEditSubject(subject)}
                variant="ghost"
                size="sm"
                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
              >
                <Edit className="w-4 h-4" />
              </Button>
            </div>
            <div title="Delete subject">
              <Button
                onClick={() => onDeleteSubject(subject)}
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Reorder indicator */}
        {isDragging && dragOverSubject === subject.id && (
          <div className="absolute inset-0 bg-indigo-50 border-2 border-dashed border-indigo-300 rounded-lg flex items-center justify-center">
            <span className="text-indigo-600 font-medium">Drop to reorder</span>
          </div>
        )}

        {/* Child subjects */}
        {hasChildren && isExpanded && (
          <div className="mt-3 ml-6 space-y-2">
            {subject.childSubjects!.map((child, childIndex) => (
              <SubjectItem
                key={child.id}
                subject={child}
                level={level + 1}
                index={childIndex}
              />
            ))}
          </div>
        )}
      </motion.div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert
        type="error"
        message="Failed to load subjects"
        show={true}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Alert */}
      {alert && (
        <Alert
          type={alert.type}
          message={alert.message}
          show={alert.show}
          onClose={() => setAlert(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Class Subjects</h3>
          <p className="text-sm text-gray-600">
            Manage subjects and their teachers for this class section
          </p>
        </div>
        <Button
          onClick={onCreateSubject}
          size="sm"
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Subject
        </Button>
      </div>

      {/* Pending Changes Indicator */}
      {pendingChanges && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center space-x-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600"></div>
            <p className="text-sm text-yellow-700">
              Changes will be saved automatically in a few seconds...
            </p>
          </div>
        </div>
      )}

      {/* Reordering Indicator */}
      {reordering && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center space-x-2">
            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
            <p className="text-sm text-blue-700">
              Reordering subjects...
            </p>
          </div>
        </div>
      )}

      {/* Subjects List */}
      {hierarchicalSubjects.length === 0 ? (
        <div className="text-center py-8">
          <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No subjects found</h3>
          <p className="text-gray-600 mb-4">
            No subjects have been assigned to this class section yet.
          </p>
          <Button
            onClick={onCreateSubject}
            variant="outline"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Subject
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {hierarchicalSubjects.map((subject, index) => (
            <SubjectItem
              key={subject.id}
              subject={subject}
              index={index}
            />
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h4 className="text-sm font-medium text-gray-900 mb-2">Legend</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-100 border border-green-300 rounded"></div>
            <span className="text-gray-600">Parent Subject</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-blue-100 border border-blue-300 rounded"></div>
            <span className="text-gray-600">Child Subject</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-red-100 border border-red-300 rounded"></div>
            <span className="text-gray-600">No Teacher Assigned</span>
          </div>
        </div>
      </div>
    </div>
  )
} 