import React from 'react'
import { motion } from 'framer-motion'
import { BookOpenIcon } from '@heroicons/react/24/outline'
import { SearchInput } from '../../../components/search-input'

interface AssignedSubjectsHeaderProps {
  search: string
  onSearch: (value: string) => void
  totalSubjects: number
}

export const AssignedSubjectsHeader: React.FC<AssignedSubjectsHeaderProps> = ({
  search,
  onSearch,
  totalSubjects,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        {/* Title and Stats */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
            <BookOpenIcon className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Assigned Subjects</h1>
            <p className="text-sm text-gray-600">
              {totalSubjects} subject{totalSubjects !== 1 ? 's' : ''} assigned to you
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="w-full sm:w-80">
          <SearchInput
            placeholder="Search subjects..."
            value={search}
            onChange={onSearch}
          />
        </div>
      </div>
    </motion.div>
  )
} 