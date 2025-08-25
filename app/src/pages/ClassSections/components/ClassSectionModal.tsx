import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { useFormik } from 'formik'
import * as Yup from 'yup'
import { Input } from '../../../components/input'
import { Button } from '../../../components/button'
import { Select } from '../../../components/select'
import { Autocomplete } from '../../../components/autocomplete'
import { useTeachers } from '../../../hooks/useTeachers'
import { useSubjectTemplates } from '../../../hooks/useSubjectTemplates'
import type { ClassSection, CreateClassSectionData, SubjectTemplate } from '../../../types'

interface ClassSectionModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: CreateClassSectionData, templateId?: string) => Promise<void>
  classSection?: ClassSection | null
  gradeLevels: string[]
  loading?: boolean
  error?: string | null
}

// Validation schema
const validationSchema = Yup.object().shape({
  grade_level: Yup.string()
    .required('Grade level is required'),
  title: Yup.string()
    .min(2, 'Title must be at least 2 characters')
    .max(100, 'Title must be less than 100 characters')
    .required('Title is required'),
  adviser_id: Yup.string()
    .nullable()
    .optional(),
  academic_year: Yup.string()
    .max(20, 'Academic year must be less than 20 characters')
    .optional(),
})

export function ClassSectionModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  classSection, 
  gradeLevels,
  loading = false,
  error = null 
}: ClassSectionModalProps) {
  const [selectedTeacher, setSelectedTeacher] = useState<{ id: string; label: string; description?: string } | null>(null)
  const [teacherSearchQuery, setTeacherSearchQuery] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<SubjectTemplate | null>(null)
  const [useTemplate, setUseTemplate] = useState(false)
  
  // Debounce the search query to avoid too many API calls
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearchQuery(teacherSearchQuery)
    }, 300)
    
    return () => clearTimeout(timeoutId)
  }, [teacherSearchQuery])
  
  // Fetch teachers for autocomplete with search parameter
  const { teachers, loading: teachersLoading, getFullName } = useTeachers({
    search: debouncedSearchQuery,
    limit: 20
  })

  // Fetch subject templates
  const { templates, loading: templatesLoading } = useSubjectTemplates()

  const isEditing = !!classSection

  const formik = useFormik({
    initialValues: {
      grade_level: '',
      title: '',
      adviser_id: '',
      academic_year: '',
    },
    validationSchema,
    onSubmit: async (values) => {
      try {
        const submitData: CreateClassSectionData = {
          grade_level: values.grade_level,
          title: values.title,
          adviser: values.adviser_id || undefined,
          academic_year: values.academic_year || undefined,
        }
        
        // Pass the template ID if a template is selected
        await onSubmit(submitData, useTemplate && selectedTemplate ? selectedTemplate.id : undefined)
        onClose()
      } catch (err) {
        // Error handling is done by the parent component
      }
    },
  })

  // Reset form when modal opens/closes or classSection changes
  useEffect(() => {
    if (isOpen) {
      if (classSection) {
        formik.setValues({
          grade_level: classSection.grade_level,
          title: classSection.title,
          adviser_id: '', // We'll set this after finding the teacher
          academic_year: classSection.academic_year || '',
        })
        
        // Find the teacher if adviser is set
        if (classSection.adviser) {
          const teacher = teachers.find(t => t.id === classSection.adviser?.id)
          if (teacher) {
            setSelectedTeacher({
              id: teacher.id,
              label: getFullName(teacher),
              description: teacher.email
            })
            formik.setFieldValue('adviser_id', teacher.id)
          } else {
            setSelectedTeacher(null)
            formik.setFieldValue('adviser_id', '')
          }
        } else {
          setSelectedTeacher(null)
          formik.setFieldValue('adviser_id', '')
        }
      } else {
        formik.resetForm()
        setSelectedTeacher(null)
        setSelectedTemplate(null)
        setUseTemplate(false)
      }
    } else {
      // Clear search query when modal closes
      setTeacherSearchQuery('')
      setDebouncedSearchQuery('')
      setSelectedTemplate(null)
      setUseTemplate(false)
    }
  }, [isOpen, classSection, teachers])

  const handleTeacherSelect = (teacher: { id: string; label: string; description?: string } | null) => {
    setSelectedTeacher(teacher)
    formik.setFieldValue('adviser_id', teacher?.id || '')
    
    // Clear search query when clearing selection
    if (!teacher) {
      setTeacherSearchQuery('')
      setDebouncedSearchQuery('')
    }
  }

  const handleClose = () => {
    if (!loading) {
      onClose()
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
            onClick={handleClose}
          />

          {/* Modal */}
          <div className="flex min-h-full items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-md bg-white rounded-lg shadow-xl max-h-[90vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  {isEditing ? 'Edit Class Section' : 'Create New Class Section'}
                </h3>
                <button
                  onClick={handleClose}
                  disabled={loading}
                  className="text-gray-400 hover:text-gray-600 transition-colors duration-200 disabled:opacity-50"
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={formik.handleSubmit} className="p-6 space-y-6">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                {/* Grade Level */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Grade Level *
                  </label>
                  <Select
                    name="grade_level"
                    value={formik.values.grade_level}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    className={formik.touched.grade_level && formik.errors.grade_level ? 'border-red-500' : ''}
                    placeholder="Select grade level"
                    options={gradeLevels.map(grade => ({
                      value: grade,
                      label: grade
                    }))}
                  />
                  {formik.touched.grade_level && formik.errors.grade_level && (
                    <p className="mt-1 text-sm text-red-600">{formik.errors.grade_level}</p>
                  )}
                </div>

                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Section Title *
                  </label>
                  <Input
                    type="text"
                    name="title"
                    value={formik.values.title}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    placeholder="e.g., Section A, Alpha Section"
                    className={formik.touched.title && formik.errors.title ? 'border-red-500' : ''}
                  />
                  {formik.touched.title && formik.errors.title && (
                    <p className="mt-1 text-sm text-red-600">{formik.errors.title}</p>
                  )}
                </div>

                {/* Adviser */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Adviser
                  </label>
                  <div className="flex gap-2">
                    <div className="flex-1">
                                             <Autocomplete
                         value={selectedTeacher}
                         onChange={handleTeacherSelect}
                         onQueryChange={setTeacherSearchQuery}
                         options={teachers.map(teacher => ({
                           id: teacher.id,
                           label: getFullName(teacher),
                           description: teacher.email
                         }))}
                         placeholder="Search for a teacher..."
                         className={formik.touched.adviser_id && formik.errors.adviser_id ? 'border-red-500' : ''}
                         disabled={teachersLoading}
                         error={!!(formik.touched.adviser_id && formik.errors.adviser_id)}
                       />

                    </div>
                    {selectedTeacher && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleTeacherSelect(null)}
                        disabled={loading}
                        className="px-3 py-2 text-sm"
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                  {formik.touched.adviser_id && formik.errors.adviser_id && (
                    <p className="mt-1 text-sm text-red-600">{formik.errors.adviser_id}</p>
                  )}
                </div>

                {/* Academic Year */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Academic Year
                  </label>
                  <Input
                    type="text"
                    name="academic_year"
                    value={formik.values.academic_year}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    placeholder="e.g., 2024-2025 (optional)"
                    className={formik.touched.academic_year && formik.errors.academic_year ? 'border-red-500' : ''}
                  />
                  {formik.touched.academic_year && formik.errors.academic_year && (
                    <p className="mt-1 text-sm text-red-600">{formik.errors.academic_year}</p>
                  )}
                </div>

                {/* Subject Template Selection */}
                {!isEditing && (
                  <div className="space-y-3">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="use-template"
                        checked={useTemplate}
                        onChange={(e) => {
                          setUseTemplate(e.target.checked)
                          if (!e.target.checked) {
                            setSelectedTemplate(null)
                          }
                        }}
                        className="mr-2"
                      />
                      <label htmlFor="use-template" className="text-sm font-medium text-gray-700">
                        Use Subject Template
                      </label>
                    </div>
                    
                    {useTemplate && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Select Template
                        </label>
                        <Select
                          value={selectedTemplate?.id || ''}
                          onChange={(e) => {
                            const template = templates.find(t => t.id === e.target.value)
                            setSelectedTemplate(template || null)
                          }}
                          placeholder="Choose a subject template..."
                          options={[
                            { value: '', label: 'Select a template' },
                            ...templates
                              .filter(t => !formik.values.grade_level || !t.grade_level || t.grade_level === formik.values.grade_level)
                              .map(template => ({
                                value: template.id,
                                label: template.name
                              }))
                          ]}
                          disabled={templatesLoading}
                        />
                        {selectedTemplate && (
                          <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                            <p className="text-sm font-medium text-blue-900">{selectedTemplate.name}</p>
                            {selectedTemplate.description && (
                              <p className="text-xs text-blue-700 mt-1">{selectedTemplate.description}</p>
                            )}
                            <p className="text-xs text-blue-600 mt-2">
                              {selectedTemplate.items?.length || 0} subjects will be created
                            </p>
                          </div>
                        )}
                        {!useTemplate && (
                          <p className="text-xs text-gray-500 mt-1">
                            You can add subjects manually after creating the section
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-end space-x-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading || formik.isSubmitting}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    {loading || formik.isSubmitting ? 'Saving...' : (isEditing ? 'Update Section' : 'Create Section')}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
} 