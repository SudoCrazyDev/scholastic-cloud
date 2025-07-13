import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  XMarkIcon,
  DocumentTextIcon,
  AcademicCapIcon,
  UserGroupIcon,
  CalendarIcon
} from '@heroicons/react/24/outline'
// Mock service for development
const mockScoreService = {
  createGradeItem: async (data: any) => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000))
    return { success: true, data: { id: Date.now().toString(), ...data } }
  }
}

interface AddGradeItemModalProps {
  isOpen: boolean
  onClose: () => void
  subjectId: string
  onSuccess: () => void
}

interface GradeItemForm {
  title: string
  description: string
  date: string
  total_score: number
  category: 'Written Works' | 'Performance Tasks' | 'Quarterly Assessment'
  quarter: 'First Quarter' | 'Second Quarter' | 'Third Quarter' | 'Fourth Quarter'
}

export const AddGradeItemModal: React.FC<AddGradeItemModalProps> = ({
  isOpen,
  onClose,
  subjectId,
  onSuccess
}) => {
  const [form, setForm] = useState<GradeItemForm>({
    title: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    total_score: 10,
    category: 'Written Works',
    quarter: 'First Quarter'
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!form.title.trim() || !form.description.trim()) {
      setError('Please fill in all required fields')
      return
    }

    try {
      setLoading(true)
      setError(null)
      
      const result = await mockScoreService.createGradeItem({
        ...form,
        subject_id: subjectId
      })
      
      if (result.success) {
        onSuccess()
        onClose()
        // Reset form
        setForm({
          title: '',
          description: '',
          date: new Date().toISOString().split('T')[0],
          total_score: 10,
          category: 'Written Works',
          quarter: 'First Quarter'
        })
      } else {
        setError('Failed to create grade item')
      }
    } catch (err) {
      console.error('Error creating grade item:', err)
      setError('Failed to create grade item')
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: keyof GradeItemForm, value: string | number) => {
    setForm(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Written Works':
        return <DocumentTextIcon className="w-4 h-4 text-blue-600" />
      case 'Performance Tasks':
        return <AcademicCapIcon className="w-4 h-4 text-green-600" />
      case 'Quarterly Assessment':
        return <UserGroupIcon className="w-4 h-4 text-purple-600" />
      default:
        return <DocumentTextIcon className="w-4 h-4 text-gray-600" />
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
                    <h3 className="text-lg font-medium text-gray-900">Add Grade Item</h3>
                    <p className="text-sm text-gray-500">Create a new assessment or activity</p>
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
                  <input
                    type="text"
                    id="title"
                    value={form.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="e.g., Quiz 1: Basic Operations"
                    required
                  />
                </div>

                {/* Description */}
                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                    Description *
                  </label>
                  <textarea
                    id="description"
                    value={form.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Brief description of the assessment or activity"
                    required
                  />
                </div>

                {/* Date and Total Score */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-2">
                      Date
                    </label>
                    <div className="relative">
                      <CalendarIcon className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                      <input
                        type="date"
                        id="date"
                        value={form.date}
                        onChange={(e) => handleInputChange('date', e.target.value)}
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="total_score" className="block text-sm font-medium text-gray-700 mb-2">
                      Total Score
                    </label>
                    <input
                      type="number"
                      id="total_score"
                      value={form.total_score}
                      onChange={(e) => handleInputChange('total_score', Number(e.target.value))}
                      min="1"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Category and Quarter */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-2">
                      Category
                    </label>
                    <select
                      id="category"
                      value={form.category}
                      onChange={(e) => handleInputChange('category', e.target.value as any)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="Written Works">Written Works (30%)</option>
                      <option value="Performance Tasks">Performance Tasks (50%)</option>
                      <option value="Quarterly Assessment">Quarterly Assessment (20%)</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="quarter" className="block text-sm font-medium text-gray-700 mb-2">
                      Quarter
                    </label>
                    <select
                      id="quarter"
                      value={form.quarter}
                      onChange={(e) => handleInputChange('quarter', e.target.value as any)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="First Quarter">First Quarter</option>
                      <option value="Second Quarter">Second Quarter</option>
                      <option value="Third Quarter">Third Quarter</option>
                      <option value="Fourth Quarter">Fourth Quarter</option>
                    </select>
                  </div>
                </div>

                {/* Category Info */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-center space-x-2 mb-2">
                    {getCategoryIcon(form.category)}
                    <span className="text-sm font-medium text-blue-900">{form.category}</span>
                  </div>
                  <p className="text-xs text-blue-800">
                    {form.category === 'Written Works' && 'Quizzes, assignments, and written assessments (30% of quarter grade)'}
                    {form.category === 'Performance Tasks' && 'Projects, presentations, and hands-on activities (50% of quarter grade)'}
                    {form.category === 'Quarterly Assessment' && 'Major exams and comprehensive assessments (20% of quarter grade)'}
                  </p>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Creating...
                      </>
                    ) : (
                      'Create Grade Item'
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