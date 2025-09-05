/**
 * SubjectList Component
 * 
 * Features:
 * - Hierarchical display of parent and child subjects
 * - Drag and drop reordering for parent subjects only
 * - Visual indicators for subjects without teachers
 * - Expandable/collapsible parent subjects
 * - Edit and delete actions for subjects
 * 
 * Drag and Drop:
 * - Only parent subjects can be reordered
 * - Drag handle appears on hover (grip icon on the left)
 * - Visual feedback during dragging (scaling, shadow, color change)
 * - Disabled during reordering operations
 * - Uses @dnd-kit/core and @dnd-kit/sortable for smooth interactions
 */

import React, { useState, useRef, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import { 
  Plus,
  Edit,
  Trash2,
  BookOpen,
  Loader2,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  ChevronDown
} from 'lucide-react'
import { Button } from '../../../components/button'
import { Badge } from '../../../components/badge'
import type { Subject } from '../../../types'

interface SubjectListProps {
  subjects: Subject[]
  loading?: boolean
  error?: Error | null
  onCreateSubject: () => void
  onEditSubject: (subject: Subject) => void
  onDeleteSubject: (subject: Subject) => void
  onReorderSubjects?: (subjectOrders: Array<{ id: string; order: number }>) => void
  reordering?: boolean
  onRefetch?: () => void
}


// Regular Subject Item Component - moved outside to prevent hook ordering issues
const SubjectItem = ({ 
  subject, 
  index = 0, 
  isChild = false,
  onEditSubject,
  onDeleteSubject,
  isParent = false,
  expanded = false,
  onToggleExpand,
}: { 
  subject: Subject; 
  index?: number; 
  isChild?: boolean;
  onEditSubject: (subject: Subject) => void;
  onDeleteSubject: (subject: Subject) => void;
  isParent?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
}) => {
  const hasNoAdviser = !subject.adviser_user

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={`group relative p-4 rounded-lg border-2 transition-all duration-200 ${
        hasNoAdviser 
          ? 'border-red-200 bg-red-50'
          : 'border-gray-200 hover:border-gray-300 bg-white hover:shadow-md'
      } ${isChild ? 'ml-6 border-l-4 border-l-indigo-200' : ''}`}
    >
      {/* Main Content */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0 flex items-center">
          {/* Expand/Collapse button for parent subjects with children */}
          {isParent && subject.child_subjects && subject.child_subjects.length > 0 && (
            <button
              type="button"
              onClick={onToggleExpand}
              className="mr-2 flex items-center focus:outline-none group/chevron"
              aria-label={expanded ? 'Collapse' : 'Expand'}
              tabIndex={0}
            >
              <ChevronDown
                className={`w-5 h-5 text-gray-500 transition-transform duration-200 group-hover/chevron:text-indigo-600 ${expanded ? 'rotate-180' : ''}`}
              />
            </button>
          )}
          <BookOpen className={`w-5 h-5 flex-shrink-0 ${isChild ? 'text-indigo-600' : 'text-green-600'} mr-2`} />
          <div className="flex-1 min-w-0">
            <h3 className={`font-semibold truncate ${hasNoAdviser ? 'text-red-700' : 'text-gray-900'}`}
              // Make the title clickable to also toggle expand/collapse
              onClick={isParent && subject.child_subjects && subject.child_subjects.length > 0 ? onToggleExpand : undefined}
              style={{ cursor: isParent && subject.child_subjects && subject.child_subjects.length > 0 ? 'pointer' : 'default' }}
            >
              {subject.title}
              {subject.variant && (
                <span className="text-gray-600 font-normal ml-1">
                  - {subject.variant}
                </span>
              )}
            </h3>
          </div>
          <Badge color={subject.subject_type === 'parent' ? 'green' : 'blue'}>
            {subject.subject_type}
          </Badge>
          {hasNoAdviser && (
            <div title="No teacher assigned">
              <AlertCircle className="w-4 h-4 text-red-500" />
            </div>
          )}
        </div>
        {/* Actions */}
        <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity ml-3">
          <Button
            onClick={() => onEditSubject(subject)}
            variant="ghost"
            size="sm"
            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
          >
            <Edit className="w-4 h-4" />
          </Button>
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
    </motion.div>
  )
}

export const SubjectList: React.FC<SubjectListProps> = ({
  subjects,
  loading = false,
  error,
  onCreateSubject,
  onEditSubject,
  onDeleteSubject,
  onReorderSubjects,
  reordering = false,
  onRefetch,
}) => {
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set())
  const [orderedParentSubjects, setOrderedParentSubjects] = useState<Subject[]>(() => 
    subjects.filter(s => !s.parent_subject_id)
  )
  const subjectsRef = useRef<Subject[]>(subjects)
  const reorderTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [moveAnimationKey, setMoveAnimationKey] = useState(0)

  // Update ordered parent subjects when props change - use ref to avoid dependency issues
  React.useEffect(() => {
    const subjectsIds = subjects.map(s => s.id).join(',')
    const currentIds = subjectsRef.current.map(s => s.id).join(',')
    
    if (subjectsIds !== currentIds) {
      subjectsRef.current = subjects
      // Filter only parent subjects for reordering
      const parentSubjects = subjects.filter(s => !s.parent_subject_id)
      setOrderedParentSubjects(parentSubjects)
    }
  }, [subjects])

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (reorderTimeoutRef.current) {
        clearTimeout(reorderTimeoutRef.current)
      }
    }
  }, [])

  const toggleParentExpansion = useCallback((parentId: string) => {
    setExpandedParents(prev => {
      const newSet = new Set(prev)
      if (newSet.has(parentId)) {
        newSet.delete(parentId)
      } else {
        newSet.add(parentId)
      }
      return newSet
    })
  }, [])

  const isParentExpanded = useCallback((parentId: string) => expandedParents.has(parentId), [expandedParents])

  const hierarchicalSubjects = useMemo(() => {
    // Build hierarchy using ordered parent subjects but include all subjects for child relationships
    const subjectMap = new Map<string, Subject>()
    const rootSubjects: Subject[] = []

    // First pass: create map and identify root subjects from ordered parent subjects
    orderedParentSubjects.forEach(subject => {
      subjectMap.set(subject.id, { ...subject, child_subjects: [] })
      rootSubjects.push(subjectMap.get(subject.id)!)
    })

    // Second pass: add child subjects from all subjects
    subjects.forEach(subject => {
      if (subject.parent_subject_id && subjectMap.has(subject.parent_subject_id)) {
        const parent = subjectMap.get(subject.parent_subject_id)!
        if (!parent.child_subjects) parent.child_subjects = []
        parent.child_subjects.push({ ...subject, child_subjects: [] })
      }
    })

    return rootSubjects
  }, [orderedParentSubjects, subjects])

  // Helper to move parent subject up/down
  const moveParentSubject = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= orderedParentSubjects.length) return
    
    // Immediately update the UI for instant feedback
    const newOrder = [...orderedParentSubjects]
    const [moved] = newOrder.splice(fromIdx, 1)
    newOrder.splice(toIdx, 0, moved)
    setOrderedParentSubjects(newOrder)
    setMoveAnimationKey(prev => prev + 1)
    
    // Debounce API call
    if (onReorderSubjects) {
      if (reorderTimeoutRef.current) clearTimeout(reorderTimeoutRef.current)
      reorderTimeoutRef.current = setTimeout(() => {
        const subjectOrders = newOrder.map((subject, idx) => ({ id: subject.id, order: idx + 1 }))
        console.log('Calling onReorderSubjects with:', subjectOrders)
        onReorderSubjects(subjectOrders)
      }, 500)
    }
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
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <p className="text-red-600 font-medium">Failed to load subjects</p>
          <p className="text-gray-500 text-sm">Please try again later</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Class Subjects</h3>
          <p className="text-sm text-gray-600">
            Manage subjects and their teachers for this class section
            {reordering && (
              <span className="ml-2 inline-flex items-center text-green-600 font-medium">
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
                Saving changes...
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {onRefetch && (
            <Button
              onClick={onRefetch}
              variant="outline"
              size="sm"
              disabled={loading || reordering}
              className="text-gray-600 hover:text-gray-700"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          )}
          <Button
            onClick={onCreateSubject}
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-white"
            disabled={reordering}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Subject
          </Button>
        </div>
      </div>

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
        <motion.div 
          key={moveAnimationKey} 
          layout 
          className={`space-y-3 transition-all duration-300 ${
            reordering ? 'opacity-95' : 'opacity-100'
          }`}
        >
          {hierarchicalSubjects.map((subject, index) => (
            <div key={subject.id} className="space-y-2">
              {/* Parent Subject */}
              <div className="relative w-full">
                <div className="flex items-center w-full">
                  {/* Up/Down arrows for parent subjects only */}
                  <div className="flex flex-col mr-2">
                    <button
                      className={`p-1 rounded transition-all duration-200 ${
                        index === 0 || reordering 
                          ? 'opacity-30 cursor-not-allowed' 
                          : 'hover:bg-gray-100 hover:scale-110 active:scale-95'
                      }`}
                      onClick={() => moveParentSubject(index, index - 1)}
                      disabled={index === 0 || reordering}
                      aria-label="Move up"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      className={`p-1 rounded transition-all duration-200 ${
                        index === hierarchicalSubjects.length - 1 || reordering 
                          ? 'opacity-30 cursor-not-allowed' 
                          : 'hover:bg-gray-100 hover:scale-110 active:scale-95'
                      }`}
                      onClick={() => moveParentSubject(index, index + 1)}
                      disabled={index === hierarchicalSubjects.length - 1 || reordering}
                      aria-label="Move down"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <SubjectItem 
                      subject={subject} 
                      index={index} 
                      onEditSubject={onEditSubject}
                      onDeleteSubject={onDeleteSubject}
                      isParent={true}
                      expanded={isParentExpanded(subject.id)}
                      onToggleExpand={() => toggleParentExpansion(subject.id)}
                    />
                  </div>
                </div>
              </div>
              {/* Child Subjects */}
              {subject.child_subjects && subject.child_subjects.length > 0 && isParentExpanded(subject.id) && (
                <div className="ml-6 space-y-2">
                  {subject.child_subjects.map((child: Subject, childIndex: number) => (
                    <SubjectItem 
                      key={child.id} 
                      subject={child} 
                      index={childIndex} 
                      isChild={true} 
                      onEditSubject={onEditSubject}
                      onDeleteSubject={onDeleteSubject}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </motion.div>
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