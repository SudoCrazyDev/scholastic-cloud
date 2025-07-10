import React, { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { useFormik } from 'formik'
import * as Yup from 'yup'
import { Input } from '../../../components/input'
import { Button } from '../../../components/button'
import { Select } from '../../../components/select'
import { Autocomplete } from '../../../components/autocomplete'
import { useTeachers } from '../../../hooks/useTeachers'
import type { Subject, CreateSubjectData, UpdateSubjectData } from '../../../types'

interface ClassSectionSubjectModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: CreateSubjectData | UpdateSubjectData) => Promise<void>
  subject?: Subject | null
  classSectionId: string
  institutionId: string
  parentSubjects?: Subject[]
  loading?: boolean
  error?: string | null
}

// Validation schema
const validationSchema = Yup.object().shape({
  subject_type: Yup.string()
    .oneOf(['parent', 'child'], 'Subject type must be either parent or child')
    .required('Subject type is required'),
  parent_subject_id: Yup.string()
    .when('subject_type', {
      is: 'child',
      then: (schema) => schema.required('Parent subject is required for child subjects'),
      otherwise: (schema) => schema.nullable().optional(),
    }),
  title: Yup.string()
    .min(2, 'Title must be at least 2 characters')
    .max(255, 'Title must be less than 255 characters')
    .required('Title is required'),
  variant: Yup.string()
    .max(255, 'Variant must be less than 255 characters')
    .nullable()
    .optional(),
  start_time: Yup.string()
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Start time must be in HH:MM format')
    .nullable()
    .optional(),
  end_time: Yup.string()
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'End time must be in HH:MM format')
    .nullable()
    .optional()
    .test('end-time-after-start', 'End time must be after start time', function(value) {
      const { start_time } = this.parent
      if (!start_time || !value) return true
      return new Date(`2000-01-01T${value}`) > new Date(`2000-01-01T${start_time}`)
    }),
  adviser: Yup.string()
    .when('subject_type', {
      is: 'child',
      then: (schema) => schema.required('Subject teacher is required for child subjects'),
      otherwise: (schema) => schema.nullable().optional(),
    }),
  is_limited_student: Yup.boolean()
    .optional(),
})

