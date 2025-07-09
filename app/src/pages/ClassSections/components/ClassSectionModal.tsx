import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { Input } from '../../../components/input'
import { Button } from '../../../components/button'
import { Select } from '../../../components/select'
import type { ClassSection, CreateClassSectionData } from '../../../types'

interface ClassSectionModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: CreateClassSectionData) => Promise<void>
  classSection?: ClassSection | null
  gradeLevels: string[]
  loading?: boolean
  error?: string | null
}

export function ClassSectionModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  classSection, 
  gradeLevels,
  loading = false,
  error = null 
}: ClassSectionModalProps) {
  const [formData, setFormData] = useState({
    grade_level: '',
    title: '',
    adviser: '',
  })
  const [errors, setErrors] = useState<{ [key: string]: string }>({})

  const isEditing = !!classSection

  // Reset form when modal opens/closes or classSection changes
  useEffect(() => {
    if (isOpen) {
      if (classSection) {
        setFormData({
          grade_level: classSection.grade_level,
          title: classSection.title,
          adviser: classSection.adviser,
        })
      } else {
        setFormData({
          grade_level: '',
          title: '',
          adviser: '',
        })
      }
      setErrors({})
    }
  }, [isOpen, classSection])

  const handleFieldChange = (field: string, value: string) => {
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

    if (!formData.grade_level.trim()) {
      newErrors.grade_level = 'Grade level is required'
    }

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required'
    } else if (formData.title.length < 2) {
      newErrors.title = 'Title must be at least 2 characters'
    } else if (formData.title.length > 100) {
      newErrors.title = 'Title must be less than 100 characters'
    }

    if (!formData.adviser.trim()) {
      newErrors.adviser = 'Adviser is required'
    } else if (formData.adviser.length < 2) {
      newErrors.adviser = 'Adviser name must be at least 2 characters'
    } else if (formData.adviser.length > 100) {
      newErrors.adviser = 'Adviser name must be less than 100 characters'
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
      await onSubmit(formData)
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
              <form onSubmit={handleSubmit} className="p-6 space-y-6">
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
                    value={formData.grade_level}
                    onChange={(e) => handleFieldChange('grade_level', e.target.value)}
                    className={errors.grade_level ? 'border-red-500' : ''}
                  >
                    <option value="">Select grade level</option>
                    {gradeLevels.map(grade => (
                      <option key={grade} value={grade}>{grade}</option>
                    ))}
                  </Select>
                  {errors.grade_level && (
                    <p className="mt-1 text-sm text-red-600">{errors.grade_level}</p>
                  )}
                </div>

                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Section Title *
                  </label>
                  <Input
                    type="text"
                    value={formData.title}
                    onChange={(e) => handleFieldChange('title', e.target.value)}
                    placeholder="e.g., Section A, Alpha Section"
                    className={errors.title ? 'border-red-500' : ''}
                  />
                  {errors.title && (
                    <p className="mt-1 text-sm text-red-600">{errors.title}</p>
                  )}
                </div>

                {/* Adviser */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Adviser *
                  </label>
                  <Input
                    type="text"
                    value={formData.adviser}
                    onChange={(e) => handleFieldChange('adviser', e.target.value)}
                    placeholder="e.g., John Doe"
                    className={errors.adviser ? 'border-red-500' : ''}
                  />
                  {errors.adviser && (
                    <p className="mt-1 text-sm text-red-600">{errors.adviser}</p>
                  )}
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
                    disabled={loading}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    {loading ? 'Saving...' : (isEditing ? 'Update Section' : 'Create Section')}
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