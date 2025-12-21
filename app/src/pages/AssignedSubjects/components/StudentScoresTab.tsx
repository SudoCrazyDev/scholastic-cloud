import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  UserGroupIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  PlusIcon,
  AcademicCapIcon,
  CalendarIcon,
  UserIcon,
  UsersIcon,
  PencilIcon,
  XMarkIcon
} from '@heroicons/react/24/outline'
import { AddGradeItemModal } from './AddGradeItemModal'
import { EditGradeItemModal } from './EditGradeItemModal'
import { useSubjectEcrItems, useSubjectEcrs } from '../../../hooks/useSubjectEcrItems'
import { useStudents } from '../../../hooks/useStudents'
import { useStudentScores } from '../../../hooks/useStudentScores'
import { toast } from 'react-hot-toast'
import { ErrorHandler } from '../../../utils/errorHandler'
import { Alert } from '../../../components/alert'
import { StudentScoreInput } from './StudentScoreInput'
import type { Student } from '../../../types'


interface StudentScoresTabProps {
  subjectId: string
  classSectionId: string
  isLimited?: boolean
  assignedStudentIds?: string[]
}

interface StudentScore {
  id?: string
  student_id: string
  subject_ecr_item_id: string
  score: number
  date_submitted?: string
  created_at?: string
  updated_at?: string
  student?: Student
  academic_year?: string
  subjectEcrItem?: any
}

// Types for the grading system
interface GradeItem {
  id: string
  title: string
  date: string
  description: string
  score: number
  category: 'Written Works' | 'Performance Tasks' | 'Quarterly Assessment'
  quarter: 'First Quarter' | 'Second Quarter' | 'Third Quarter' | 'Fourth Quarter'
  subject_ecr: {
    id: string
    title: string
  }
}




interface StudentGroupProps {
  gender: 'male' | 'female' | 'other'
  students: Student[]
  item: GradeItem
  scores: StudentScore[]
}

