import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { Input } from '../../../components/input'
import { Button } from '../../../components/button'
import { Select } from '../../../components/select'
import type { ClassSectionSubject, CreateClassSectionSubjectData } from '../../../types'

interface ClassSectionSubjectModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: CreateClassSectionSubjectData) => Promise<void>
  subject?: ClassSectionSubject | null
  classSectionId: string
  parentSubjects?: ClassSectionSubject[]
  loading?: boolean
  error?: string | null
}

export function ClassSectionSubjectModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  subject, 
  classSectionId,
  parentSubjects = [],
  loading = false,
  error = null 
}: ClassSectionSubjectModalProps) {
  const [formData, setFormData] = useState({
    title: '',
    variant: '',
    start_time: '',
    end_time: '',
    subject_teacher: '',
    parent_id: '',
    isParent: false,
  })
  const [errors, setErrors] = useState<{ [key: string]: string }>({})

  const isEditing = !!subject

  // Reset form when modal opens/closes or subject changes
  useEffect(() => {
    if (isOpen) {
      if (subject) {
        setFormData({
          title: subject.title,
          variant: subject.variant || '',
          start_time: subject.start_time,
          end_time: subject.end_time,
          subject_teacher: subject.subject_teacher || '',
          parent_id: subject.parent_id || '',
          isParent: !subject.subject_teacher && !subject.parent_id,
        })
      } else {
        setFormData({
          title: '',
          variant: '',
          start_time: '',
          end_time: '',
          subject_teacher: '',
          parent_id: '',
          isParent: false,
        })
      }
      setErrors({})
    }
  }, [isOpen, subject])

  const handleFieldChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {}

    if (!formData.title.trim()) {
      newErrors.title = 'Subject title is required'
    } else if (formData.title.length < 2) {
      newErrors.title = 'Subject title must be at least 2 characters'
    } else if (formData.title.length > 100) {
      newErrors.title = 'Subject title must be less than 100 characters'
    }

    if (!formData.start_time.trim()) {
      newErrors.start_time = 'Start time is required'
    }

    if (!formData.end_time.trim()) {
      newErrors.end_time = 'End time is required'
    }

    if (formData.start_time && formData.end_time) {
      const startTime = new Date(`2000-01-01T${formData.start_time}`)
      const endTime = new Date(`2000-01-01T${formData.end_time}`)
      
      if (startTime >= endTime) {
        newErrors.end_time = 'End time must be after start time'
      }
    }

    // Subject teacher is only required for child subjects (not parent subjects)
    if (!formData.isParent && !formData.subject_teacher.trim()) {
      newErrors.subject_teacher = 'Subject teacher is required for child subjects'
    } else if (formData.subject_teacher && formData.subject_teacher.length < 2) {
      newErrors.subject_teacher = 'Teacher name must be at least 2 characters'
    } else if (formData.subject_teacher && formData.subject_teacher.length > 100) {
      newErrors.subject_teacher = 'Teacher name must be less than 100 characters'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    try {
      const submitData = {
        ...formData,
        class_section_id: classSectionId,
        parent_id: formData.isParent ? undefined : (formData.parent_id || undefined),
        subject_teacher: formData.isParent ? undefined : formData.subject_teacher,
        variant: formData.variant || undefined,
      }
      await onSubmit(submitData)
      onClose()
    } catch (err) {
      // Error handling is done by the parent component
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
              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                {/* Subject Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Subject Type
                  </label>
                  <div className="flex items-center space-x-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        checked={formData.isParent}
                        onChange={() => handleFieldChange('isParent', true)}
                        className="mr-2"
                      />
                      <span className="text-sm">Parent Subject (e.g., MAPEH)</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        checked={!formData.isParent}
                        onChange={() => handleFieldChange('isParent', false)}
                        className="mr-2"
                      />
                      <span className="text-sm">Child Subject (e.g., PE, Arts)</span>
                    </label>
                  </div>
                </div>

                {/* Parent Subject Selection (only for child subjects) */}
                {!formData.isParent && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Parent Subject
                    </label>
                    <Select
                      value={formData.parent_id}
                      onChange={(e) => handleFieldChange('parent_id', e.target.value)}
                    >
                      <option value="">Select parent subject (optional)</option>
                      {parentSubjects?.map(parent => (
                        <option key={parent.id} value={parent.id}>{parent.title}</option>
                      ))}
                    </Select>
                  </div>
                )}

                {/* Subject Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Subject Title *
                  </label>
                  <Input
                    type="text"
                    value={formData.title}
                    onChange={(e) => handleFieldChange('title', e.target.value)}
                    placeholder={formData.isParent ? "e.g., MAPEH, Core Subjects" : "e.g., PE, Arts, Music"}
                    className={errors.title ? 'border-red-500' : ''}
                  />
                  {errors.title && (
                    <p className="mt-1 text-sm text-red-600">{errors.title}</p>
                  )}
                </div>

                {/* Subject Variant */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Subject Variant (Optional)
                  </label>
                  <Input
                    type="text"
                    value={formData.variant}
                    onChange={(e) => handleFieldChange('variant', e.target.value)}
                    placeholder="e.g., Sewing, Machineries, Plumbing"
                    className={errors.variant ? 'border-red-500' : ''}
                  />
                  {errors.variant && (
                    <p className="mt-1 text-sm text-red-600">{errors.variant}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">
                    Use variants for subjects with the same name but different specializations (e.g., TLE - Sewing, TLE - Machineries)
                  </p>
                </div>

                {/* Time Schedule */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Start Time *
                    </label>
                    <Input
                      type="time"
                      value={formData.start_time}
                      onChange={(e) => handleFieldChange('start_time', e.target.value)}
                      className={errors.start_time ? 'border-red-500' : ''}
                    />
                    {errors.start_time && (
                      <p className="mt-1 text-sm text-red-600">{errors.start_time}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      End Time *
                    </label>
                    <Input
                      type="time"
                      value={formData.end_time}
                      onChange={(e) => handleFieldChange('end_time', e.target.value)}
                      className={errors.end_time ? 'border-red-500' : ''}
                    />
                    {errors.end_time && (
                      <p className="mt-1 text-sm text-red-600">{errors.end_time}</p>
                    )}
                  </div>
                </div>

                {/* Subject Teacher (only for child subjects) */}
                {!formData.isParent && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Subject Teacher *
                    </label>
                    <Input
                      type="text"
                      value={formData.subject_teacher}
                      onChange={(e) => handleFieldChange('subject_teacher', e.target.value)}
                      placeholder="e.g., Dr. Smith, Prof. Johnson"
                      className={errors.subject_teacher ? 'border-red-500' : ''}
                    />
                    {errors.subject_teacher && (
                      <p className="mt-1 text-sm text-red-600">{errors.subject_teacher}</p>
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
                    disabled={loading}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {loading ? 'Saving...' : (isEditing ? 'Update Subject' : 'Add Subject')}
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