export function ClassSectionSubjectModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  subject, 
  classSectionId,
  institutionId,
  parentSubjects = [],
  loading = false,
  error = null 
}: ClassSectionSubjectModalProps) {
  const [selectedTeacher, setSelectedTeacher] = useState<{ id: string; label: string; description?: string } | null>(null)
  const [teacherSearchQuery, setTeacherSearchQuery] = useState('')
  
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

  const isEditing = !!subject

  const formik = useFormik({
    initialValues: {
      subject_type: 'child' as 'parent' | 'child',
      parent_subject_id: '',
      title: '',
      variant: '',
      start_time: '',
      end_time: '',
      adviser: '',
      is_limited_student: false,
    },
    validationSchema,
    onSubmit: async (values) => {
      try {
        const submitData: CreateSubjectData | UpdateSubjectData = {
          institution_id: institutionId,
          class_section_id: classSectionId,
          subject_type: values.subject_type,
          parent_subject_id: values.subject_type === 'child' ? values.parent_subject_id : undefined,
          title: values.title,
          variant: values.variant || undefined,
          start_time: values.start_time || undefined,
          end_time: values.end_time || undefined,
          adviser: values.subject_type === 'child' ? values.adviser : undefined,
          is_limited_student: values.is_limited_student,
        }
        
        await onSubmit(submitData)
        onClose()
      } catch (err) {
        // Error handling is done by the parent component
      }
    },
  })

  // Reset form when modal opens/closes or subject changes
  useEffect(() => {
    if (isOpen) {
      if (subject) {
        formik.setValues({
          subject_type: subject.subject_type,
          parent_subject_id: subject.parent_subject_id || '',
          title: subject.title,
          variant: subject.variant || '',
          start_time: subject.start_time || '',
          end_time: subject.end_time || '',
          adviser: subject.adviser || '',
          is_limited_student: subject.is_limited_student || false,
        })
        
        // Find the teacher if adviser is set
        if (subject.adviser && subject.adviserUser) {
          setSelectedTeacher({
            id: subject.adviser,
            label: getFullName(subject.adviserUser),
            description: subject.adviserUser.email
          })
        } else {
          setSelectedTeacher(null)
        }
      } else {
        formik.resetForm()
        setSelectedTeacher(null)
      }
    } else {
      // Clear search query when modal closes
      setTeacherSearchQuery('')
      setDebouncedSearchQuery('')
    }
  }, [isOpen, subject, teachers])

  const handleTeacherSelect = (teacher: { id: string; label: string; description?: string } | null) => {
    setSelectedTeacher(teacher)
    formik.setFieldValue('adviser', teacher?.id || '')
  }

  const handleClose = () => {
    if (!loading) {
      onClose()
    }
  }

  // Filter parent subjects for child subjects
  const availableParentSubjects = useMemo(() => {
    if (formik.values.subject_type === 'child') {
      return parentSubjects.filter(parent => parent.subject_type === 'parent')
    }
    return []
  }, [formik.values.subject_type, parentSubjects])

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
                  {isEditing ? 'Edit Subject' : 'Add New Subject'}
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

                {/* Subject Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Subject Type *
                  </label>
                  <div className="flex items-center space-x-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="subject_type"
                        value="parent"
                        checked={formik.values.subject_type === 'parent'}
                        onChange={formik.handleChange}
                        className="mr-2"
                      />
                      <span className="text-sm">Parent Subject (e.g., MAPEH)</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="subject_type"
                        value="child"
                        checked={formik.values.subject_type === 'child'}
                        onChange={formik.handleChange}
                        className="mr-2"
                      />
                      <span className="text-sm">Child Subject (e.g., PE, Arts)</span>
                    </label>
                  </div>
                  {formik.touched.subject_type && formik.errors.subject_type && (
                    <p className="mt-1 text-sm text-red-600">{formik.errors.subject_type}</p>
                  )}
                </div>

                {/* Parent Subject Selection (only for child subjects) */}
                {formik.values.subject_type === 'child' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Parent Subject *
                    </label>
                    <Select
                      name="parent_subject_id"
                      value={formik.values.parent_subject_id}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      className={formik.touched.parent_subject_id && formik.errors.parent_subject_id ? 'border-red-500' : ''}
                    >
                      <option value="">Select parent subject</option>
                      {availableParentSubjects.map(parent => (
                        <option key={parent.id} value={parent.id}>{parent.title}</option>
                      ))}
                    </Select>
                    {formik.touched.parent_subject_id && formik.errors.parent_subject_id && (
                      <p className="mt-1 text-sm text-red-600">{formik.errors.parent_subject_id}</p>
                    )}
                  </div>
                )}

                {/* Subject Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Subject Title *
                  </label>
                  <Input
                    type="text"
                    name="title"
                    value={formik.values.title}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    placeholder={formik.values.subject_type === 'parent' ? "e.g., MAPEH, Core Subjects" : "e.g., PE, Arts, Music"}
                    className={formik.touched.title && formik.errors.title ? 'border-red-500' : ''}
                  />
                  {formik.touched.title && formik.errors.title && (
                    <p className="mt-1 text-sm text-red-600">{formik.errors.title}</p>
                  )}
                </div>

                {/* Subject Variant */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Subject Variant (Optional)
                  </label>
                  <Input
                    type="text"
                    name="variant"
                    value={formik.values.variant}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    placeholder="e.g., Sewing, Machineries, Plumbing"
                    className={formik.touched.variant && formik.errors.variant ? 'border-red-500' : ''}
                  />
                  {formik.touched.variant && formik.errors.variant && (
                    <p className="mt-1 text-sm text-red-600">{formik.errors.variant}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">
                    Use variants for subjects with the same name but different specializations (e.g., TLE - Sewing, TLE - Machineries)
                  </p>
                </div>

                {/* Time Schedule */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Start Time
                    </label>
                    <Input
                      type="time"
                      name="start_time"
                      value={formik.values.start_time}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      className={formik.touched.start_time && formik.errors.start_time ? 'border-red-500' : ''}
                    />
                    {formik.touched.start_time && formik.errors.start_time && (
                      <p className="mt-1 text-sm text-red-600">{formik.errors.start_time}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      End Time
                    </label>
                    <Input
                      type="time"
                      name="end_time"
                      value={formik.values.end_time}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      className={formik.touched.end_time && formik.errors.end_time ? 'border-red-500' : ''}
                    />
                    {formik.touched.end_time && formik.errors.end_time && (
                      <p className="mt-1 text-sm text-red-600">{formik.errors.end_time}</p>
                    )}
                  </div>
                </div>

                {/* Subject Teacher (only for child subjects) */}
                {formik.values.subject_type === 'child' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Subject Teacher *
                    </label>
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
                      className={formik.touched.adviser && formik.errors.adviser ? 'border-red-500' : ''}
                      disabled={teachersLoading}
                      error={!!(formik.touched.adviser && formik.errors.adviser)}
                    />
                    {formik.touched.adviser && formik.errors.adviser && (
                      <p className="mt-1 text-sm text-red-600">{formik.errors.adviser}</p>
                    )}
                  </div>
                )}

                {/* Limited Student Option */}
                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      name="is_limited_student"
                      checked={formik.values.is_limited_student}
                      onChange={formik.handleChange}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">Limited student capacity</span>
                  </label>
                </div>

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
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {loading || formik.isSubmitting ? 'Saving...' : (isEditing ? 'Update Subject' : 'Add Subject')}
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