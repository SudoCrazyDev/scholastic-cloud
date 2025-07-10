import React from 'react'
import { motion } from 'framer-motion'
import { 
  EyeIcon, 
  TrashIcon, 
  UserIcon,
  CalendarIcon,
  AcademicCapIcon,
  CheckCircleIcon,
  XCircleIcon
} from '@heroicons/react/24/outline'
import { Checkbox } from '../../../components/checkbox'
import { Badge } from '../../../components/badge'
import type { Student } from '../../../types'

interface StudentGridProps {
  students: Student[]
  loading: boolean
  error: string | null
  selectedRows: Student[]
  onSelectionChange: (students: Student[]) => void
  onView: (student: Student) => void
  onDelete: (student: Student) => void
}

export const StudentGrid: React.FC<StudentGridProps> = ({
  students,
  loading,
  error,
  selectedRows,
  onSelectionChange,
  onView,
  onDelete,
}) => {
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onSelectionChange(students)
    } else {
      onSelectionChange([])
    }
  }

  const handleSelectStudent = (student: Student, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedRows, student])
    } else {
      onSelectionChange(selectedRows.filter(item => item.id !== student.id))
    }
  }

  const isSelected = (student: Student) => {
    return selectedRows.some(item => item.id === student.id)
  }

  const getFullName = (student: Student) => {
    const parts = [student.first_name, student.middle_name, student.last_name].filter(Boolean)
    const fullName = parts.join(' ')
    return student.ext_name ? `${fullName} ${student.ext_name}` : fullName
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const getGenderColor = (gender: string) => {
    switch (gender) {
      case 'male': return 'blue'
      case 'female': return 'pink'
      default: return 'zinc'
    }
  }

  const getReligionColor = (religion: string) => {
    switch (religion) {
      case 'ISLAM': return 'green'
      case 'CATHOLIC': return 'purple'
      case 'IGLESIA NI CRISTO': return 'blue'
      case 'BAPTISTS': return 'indigo'
      case 'OTHERS': return 'zinc'
      default: return 'zinc'
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <span className="ml-3 text-gray-600">Loading students...</span>
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
          <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Students</h3>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  if (students.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <UserIcon className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Students Found</h3>
          <p className="text-gray-500 mb-6">Get started by creating your first student record.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      {/* Header with select all */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <Checkbox
            checked={selectedRows.length === students.length && students.length > 0}
            onChange={handleSelectAll}
            indeterminate={selectedRows.length > 0 && selectedRows.length < students.length}
          />
          <span className="text-sm text-gray-600">
            {selectedRows.length > 0 
              ? `${selectedRows.length} of ${students.length} selected`
              : `${students.length} students`
            }
          </span>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {students.map((student) => (
          <motion.div
            key={student.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={`relative group border rounded-lg p-4 transition-all duration-200 hover:shadow-md ${
              isSelected(student) 
                ? 'border-indigo-500 bg-indigo-50' 
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            {/* Selection checkbox */}
            <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <Checkbox
                checked={isSelected(student)}
                onChange={(checked) => handleSelectStudent(student, checked)}
              />
            </div>

            {/* Avatar */}
            <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-3 overflow-hidden">
              {student.profile_picture ? (
                <img
                  src={student.profile_picture}
                  alt={`${getFullName(student)} profile`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <UserIcon className="w-6 h-6 text-indigo-600" />
              )}
            </div>

            {/* Student info */}
            <div className="space-y-2">
              <div>
                <h3 className="font-semibold text-gray-900 text-sm truncate" title={getFullName(student)}>
                  {getFullName(student)}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <Badge color={getGenderColor(student.gender)}>
                    {student.gender.charAt(0).toUpperCase() + student.gender.slice(1)}
                  </Badge>
                  <Badge color={getReligionColor(student.religion)}>
                    {student.religion}
                  </Badge>
                </div>
              </div>

              {/* Details */}
              <div className="space-y-1">
                <div className="flex items-center text-xs text-gray-600">
                  <AcademicCapIcon className="w-3 h-3 mr-1 flex-shrink-0" />
                  <span className="truncate" title={student.lrn}>LRN: {student.lrn}</span>
                </div>
                
                <div className="flex items-center text-xs text-gray-600">
                  <CalendarIcon className="w-3 h-3 mr-1 flex-shrink-0" />
                  <span className="truncate">Born {formatDate(student.birthdate)}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-1">
              <button
                onClick={() => onView(student)}
                className="p-1 text-gray-400 hover:text-indigo-600 transition-colors"
                title="View student details"
              >
                <EyeIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => onDelete(student)}
                className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                title="Delete student"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
} 