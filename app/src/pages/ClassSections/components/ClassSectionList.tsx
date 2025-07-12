import React from 'react'
import { motion } from 'framer-motion'
import { 
  PencilIcon, 
  TrashIcon, 
  MagnifyingGlassIcon,
  AcademicCapIcon
} from '@heroicons/react/24/outline'
import { Select } from '../../../components/select'
import { Input } from '../../../components/input'
import type { ClassSection } from '../../../types'

interface ClassSectionListProps {
  classSections: ClassSection[]
  selectedClassSection: ClassSection | null
  gradeFilter: string
  searchTerm: string
  gradeLevels: string[]
  onGradeFilterChange: (grade: string) => void
  onSearchChange: (search: string) => void
  onSelectClassSection: (classSection: ClassSection) => void
  onEdit: (classSection: ClassSection) => void
  onDelete: (classSection: ClassSection) => void
  loading?: boolean
}

export const ClassSectionList: React.FC<ClassSectionListProps> = ({
  classSections,
  selectedClassSection,
  gradeFilter,
  searchTerm,
  gradeLevels,
  onGradeFilterChange,
  onSearchChange,
  onSelectClassSection,
  onEdit,
  onDelete,
  loading = false,
}) => {
  // Convert grade levels to SelectOption format
  const gradeOptions = [
    { value: '', label: 'All Grade Levels' },
    ...gradeLevels.map(grade => ({ value: grade, label: grade }))
  ]

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Class Sections</h2>
        
        {/* Filters */}
        <div className="space-y-4">
          {/* Grade Level Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Filter by Grade Level
            </label>
            <Select
              value={gradeFilter}
              onChange={(e) => onGradeFilterChange(e.target.value)}
              options={gradeOptions}
            />
          </div>

          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search Sections
            </label>
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search by title or adviser..."
                className="pl-10"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Class Sections List */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-3"></div>
            <p className="text-gray-500">Loading class sections...</p>
          </div>
        ) : classSections.length === 0 ? (
          <div className="text-center py-8">
            <AcademicCapIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No class sections found</p>
          </div>
        ) : (
          classSections.map((classSection) => (
            <motion.div
              key={classSection.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`group relative p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 hover:shadow-md ${
                selectedClassSection?.id === classSection.id
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
              onClick={() => onSelectClassSection(classSection)}
            >
              {/* Main Content */}
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-2">
                    <AcademicCapIcon className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                    <h3 className="font-semibold text-gray-900 truncate">
                      {classSection.title}
                    </h3>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex items-center text-sm text-gray-600">
                      <span className="font-medium">Grade:</span>
                      <span className="ml-1">{classSection.grade_level}</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                      <span className="font-medium">Adviser:</span>
                      <span className="ml-1 truncate">{classSection.adviser ? `${classSection.adviser?.last_name}, ${classSection.adviser?.first_name}` : 'Unassigned'}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity ml-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onEdit(classSection)
                    }}
                    className="p-1.5 text-gray-400 hover:text-indigo-600 transition-colors rounded"
                    title="Edit class section"
                  >
                    <PencilIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(classSection)
                    }}
                    className="p-1.5 text-gray-400 hover:text-red-600 transition-colors rounded"
                    title="Delete class section"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Selection indicator */}
              {selectedClassSection?.id === classSection.id && (
                <div className="absolute top-2 right-2 w-3 h-3 bg-indigo-600 rounded-full"></div>
              )}
            </motion.div>
          ))
        )}
      </div>
    </div>
  )
} 