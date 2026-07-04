import React from 'react'
import { motion } from 'framer-motion'
import { BookOpenIcon, FunnelIcon } from '@heroicons/react/24/outline'
import { SearchInput } from '../../../components/search-input'

interface SectionOption {
  id: string
  title: string
  gradeLevel: string
}

interface AssignedSubjectsHeaderProps {
  search: string
  onSearch: (value: string) => void
  totalSubjects: number
  sections: SectionOption[]
  sectionFilter: string
  onSectionFilter: (sectionId: string) => void
  isInstitutionOverview: boolean
}

export const AssignedSubjectsHeader: React.FC<AssignedSubjectsHeaderProps> = ({
  search,
  onSearch,
  totalSubjects,
  sections,
  sectionFilter,
  onSectionFilter,
  isInstitutionOverview,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
    >
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
        {/* Title and Stats */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
            <BookOpenIcon className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isInstitutionOverview ? 'Subjects' : 'My Assigned Subjects'}
            </h1>
            <p className="text-sm text-gray-600">
              {isInstitutionOverview
                ? `${totalSubjects} subject${totalSubjects !== 1 ? 's' : ''} across ${sections.length} section${sections.length !== 1 ? 's' : ''}`
                : `${totalSubjects} subject${totalSubjects !== 1 ? 's' : ''} assigned to you`}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          {/* Section Filter */}
          <div className="relative">
            <FunnelIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={sectionFilter}
              onChange={(e) => onSectionFilter(e.target.value)}
              className="w-full sm:w-56 pl-9 pr-8 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              aria-label="Filter by section"
            >
              <option value="all">All Sections</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.gradeLevel ? `${section.gradeLevel} - ${section.title}` : section.title}
                </option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div className="w-full sm:w-72">
            <SearchInput
              placeholder="Search by subject or section..."
              value={search}
              onChange={onSearch}
            />
          </div>
        </div>
      </div>
    </motion.div>
  )
}
