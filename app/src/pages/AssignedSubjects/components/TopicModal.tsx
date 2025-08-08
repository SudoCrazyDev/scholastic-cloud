import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XMarkIcon, DocumentTextIcon } from '@heroicons/react/24/outline'
import { Input } from '../../../components/input'
import { Textarea } from '../../../components/textarea'
import type { Topic } from '../../../types'
import type { CreateTopicData, UpdateTopicData } from '../../../services/topicService'

interface TopicModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: CreateTopicData | UpdateTopicData, isEditing: boolean) => Promise<void>
  topic?: Topic | null
  subjectId: string
  isLoading?: boolean
}

export const TopicModal: React.FC<TopicModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  topic,
  subjectId,
  isLoading = false
}) => {
  const [formData, setFormData] = useState<CreateTopicData>({
    subject_id: subjectId,
    title: '',
    description: '',
    is_completed: false,
    quarter: '1'
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const isEditing = !!topic

  const resetForm = () => {
    setFormData({
      subject_id: subjectId,
      title: '',
      description: '',
      is_completed: false,
      quarter: '1'
    })
    setErrors({})
  }

  useEffect(() => {
    if (topic) {
      setFormData({
        subject_id: subjectId,
        title: topic.title,
        description: topic.description || '',
        is_completed: topic.is_completed,
        quarter: topic.quarter || '1'
      })
    } else {
      resetForm()
    }
  }, [topic, subjectId])

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required'
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
      await onSubmit(formData, isEditing)
      if (!isEditing) {
        // Clear form only after successful creation, not editing
        resetForm()
      }
      onClose()
    } catch (error) {
      console.error('Error submitting topic:', error)
    }
  }

  const handleInputChange = (field: keyof CreateTopicData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }))
    }
  }

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
              onClick={onClose}
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                    <DocumentTextIcon className="w-6 h-6 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">
                      {isEditing ? 'Edit Topic' : 'Add New Topic'}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {isEditing ? 'Update topic information' : 'Create a new topic for this subject'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Title */}
                <div>
                  <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                    Title *
                  </label>
                  <Input
                    id="title"
                    type="text"
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    placeholder="Enter topic title"
                    error={errors.title}
                    disabled={isLoading}
                  />
                </div>

                {/* Description */}
                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    placeholder="Enter topic description (optional)"
                    rows={3}
                    disabled={isLoading}
                  />
                </div>

                {/* Quarter Select */}
                <div>
                  <label htmlFor="quarter" className="block text-sm font-medium text-gray-700 mb-2">
                    Quarter
                  </label>
                  <select
                    id="quarter"
                    value={formData.quarter}
                    onChange={(e) => handleInputChange('quarter', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    disabled={isLoading}
                  >
                    <option value="1">1st Quarter</option>
                    <option value="2">Second Quarter</option>
                    <option value="3">Third Quarter</option>
                    <option value="4">Fourth Quarter</option>
                  </select>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isLoading}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        {isEditing ? 'Updating...' : 'Creating...'}
                      </>
                    ) : (
                      isEditing ? 'Update Topic' : 'Create Topic'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
}
