import React from 'react'
import { motion } from 'framer-motion'
import { AssignedSubjectsHeader, AssignedSubjectsGrid } from './components'
import { useAssignedSubjects } from '@hooks'

const AssignedSubjects: React.FC = () => {
  const {
    // Data
    assignedSubjects,
    loading,
    error,
    search,
    sorting,

    // Actions
    handleSearch,
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
      />

      {/* Grid */}
      <AssignedSubjectsGrid
        assignedSubjects={assignedSubjects}
        loading={loading}
        error={error}
        sorting={sorting}
        onSort={handleSort}
      />
    </motion.div>
  )
}

export default AssignedSubjects 