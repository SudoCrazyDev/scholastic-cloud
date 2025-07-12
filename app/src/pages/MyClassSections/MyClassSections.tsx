import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useMyClassSections } from '../../hooks/useMyClassSections'
import { useAuth } from '../../hooks/useAuth'
import { Alert } from '../../components/alert'
import { Button } from '../../components/button'
import { Input } from '../../components/input'
import { Badge } from '../../components/badge'
import { 
  Search, 
  Users, 
  BookOpen, 
  Calendar,
  Building2,
  User,
  ArrowRight,
  Loader2
} from 'lucide-react'
import type { ClassSection } from '../../types'

const MyClassSections: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [searchValue, setSearchValue] = useState('')
  
  const {
    classSections,
    loading,
    error,
    refetch,
  } = useMyClassSections({
    search: searchValue,
    per_page: 50,
  })

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(e.target.value)
  }

  const handleClassSectionClick = (classSection: ClassSection) => {
    navigate(`/my-class-sections/${classSection.id}`)
  }

  const getFullName = (user: any) => {
    const parts = [user?.first_name, user?.middle_name, user?.last_name, user?.ext_name]
    return parts.filter(Boolean).join(' ')
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-6"
      >
        <Alert
          type="error"
          title="Error Loading Class Sections"
          message={error.message || 'Failed to load your class sections. Please try again.'}
          show={true}
        />
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Class Sections</h1>
          <p className="text-gray-600 mt-1">
            Manage and view your assigned class sections
          </p>
        </div>
        <Button
          onClick={() => refetch()}
          disabled={loading}
          variant="outline"
          size="sm"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            'Refresh'
          )}
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          type="text"
          placeholder="Search class sections..."
          value={searchValue}
          onChange={handleSearchChange}
          className="pl-10"
        />
      </div>

      {/* Loading State */}
      {loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-center py-12"
        >
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </motion.div>
      )}

      {/* Class Sections Grid */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {classSections.map((classSection: ClassSection, index: number) => (
            <motion.div
              key={classSection.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
              className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-all duration-200 cursor-pointer group"
              onClick={() => handleClassSectionClick(classSection)}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
                    {classSection.title}
                  </h3>
                  <Badge color="indigo" className="mt-2">
                    {classSection.grade_level}
                  </Badge>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-indigo-600 transition-colors" />
              </div>

              <div className="space-y-3">
                {classSection.academic_year && (
                  <div className="flex items-center text-sm text-gray-600">
                    <Calendar className="w-4 h-4 mr-2" />
                    <span>{classSection.academic_year}</span>
                  </div>
                )}

                {classSection.adviser && (
                  <div className="flex items-center text-sm text-gray-600">
                    <User className="w-4 h-4 mr-2" />
                    <span>Adviser: {getFullName(classSection.adviser)}</span>
                  </div>
                )}

                {/* Students count will be shown in the detail view */}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && classSections.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12"
        >
          <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No class sections found
          </h3>
          <p className="text-gray-600">
            {searchValue 
              ? 'No class sections match your search criteria.'
              : 'You haven\'t been assigned to any class sections yet.'
            }
          </p>
        </motion.div>
      )}
    </motion.div>
  )
}

export default MyClassSections 