const StudentGroup: React.FC<StudentGroupProps> = ({
  gender,
  students,
  item,
  scores,
}) => {
  const getGenderIcon = (gender: string) => {
    switch (gender) {
      case 'male':
        return <UserIcon className="w-4 h-4 text-blue-600" />
      case 'female':
        return <UsersIcon className="w-4 h-4 text-pink-600" />
      default:
        return <UserGroupIcon className="w-4 h-4 text-gray-600" />
    }
  }

  const getGenderText = (gender: string) => {
    switch (gender) {
      case 'male':
        return 'Male Students'
      case 'female':
        return 'Female Students'
      default:
        return 'Other Students'
    }
  }

  return (
    <div className="space-y-2">
      {/* Gender Header */}
      <div className="flex items-center space-x-2 mb-3">
        {getGenderIcon(gender)}
        <h3 className="text-sm font-semibold text-gray-900">{getGenderText(gender)}</h3>
        <span className="text-xs text-gray-500">({students.length})</span>
      </div>

      {/* Students List - Always visible, no collapse */}
      <div className="space-y-2">
        {students.map((student, index) => {
          const scoreObj = scores.find(s => s.student_id === student.id && s.subject_ecr_item_id === item.id)
          const inputId = `score-input-${student.id}-${item.id}`
          const nextInputId = index < students.length - 1 
            ? `score-input-${students[index + 1].id}-${item.id}`
            : null
          
          return (
            <div 
              key={`${student.id}-${item.id}`} 
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 sm:w-8 sm:h-8 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-xs sm:text-xs font-medium text-indigo-600">
                      {student.first_name.charAt(0)}{student.last_name.charAt(0)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm sm:text-base font-medium text-gray-900 truncate">
                      {student.first_name} {student.last_name}
                    </h4>
                    <p className="text-xs text-gray-500">LRN: {student.lrn || 'N/A'}</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4">
                <div className="text-sm sm:text-base font-medium whitespace-nowrap">
                  <span>{scoreObj?.score ?? '-'}</span>
                  <span className="text-gray-400">/{item.score}</span>
                </div>
                <div className="w-24 sm:w-28">
                  <StudentScoreInput
                    studentId={student.id}
                    itemId={item.id}
                    maxScore={item.score}
                    initialScore={scoreObj?.score}
                    scoreId={scoreObj?.id}
                    inputId={inputId}
                    onEnterPress={() => {
                      // Move focus to next input
                      if (nextInputId) {
                        setTimeout(() => {
                          const nextInput = document.querySelector(`input[data-input-id="${nextInputId}"]`) as HTMLInputElement
                          if (nextInput) {
                            nextInput.focus()
                            nextInput.select()
                          }
                        }, 100)
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface GradeItemSectionProps {
  item: GradeItem
  students: Student[]
  scores: StudentScore[]
  onEditItem: (item: any) => void
}

const GradeItemSection: React.FC<GradeItemSectionProps> = ({
  item,
  students,
  scores,
  onEditItem,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Group students by gender and sort alphabetically
  const groupedStudents = students.reduce((groups, student) => {
    const gender = student.gender || 'other'
    if (!groups[gender]) {
      groups[gender] = []
    }
    groups[gender].push(student)
    return groups
  }, {} as Record<string, Student[]>)

  // Sort students by last name within each group
  Object.keys(groupedStudents).forEach(gender => {
    groupedStudents[gender].sort((a, b) => {
      const lastNameA = a.last_name.toLowerCase()
      const lastNameB = b.last_name.toLowerCase()
      return lastNameA.localeCompare(lastNameB)
    })
  })

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Written Works':
        return <DocumentTextIcon className="w-4 h-4 text-blue-600" />
      case 'Performance Tasks':
        return <AcademicCapIcon className="w-4 h-4 text-green-600" />
      case 'Quarterly Assessment':
        return <UserGroupIcon className="w-4 h-4 text-purple-600" />
      default:
        return <DocumentTextIcon className="w-4 h-4 text-gray-600" />
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Written Works':
        return 'bg-blue-50 border-blue-200'
      case 'Performance Tasks':
        return 'bg-green-50 border-green-200'
      case 'Quarterly Assessment':
        return 'bg-purple-50 border-purple-200'
      default:
        return 'bg-gray-50 border-gray-200'
    }
  }

  return (
    <>
      <div className={`rounded-lg border ${getCategoryColor(item.category)}`}>
        <div
          className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/50 transition-colors"
          onClick={() => setIsModalOpen(true)}
        >
          <div className="flex items-center space-x-3">
            {getCategoryIcon(item.category)}
            <div>
              <h3 className="text-sm font-medium text-gray-900">{item.title}</h3>
              <p className="text-xs text-gray-500">{item.description}</p>
              <div className="flex items-center space-x-2 mt-1">
                <CalendarIcon className="w-3 h-3 text-gray-400" />
                <span className="text-xs text-gray-500">{new Date(item.date).toLocaleDateString()}</span>
                <span className="text-xs text-gray-400">•</span>
                <span className="text-xs text-gray-500">{item.subject_ecr?.title || item.category}</span>
                <span className="text-xs text-gray-400">•</span>
                <span className="text-xs text-gray-500">{item.quarter}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="text-right">
              <div className="text-sm font-medium text-gray-900">
                {students.length} students
              </div>
              <div className="text-xs text-gray-500">
                Max: {item.score} pts
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onEditItem(item)
              }}
              className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
              title="Edit grade item"
            >
              <PencilIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Full Screen Modal - Optimized for Mobile and Tablet */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex min-h-full items-start sm:items-center justify-center p-0 sm:p-4">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-gray-900 bg-opacity-75 transition-opacity"
                onClick={() => setIsModalOpen(false)}
              />

              {/* Modal - Full screen on mobile, centered on tablet/desktop */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="relative transform overflow-hidden bg-white shadow-xl transition-all w-full h-full sm:h-auto sm:max-h-[90vh] sm:rounded-lg sm:w-full sm:max-w-4xl flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header - Only Close Button */}
                <div className="flex items-center justify-end p-4 sm:p-6 border-b border-gray-200">
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 p-2"
                    aria-label="Close"
                  >
                    <XMarkIcon className="w-6 h-6" />
                  </button>
                </div>

                {/* Student List - Centered, Optimized for Mobile */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                  <div className="max-w-3xl mx-auto space-y-6">
                    {Object.entries(groupedStudents).map(([gender, studentsInGroup]) => (
                      <StudentGroup
                        key={gender}
                        gender={gender as 'male' | 'female' | 'other'}
                        students={studentsInGroup}
                        item={item}
                        scores={scores}
                      />
                    ))}
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}

export const StudentScoresTab: React.FC<StudentScoresTabProps> = ({ subjectId, classSectionId, isLimited = false, assignedStudentIds = [] }) => {
  // Fetch students
  const { students, loading: studentsLoading, error: studentsError } = useStudents({ class_section_id: classSectionId })
  // Filter students if limited
  const filteredStudents = isLimited && assignedStudentIds.length > 0
    ? students.filter(s => assignedStudentIds.includes(s.id))
    : (isLimited ? [] : students)
  // Fetch all subject_ecr for this subject
  const { data: subjectEcrsData, isLoading: subjectEcrsLoading, error: subjectEcrsError } = useSubjectEcrs(subjectId)
  // Extract all subject_ecr_id
  const subjectEcrIds = subjectEcrsData?.data?.map((ecr: any) => ecr.id) || []
  // Fetch grade items for all subject_ecr_id
  const { data: gradeItemsData, isLoading: gradeItemsLoading, error: gradeItemsError, refetch: refetchGradeItems } = useSubjectEcrItems(
    subjectEcrIds.length > 0 ? { subject_ecr_id: subjectEcrIds } : undefined
  )
  // Fetch scores for all students and items
  const { data: studentScoresData, isLoading: scoresLoading, error: scoresError, refetch: refetchScores } = useStudentScores({ subjectId, classSectionId })

  // Reset filters and refetch data when subject changes
  useEffect(() => {
    setActiveQuarter('All')
    // Force refetch when subject changes
    if (subjectId && classSectionId) {
      refetchGradeItems()
      refetchScores()
    }
  }, [subjectId, classSectionId, refetchGradeItems, refetchScores])

  const [activeQuarter, setActiveQuarter] = useState<string>('All')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedGradeItem, setSelectedGradeItem] = useState<any>(null)
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Handle errors
  useEffect(() => {
    if (studentsError) {
      setAlert({ type: 'error', message: ErrorHandler.handle(studentsError).message })
    } else if (gradeItemsError) {
      setAlert({ type: 'error', message: ErrorHandler.handle(gradeItemsError).message })
    } else if (subjectEcrsError) {
      setAlert({ type: 'error', message: ErrorHandler.handle(subjectEcrsError).message })
    } else if (scoresError) {
      setAlert({ type: 'error', message: ErrorHandler.handle(scoresError).message })
    } else {
      setAlert(null)
    }
  }, [studentsError, gradeItemsError, subjectEcrsError, scoresError])

  // Handle add grade item success
  const handleGradeItemSuccess = () => {
    toast.success('Grade item created successfully!')
    refetchGradeItems()
  }

  // Handle edit grade item
  const handleEditGradeItem = (item: any) => {
    setSelectedGradeItem(item)
    setShowEditModal(true)
  }

  // Handle edit grade item success
  const handleEditGradeItemSuccess = () => {
    toast.success('Grade item updated successfully!')
    refetchGradeItems()
  }

  // Filtered items
  const quarters = ['1', '2', '3', '4']
  
  // Only process grade items if we have valid subject ECR IDs for this subject
  // This ensures we don't show items from other subjects
  const gradeItems = (subjectEcrIds.length > 0 && gradeItemsData?.data) ? gradeItemsData.data : []
  
  const filteredItems = gradeItems.filter((item: GradeItem) => {
    // Ensure the item belongs to one of the current subject's ECRs
    // Check both the relationship and direct property to handle different data structures
    const itemEcrId = item.subject_ecr?.id || (item as any).subject_ecr_id
    if (!itemEcrId) {
      return false // Don't show items without a valid ECR ID
    }
    
    // Only show items that belong to the current subject's ECRs
    const belongsToSubject = subjectEcrIds.includes(itemEcrId)
    if (!belongsToSubject) {
      return false
    }
    
    // Apply quarter filter
    const quarterMatch = activeQuarter === 'All' || item.quarter === activeQuarter
    return quarterMatch
  })
  
  // Calculate statistics
  const totalStudents = filteredStudents.length
  const totalItems = filteredItems.length
  const totalScores = studentScoresData?.data?.length || 0
  const completionRate = totalItems > 0 ? Math.round((totalScores / (totalStudents * totalItems)) * 100) : 0

  // Gender distribution
  const genderDistribution = filteredStudents.reduce((acc: any, student: any) => {
    const gender = student.gender || 'other'
    acc[gender] = (acc[gender] || 0) + 1
    return acc
  }, {})

  if (studentsLoading || gradeItemsLoading || subjectEcrsLoading || scoresLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {alert && (
        <Alert
          type={alert.type}
          message={alert.message}
          onClose={() => setAlert(null)}
          show={true}
        />
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold text-gray-900">Student Scores</h3>
          <p className="text-sm text-gray-500">Manage grades for {filteredStudents.length} students</p>
        </div>
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
          >
            <PlusIcon className="w-4 h-4 mr-2" />
            Add Grade Item
          </button>
        </div>
      </div>

      {/* Student Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <UserGroupIcon className="w-4 h-4 text-blue-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Total Students</p>
              <p className="text-lg font-semibold text-gray-900">{totalStudents}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
              <DocumentTextIcon className="w-4 h-4 text-green-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Grade Items</p>
              <p className="text-lg font-semibold text-gray-900">{totalItems}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
              <CheckCircleIcon className="w-4 h-4 text-yellow-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Scores Entered</p>
              <p className="text-lg font-semibold text-gray-900">{totalScores}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
              <AcademicCapIcon className="w-4 h-4 text-purple-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Completion</p>
              <p className="text-lg font-semibold text-gray-900">{completionRate}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Gender Distribution */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h4 className="text-sm font-medium text-gray-900 mb-3">Student Distribution</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center space-x-3 p-3 bg-blue-50 rounded-lg">
            <UserIcon className="w-5 h-5 text-blue-600" />
            <div>
              <p className="text-sm font-medium text-blue-900">Male Students</p>
              <p className="text-lg font-semibold text-blue-700">{genderDistribution.male || 0}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3 p-3 bg-pink-50 rounded-lg">
            <UsersIcon className="w-5 h-5 text-pink-600" />
            <div>
              <p className="text-sm font-medium text-pink-900">Female Students</p>
              <p className="text-lg font-semibold text-pink-700">{genderDistribution.female || 0}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
            <UserGroupIcon className="w-5 h-5 text-gray-600" />
            <div>
              <p className="text-sm font-medium text-gray-900">Other Students</p>
              <p className="text-lg font-semibold text-gray-700">{genderDistribution.other || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quarter Tabs */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-4" aria-label="Quarters">
            {['All', ...quarters].map((quarter) => {
              const quarterLabel = quarter === 'All' ? 'All Quarters' : `Quarter ${quarter}`
              return (
                <button
                  key={quarter}
                  onClick={() => setActiveQuarter(quarter)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeQuarter === quarter
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {quarterLabel}
                </button>
              )
            })}
          </nav>
        </div>
      </div>

      {/* Components of Summative Assessment Info */}
      {subjectEcrsData?.data && subjectEcrsData.data.length > 0 ? (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-blue-900 mb-2">Components of Summative Assessment</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-blue-800">
            {subjectEcrsData.data.map((component: any) => (
              <div key={component.id}>
                <span className="font-medium">{component.title}:</span> {component.percentage}% of Quarter Grade
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-yellow-900 mb-2">Components of Summative Assessment</h4>
          <p className="text-sm text-yellow-800">
            No components of summative assessment have been created yet. Please create the assessment components first.
          </p>
        </div>
      )}

      {/* Grade Items */}
      <div className="space-y-4">
        {filteredItems.length === 0 ? (
          <div className="text-center py-12">
            <DocumentTextIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Grade Items Found</h3>
            <p className="text-gray-500">No grade items match the current filters.</p>
          </div>
        ) : (
          filteredItems.map((item: any) => (
            <GradeItemSection
              key={item.id}
              item={item}
              students={filteredStudents}
              scores={studentScoresData?.data || []}
              onEditItem={handleEditGradeItem}
            />
          ))
        )}
      </div>

      {/* Add Grade Item Modal */}
      <AddGradeItemModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        subjectId={subjectId}
        onSuccess={handleGradeItemSuccess}
      />

      {/* Edit Grade Item Modal */}
      <EditGradeItemModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false)
          setSelectedGradeItem(null)
        }}
        subjectId={subjectId}
        onSuccess={handleEditGradeItemSuccess}
        gradeItem={selectedGradeItem}
      />
    </div>
  )
} 