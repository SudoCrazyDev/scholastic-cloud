import React, { useState, useEffect } from 'react'
import {
  UserGroupIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  PlusIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  AcademicCapIcon,
  CalendarIcon,
  ArrowDownTrayIcon,
  UserIcon,
  UsersIcon
} from '@heroicons/react/24/outline'
import { Input } from '../../../components/input'
import { AddGradeItemModal } from './AddGradeItemModal'
import { useSubjectEcrItems, useSubjectEcrs } from '../../../hooks/useSubjectEcrItems'
import { useStudents } from '../../../hooks/useStudents'
import { toast } from 'react-hot-toast'
import { ErrorHandler } from '../../../utils/errorHandler'
import { Alert } from '../../../components/alert'

interface StudentScoresTabProps {
  subjectId: string
  classSectionId: string
}

// Types for the grading system
interface GradeItem {
  id: string
  title: string
  date: string
  description: string
  total_score: number
  category: 'Written Works' | 'Performance Tasks' | 'Quarterly Assessment'
  quarter: 'First Quarter' | 'Second Quarter' | 'Third Quarter' | 'Fourth Quarter'
}

interface StudentScore {
  student_id: string
  item_id: string
  score: number
  date_submitted?: string
}

interface Student {
  id: string
  lrn: string
  first_name: string
  middle_name?: string
  last_name: string
  ext_name?: string
  gender: 'male' | 'female' | 'other'
  profile_picture?: string
}

interface ScoreInputProps {
  student: Student
  item: GradeItem
  currentScore: number
  onScoreChange: (studentId: string, itemId: string, score: number) => void
}

const ScoreInput: React.FC<ScoreInputProps> = ({
  student,
  item,
  currentScore,
  onScoreChange
}) => {
  const [score, setScore] = useState(currentScore)

  const handleScoreChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numValue = Number(e.target.value)
    if (numValue >= 0 && numValue <= item.total_score) {
      setScore(numValue)
      onScoreChange(student.id, item.id, numValue)
    }
  }

  const getScoreColor = (score: number, total: number) => {
    const percentage = (score / total) * 100
    if (percentage >= 90) return 'text-green-600'
    if (percentage >= 75) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getScoreBackground = (score: number, total: number) => {
    const percentage = (score / total) * 100
    if (percentage >= 90) return 'bg-green-50 border-green-200'
    if (percentage >= 75) return 'bg-yellow-50 border-yellow-200'
    return 'bg-red-50 border-red-200'
  }

  return (
    <div className="flex items-center justify-between py-3 px-4 bg-white border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
            <span className="text-xs font-medium text-indigo-600">
              {student.first_name.charAt(0)}{student.last_name.charAt(0)}
            </span>
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-medium text-gray-900 truncate">
              {student.first_name} {student.last_name}
            </h4>
            <p className="text-xs text-gray-500">LRN: {student.lrn}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-3">
        <div className={`text-sm font-medium ${getScoreColor(score, item.total_score)}`}>
          <span>{score}</span>
          <span className="text-gray-400">/{item.total_score}</span>
        </div>

        <div className="w-24">
          <Input
            type="number"
            min="0"
            max={item.total_score}
            value={score}
                         onChange={handleScoreChange}
            size="sm"
            className="text-center"
            variant="outlined"
          />
        </div>
      </div>
    </div>
  )
}

interface StudentGroupProps {
  gender: 'male' | 'female' | 'other'
  students: Student[]
  item: GradeItem
  scores: StudentScore[]
  onScoreChange: (studentId: string, itemId: string, score: number) => void
}

