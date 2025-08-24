import React from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { 
  BookOpenIcon, 
  ClockIcon,
  UserGroupIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline'
import type { AssignedSubject } from '../../../types'

interface AssignedSubjectsGridProps {
  assignedSubjects: AssignedSubject[]
  loading: boolean
  error: string | null
  sorting: { field: string; direction: 'asc' | 'desc' }
  onSort: (field: string) => void
}

export const AssignedSubjectsGrid: React.FC<AssignedSubjectsGridProps> = ({
  assignedSubjects,
  loading,
  error,
}) => {
  // Group subjects by class section
  const groupedSubjects = assignedSubjects.reduce((groups, subject) => {
    const sectionKey = subject.class_section?.id || 'no-section'
    const sectionTitle = subject.class_section?.title || 'No Section'
    const gradeLevel = subject.class_section?.grade_level || 'Unknown Grade'
    
    if (!groups[sectionKey]) {
      groups[sectionKey] = {
        sectionId: sectionKey,
        sectionTitle,
        gradeLevel,
        subjects: []
      }
    }
    
    groups[sectionKey].subjects.push(subject)
    return groups
  }, {} as Record<string, {
    sectionId: string
    sectionTitle: string
    gradeLevel: string
    subjects: AssignedSubject[]
  }>)

  // Convert to array and sort by grade level and section title
  const sortedGroups = Object.values(groupedSubjects).sort((a, b) => {
    // First sort by grade level
    const gradeA = parseInt(a.gradeLevel) || 0
    const gradeB = parseInt(b.gradeLevel) || 0
    if (gradeA !== gradeB) return gradeA - gradeB
    
    // Then sort by section title
    return a.sectionTitle.localeCompare(b.sectionTitle)
  })
  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <span className="ml-3 text-gray-600">Loading assigned subjects...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Subjects</h3>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  if (assignedSubjects.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <BookOpenIcon className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Assigned Subjects</h3>
          <p className="text-gray-500 mb-6">You don't have any subjects assigned to you yet.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      {/* Grouped Sections */}
      <div className="space-y-8">
        {sortedGroups.map((group) => (
          <div key={group.sectionId} className="space-y-4">
            {/* Section Header */}
            <div className="border-b border-gray-200 pb-3">
              <h2 className="text-lg font-semibold text-gray-900">
                {group.gradeLevel} - {group.sectionTitle}
              </h2>
              <p className="text-sm text-gray-600">
                {group.subjects.length} subject{group.subjects.length !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Subjects Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {group.subjects.map((subject) => (
                <motion.div
                  key={subject.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="group relative"
                >
                  <Link
                    to={`/assigned-subjects/${subject.id}`}
                    className="block border rounded-lg p-4 transition-all duration-200 hover:shadow-md border-gray-200 bg-white hover:border-gray-300"
                  >
                    {/* Subject Icon */}
                    <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-3">
                      <BookOpenIcon className="w-6 h-6 text-indigo-600" />
                    </div>

                    {/* Subject Info */}
                    <div className="space-y-2">
                      <div>
                        <h3 className="font-semibold text-gray-900 text-sm truncate" title={subject.title}>
                          {subject.title}
                        </h3>
                        {subject.variant && (
                          <p className="text-xs text-gray-500 font-medium">{subject.variant}</p>
                        )}
                      </div>

                      {/* Time */}
                      {subject.start_time && subject.end_time && (
                        <div className="flex items-center text-xs text-gray-600">
                          <ClockIcon className="w-3 h-3 mr-1 flex-shrink-0" />
                          <span>
                            {subject.start_time} - {subject.end_time}
                          </span>
                        </div>
                      )}

                      {/* Student Count */}
                      <div className="flex items-center text-xs text-gray-600">
                        <UserGroupIcon className="w-3 h-3 mr-1 flex-shrink-0" />
                        <span>
                          {subject.student_count || 0} / {subject.total_students || 0} students
                        </span>
                      </div>
                    </div>

                    {/* Arrow indicator */}
                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ChevronRightIcon className="w-4 h-4 text-gray-400" />
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
} 