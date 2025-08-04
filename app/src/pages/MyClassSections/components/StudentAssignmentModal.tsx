import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XMarkIcon, UserIcon, CheckIcon, UsersIcon } from '@heroicons/react/24/outline'
import { Formik, Form, Field } from 'formik'
import * as Yup from 'yup'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../../components/button'
import { Alert } from '../../../components/alert'
import { Badge } from '../../../components/badge'
import { SearchInput } from '../../../components/search-input'
import { studentService } from '../../../services/studentService'
import type { Student, ClassSection } from '../../../types'

interface StudentAssignmentModalProps {
  isOpen: boolean
  onClose: () => void
  classSection: ClassSection
  onSuccess?: () => void
}

interface AssignmentFormValues {
  academic_year: string
}

// Validation schema
const assignmentValidationSchema = Yup.object({
  academic_year: Yup.string().required('Academic year is required'),
})

export function StudentAssignmentModal({ 
  isOpen, 
  onClose, 
  classSection,
  onSuccess 
}: StudentAssignmentModalProps) {
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set())
  const [showAlert, setShowAlert] = useState(false)
  const [alertMessage, setAlertMessage] = useState('')
  const [alertType, setAlertType] = useState<'success' | 'error'>('success')

  // Search students query
  const {
    data: searchResults,
    isLoading: searchLoading,
    error: searchError,
  } = useQuery({
    queryKey: ['students-search-assignment', searchTerm, classSection.id],
    queryFn: () => studentService.searchStudentsForAssignment({
      search: searchTerm,
      per_page: 20,
      exclude_section_id: classSection.id
    }),
    enabled: !!searchTerm && searchTerm.length >= 2,
    staleTime: 30000, // 30 seconds
  })

  // Assignment mutation
  const assignmentMutation = useMutation({
    mutationFn: (data: { student_ids: string[]; section_id: string; academic_year: string }) =>
      studentService.assignStudentsToSection(data),
    onSuccess: (data) => {
      setAlertMessage(data.message || 'Students assigned successfully!')
      setAlertType('success')
      setShowAlert(true)
      
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['students-by-section', classSection.id] })
      queryClient.invalidateQueries({ queryKey: ['class-section', classSection.id] })
      
      // Reset form
      setSelectedStudents(new Set())
      
      // Call success callback
      if (onSuccess) {
        onSuccess()
      }
      
      // Close modal after delay
      setTimeout(() => {
        onClose()
      }, 2000)
    },
    onError: (error: any) => {
      setAlertMessage(error.response?.data?.message || 'Failed to assign students. Please try again.')
      setAlertType('error')
      setShowAlert(true)
    }
  })

  // Filter out already selected students from search results
  const availableStudents = useMemo(() => {
    if (!searchResults?.data) return []
    return searchResults.data.filter(student => !selectedStudents.has(student.id))
  }, [searchResults?.data, selectedStudents])

  const handleSearch = (value: string) => {
    setSearchTerm(value)
  }

  const handleStudentToggle = (studentId: string) => {
    const newSelected = new Set(selectedStudents)
    if (newSelected.has(studentId)) {
      newSelected.delete(studentId)
    } else {
      newSelected.add(studentId)
    }
    setSelectedStudents(newSelected)
  }

  const handleSelectAll = () => {
    if (availableStudents.length === 0) return
    
    const allIds = availableStudents.map(student => student.id)
    setSelectedStudents(new Set([...selectedStudents, ...allIds]))
  }

  const handleDeselectAll = () => {
    setSelectedStudents(new Set())
  }

  const handleAssignment = async (values: AssignmentFormValues) => {
    if (selectedStudents.size === 0) {
      setAlertMessage('Please select at least one student to assign.')
      setAlertType('error')
      setShowAlert(true)
      return
    }

    await assignmentMutation.mutateAsync({
      student_ids: Array.from(selectedStudents),
      section_id: classSection.id,
      academic_year: values.academic_year
    })
  }

  const handleClose = () => {
    setShowAlert(false)
    setSelectedStudents(new Set())
    setSearchTerm('')
    onClose()
  }

  const getFullName = (student: Student) => {
    const parts = [student.first_name, student.middle_name, student.last_name, student.ext_name]
    return parts.filter(Boolean).join(' ')
  }

  const currentYear = new Date().getFullYear()
  const academicYearOptions = [
    { value: `${currentYear}-${currentYear + 1}`, label: `${currentYear}-${currentYear + 1}` },
    { value: `${currentYear + 1}-${currentYear + 2}`, label: `${currentYear + 1}-${currentYear + 2}` },
    { value: `${currentYear - 1}-${currentYear}`, label: `${currentYear - 1}-${currentYear}` },
  ]

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={handleClose}
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-4xl"
            >
              {/* Header */}
              <div className="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 sm:mx-0 sm:h-10 sm:w-10">
                      <UsersIcon className="h-6 w-6 text-indigo-600" />
                    </div>
                    <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                      <h3 className="text-base font-semibold leading-6 text-gray-900">
                        Assign Students to Class Section
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        {classSection.title} • {classSection.grade_level}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleClose}
                    className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>
              </div>

              {/* Alert */}
              {showAlert && (
                <div className="px-4 pb-4">
                  <Alert
                    type={alertType}
                    title={alertType === 'error' ? 'Error' : 'Success'}
                    message={alertMessage}
                    onClose={() => setShowAlert(false)}
                  />
                </div>
              )}

              <div className="px-4 pb-4">
                {/* Search Input */}
                <div className="mb-6">
                  <SearchInput
                    value={searchTerm}
                    onChange={setSearchTerm}
                    onSearch={handleSearch}
                    placeholder="Search students by name or LRN..."
                    loading={searchLoading}
                    debounceMs={500}
                  />
                </div>

                {/* Search Results */}
                {searchTerm && (
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-medium text-gray-900">
                        Search Results ({availableStudents.length})
                      </h4>
                      {availableStudents.length > 0 && (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleSelectAll}
                          >
                            Select All
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleDeselectAll}
                          >
                            Deselect All
                          </Button>
                        </div>
                      )}
                    </div>

                    {searchLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                      </div>
                    ) : searchError ? (
                      <Alert
                        type="error"
                        message="Failed to search students. Please try again."
                        show={true}
                      />
                    ) : availableStudents.length === 0 ? (
                      <div className="text-center py-8">
                        <UserIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No students found</h3>
                        <p className="text-gray-600">
                          {searchTerm.length < 2 
                            ? 'Enter at least 2 characters to search'
                            : 'No students match your search criteria'
                          }
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                        {availableStudents.map((student) => (
                          <motion.div
                            key={student.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                              selectedStudents.has(student.id)
                                ? 'border-indigo-500 bg-indigo-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                            onClick={() => handleStudentToggle(student.id)}
                          >
                            <div className="flex items-center space-x-3">
                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                selectedStudents.has(student.id)
                                  ? 'border-indigo-500 bg-indigo-500'
                                  : 'border-gray-300'
                              }`}>
                                {selectedStudents.has(student.id) && (
                                  <CheckIcon className="w-3 h-3 text-white" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {getFullName(student)}
                                </p>
                                <p className="text-xs text-gray-500">LRN: {student.lrn}</p>
                              </div>
                              <Badge color={student.gender === 'male' ? 'blue' : 'pink'}>
                                {student.gender}
                              </Badge>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Selected Students Summary */}
                {selectedStudents.size > 0 && (
                  <div className="mb-6 p-4 bg-indigo-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium text-indigo-900">
                        Selected Students ({selectedStudents.size})
                      </h4>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDeselectAll}
                      >
                        Clear All
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {Array.from(selectedStudents).map((studentId) => {
                        const student = availableStudents.find(s => s.id === studentId)
                        if (!student) return null
                        return (
                          <div key={studentId} className="flex items-center space-x-2 text-sm">
                            <CheckIcon className="w-4 h-4 text-indigo-600" />
                            <span className="text-indigo-900">{getFullName(student)}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Assignment Form */}
                <Formik
                  initialValues={{ academic_year: `${currentYear}-${currentYear + 1}` }}
                  validationSchema={assignmentValidationSchema}
                  onSubmit={handleAssignment}
                >
                  {({ errors, touched, isSubmitting }) => (
                    <Form>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Academic Year
                          </label>
                          <Field
                            as="select"
                            name="academic_year"
                            className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 ${
                              touched.academic_year && errors.academic_year
                                ? 'border-red-300'
                                : 'border-gray-300'
                            }`}
                          >
                            {academicYearOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </Field>
                          {touched.academic_year && errors.academic_year && (
                            <p className="mt-1 text-sm text-red-600">{errors.academic_year}</p>
                          )}
                        </div>

                        <div className="flex justify-end space-x-3 pt-4">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleClose}
                            disabled={isSubmitting}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            disabled={isSubmitting || selectedStudents.size === 0}
                            loading={isSubmitting}
                          >
                            Assign {selectedStudents.size > 0 ? `(${selectedStudents.size})` : ''} Students
                          </Button>
                        </div>
                      </div>
                    </Form>
                  )}
                </Formik>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
} 