const StudentGroup: React.FC<StudentGroupProps> = ({
  gender,
  students,
  item,
  scores,
  onScoreChange
}) => {
  const [isExpanded, setIsExpanded] = useState(true)

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

  const getGenderColor = (gender: string) => {
    switch (gender) {
      case 'male':
        return 'bg-blue-50 border-blue-200'
      case 'female':
        return 'bg-pink-50 border-pink-200'
      default:
        return 'bg-gray-50 border-gray-200'
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
    <div className={`rounded-lg border ${getGenderColor(gender)}`}>
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-3">
          {getGenderIcon(gender)}
          <div>
            <h3 className="text-sm font-medium text-gray-900">{getGenderText(gender)}</h3>
            <p className="text-xs text-gray-500">{students.length} students</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <div className="text-xs text-gray-500">
            {isExpanded ? 'Collapse' : 'Expand'}
          </div>
          {isExpanded ? (
            <ChevronDownIcon className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRightIcon className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-gray-200 bg-white rounded-b-lg">
          {students.map((student) => {
            const score = scores.find(s => s.student_id === student.id && s.item_id === item.id)?.score || 0

            return (
              <ScoreInput
                key={`${student.id}-${item.id}`}
                student={student}
                item={item}
                currentScore={score}
                onScoreChange={onScoreChange}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

interface GradeItemSectionProps {
  item: GradeItem
  students: Student[]
  scores: StudentScore[]
  onScoreChange: (studentId: string, itemId: string, score: number) => void
}

const GradeItemSection: React.FC<GradeItemSectionProps> = ({
  item,
  students,
  scores,
  onScoreChange
}) => {
  const [isExpanded, setIsExpanded] = useState(false)

  // Group students by gender and sort alphabetically
  const groupedStudents = students.reduce((groups, student) => {
    const gender = student.gender
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
    <div className={`rounded-lg border ${getCategoryColor(item.category)}`}>
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
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
              <span className="text-xs text-gray-500">{item.category}</span>
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
              Max: {item.total_score} pts
            </div>
          </div>
          {isExpanded ? (
            <ChevronDownIcon className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRightIcon className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-gray-200 bg-white rounded-b-lg p-4 space-y-4">
          {Object.entries(groupedStudents).map(([gender, studentsInGroup]) => (
            <StudentGroup
              key={gender}
              gender={gender as 'male' | 'female' | 'other'}
              students={studentsInGroup}
              item={item}
              scores={scores}
              onScoreChange={onScoreChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export const StudentScoresTab: React.FC<StudentScoresTabProps> = ({ subjectId, classSectionId }) => {
  // Fetch students
  const { students, loading: studentsLoading, error: studentsError } = useStudents({ class_section_id: classSectionId })
  // Fetch all subject_ecr for this subject
  const { data: subjectEcrsData, isLoading: subjectEcrsLoading, error: subjectEcrsError } = useSubjectEcrs(subjectId)
  // Extract all subject_ecr_id
  const subjectEcrIds = subjectEcrsData?.data?.map((ecr: any) => ecr.id) || []
  // Fetch grade items for all subject_ecr_id
  const { data: gradeItemsData, isLoading: gradeItemsLoading, error: gradeItemsError, refetch: refetchGradeItems } = useSubjectEcrItems(subjectEcrIds.length > 0 ? { subject_ecr_id: subjectEcrIds } : undefined)
  // TODO: Fetch scores from API (implement useStudentScores hook or similar)

  const [scores, setScores] = useState<StudentScore[]>([])
  const [activeQuarter, setActiveQuarter] = useState<string>('All')
  const [activeCategory, setActiveCategory] = useState<string>('All')
  const [showAddModal, setShowAddModal] = useState(false)
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Add a stub for handleScoreChange for now
  const handleScoreChange = (studentId: string, itemId: string, score: number) => {
    // TODO: Implement score update API call
    setScores(prev => {
      const existingIndex = prev.findIndex(s => s.student_id === studentId && s.item_id === itemId)
      if (existingIndex >= 0) {
        const newScores = [...prev]
        newScores[existingIndex] = { ...newScores[existingIndex], score }
        return newScores
      } else {
        return [...prev, { student_id: studentId, item_id: itemId, score }]
      }
    })
  }

  // Handle errors
  useEffect(() => {
    if (studentsError) {
      setAlert({ type: 'error', message: ErrorHandler.handle(studentsError).message })
    } else if (gradeItemsError) {
      setAlert({ type: 'error', message: ErrorHandler.handle(gradeItemsError).message })
    } else if (subjectEcrsError) {
      setAlert({ type: 'error', message: ErrorHandler.handle(subjectEcrsError).message })
    } else {
      setAlert(null)
    }
  }, [studentsError, gradeItemsError, subjectEcrsError])

  // Handle add grade item success
  const handleGradeItemSuccess = () => {
    toast.success('Grade item created successfully!')
    refetchGradeItems()
  }

  // Handle save all scores (TODO: implement real API call)
  const handleSaveAllScores = async () => {
    try {
      // TODO: Call API to save all scores
      toast.success('Scores saved successfully!')
    } catch (error) {
      const err = ErrorHandler.handle(error)
      toast.error(err.message)
    }
  }

  // Filtered items
  const quarters = ['1', '2', '3', '4']
  const categories = ['All', 'Written Works', 'Performance Tasks', 'Quarterly Assessment']
  const gradeItems = gradeItemsData?.data || []
  const filteredItems = gradeItems.filter((item: GradeItem) => {
    const quarterMatch = activeQuarter === 'All' || item.quarter === activeQuarter
    const categoryMatch = activeCategory === 'All' || item.category === activeCategory
    return quarterMatch
  })

  // Calculate statistics
  const totalStudents = students.length
  const totalItems = filteredItems.length
  const totalScores = scores.length
  const completionRate = totalItems > 0 ? Math.round((totalScores / (totalStudents * totalItems)) * 100) : 0

  // Gender distribution
  const genderDistribution = students.reduce((acc: any, student: any) => {
    acc[student.gender] = (acc[student.gender] || 0) + 1
    return acc
  }, {})

  if (studentsLoading || gradeItemsLoading || subjectEcrsLoading) {
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
          <p className="text-sm text-gray-500">Manage grades for {students.length} students</p>
        </div>
        <div className="flex items-center space-x-4">
          <button
            onClick={handleSaveAllScores}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
          >
            <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
            Save All Scores
          </button>
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

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Quarter Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Quarter</label>
            <select
              value={activeQuarter}
              onChange={(e) => setActiveQuarter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="All">All Quarters</option>
              {quarters.map(quarter => (
                <option key={quarter} value={quarter}>{quarter}</option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
            <select
              value={activeCategory}
              onChange={(e) => setActiveCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Grading System Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-900 mb-2">Grading System</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-blue-800">
          <div>
            <span className="font-medium">Written Works:</span> 30% of Quarter Grade
          </div>
          <div>
            <span className="font-medium">Performance Tasks:</span> 50% of Quarter Grade
          </div>
          <div>
            <span className="font-medium">Quarterly Assessment:</span> 20% of Quarter Grade
          </div>
        </div>
      </div>

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
              students={students}
              scores={scores}
              onScoreChange={handleScoreChange}
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
    </div>
  )
} 