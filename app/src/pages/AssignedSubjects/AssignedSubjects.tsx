import React from 'react'
import { motion } from 'framer-motion'
import { AssignedSubjectsHeader, AssignedSubjectsGrid } from './components'
import { useAssignedSubjects } from '@hooks'

const AssignedSubjects: React.FC = () => {
  const {
    // Data
    assignedSubjects,
    sections,
    loading,
    error,
    search,
    sectionFilter,
    sorting,
    isInstitutionOverview,

    // Actions
    handleSearch,
    handleSectionFilter,
    handleSort,
  } = useAssignedSubjects()

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Header */}
      <AssignedSubjectsHeader
        search={search}
        onSearch={handleSearch}
        totalSubjects={assignedSubjects.length}
        sections={sections}
        sectionFilter={sectionFilter}
        onSectionFilter={handleSectionFilter}
        isInstitutionOverview={isInstitutionOverview}
      />

      {/* Grid */}
      <AssignedSubjectsGrid
        assignedSubjects={assignedSubjects}
        loading={loading}
        error={error}
        sorting={sorting}
        onSort={handleSort}
        isInstitutionOverview={isInstitutionOverview}
      />
    </motion.div>
  )
}

export default AssignedSubjects 