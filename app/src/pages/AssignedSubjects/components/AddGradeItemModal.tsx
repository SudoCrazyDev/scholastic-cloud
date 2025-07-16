import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  XMarkIcon,
  DocumentTextIcon,
  AcademicCapIcon,
  UserGroupIcon,
  CalendarIcon
} from '@heroicons/react/24/outline'
import { useFormik } from 'formik'
import * as Yup from 'yup'
import { useCreateSubjectEcrItem } from '../../../hooks/useSubjectEcrItems'
import { useSubjectEcrs } from '../../../hooks/useSubjectEcrItems'

interface AddGradeItemModalProps {
  isOpen: boolean
  onClose: () => void
  subjectId: string
  onSuccess: () => void
}

const categoryTypeMap = {
  'Written Works': 'written',
  'Performance Tasks': 'performance',
  'Quarterly Assessment': 'quarterly',
}

const quarterTypeMap = {
  'First Quarter': 'Q1',
  'Second Quarter': 'Q2',
  'Third Quarter': 'Q3',
  'Fourth Quarter': 'Q4',
}

export const AddGradeItemModal: React.FC<AddGradeItemModalProps> = ({
  isOpen,
  onClose,
  subjectId,
  onSuccess
}) => {
  const createMutation = useCreateSubjectEcrItem()
  const { data: subjectEcrsData, isLoading: subjectEcrsLoading, error: subjectEcrsError } = useSubjectEcrs(subjectId)
  const subjectEcrs = subjectEcrsData?.data || []

  const formik = useFormik({
    initialValues: {
      title: '',
      description: '',
      date: new Date().toISOString().split('T')[0],
      total_score: 10,
      subject_ecr_id: '',
      quarter: '1',
    },
    validationSchema: Yup.object({
      title: Yup.string().required('Title is required'),
      description: Yup.string().required('Description is required'),
      date: Yup.string().required('Date is required'),
      total_score: Yup.number().min(1).required('Total score is required'),
      subject_ecr_id: Yup.string().required('Component is required'),
      quarter: Yup.string().required('Quarter is required'),
    }),
    onSubmit: async (values, { resetForm, setSubmitting, setErrors }) => {
      try {
        // Find the selected subject_ecr to infer type if possible
        const selectedEcr = subjectEcrs.find((ecr: any) => ecr.id === values.subject_ecr_id)
        await createMutation.mutateAsync({
          ...values,
          subject_ecr_id: values.subject_ecr_id,
          ...(selectedEcr?.type ? { type: selectedEcr.type } : {}),
          title: values.title,
          description: values.description,
          score: values.total_score,
        })
        onSuccess()
        onClose()
        resetForm()
      } catch (err: any) {
        setErrors({ title: err?.message || 'Failed to create grade item' })
      } finally {
        setSubmitting(false)
      }
    },
  })

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
              <form onSubmit={formik.handleSubmit} className="space-y-6">
                {/* Title */}
                <div>
                  <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                    Title *
                  </label>
                  <input
                    type="text"
                    id="title"
                    {...formik.getFieldProps('title')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="e.g., Quiz 1: Basic Operations"
                  />
                  {formik.touched.title && formik.errors.title && (
                    <div className="text-xs text-red-600 mt-1">{formik.errors.title}</div>
                  )}
                </div>

                {/* Description */}
                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                    Description *
                  </label>
                  <textarea
                    id="description"
                    {...formik.getFieldProps('description')}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Brief description of the assessment or activity"
                  />
                  {formik.touched.description && formik.errors.description && (
                    <div className="text-xs text-red-600 mt-1">{formik.errors.description}</div>
                  )}
                </div>

                {/* Date and Total Score */}
                <div className="grid grid-cols-2 gap-4">
                  {/*
                  <div>
                    <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-2">
                      Date
                    </label>
                    <div className="relative">
                      <CalendarIcon className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                      <input
                        type="date"
                        id="date"
                        {...formik.getFieldProps('date')}
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      {formik.touched.date && formik.errors.date && (
                        <div className="text-xs text-red-600 mt-1">{formik.errors.date}</div>
                      )}
                    </div>
                  </div>
                  */}
                  <div>
                    <label htmlFor="total_score" className="block text-sm font-medium text-gray-700 mb-2">
                      Total Score
                    </label>
                    <input
                      type="number"
                      id="total_score"
                      {...formik.getFieldProps('total_score')}
                      min="1"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    {formik.touched.total_score && formik.errors.total_score && (
                      <div className="text-xs text-red-600 mt-1">{formik.errors.total_score}</div>
                    )}
                  </div>
                </div>

                {/* Category (Component) and Quarter */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="subject_ecr_id" className="block text-sm font-medium text-gray-700 mb-2">
                      Component
                    </label>
                    {subjectEcrsLoading ? (
                      <div className="text-gray-500 text-sm">Loading components...</div>
                    ) : subjectEcrsError ? (
                      <div className="text-red-600 text-sm">Failed to load components.</div>
                    ) : (
                      <select
                        id="subject_ecr_id"
                        {...formik.getFieldProps('subject_ecr_id')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="">Select a component</option>
                        {subjectEcrs.map((ecr: any) => (
                          <option key={ecr.id} value={ecr.id}>{ecr.title} ({ecr.percentage}%)</option>
                        ))}
                      </select>
                    )}
                    {formik.touched.subject_ecr_id && formik.errors.subject_ecr_id && (
                      <div className="text-xs text-red-600 mt-1">{formik.errors.subject_ecr_id}</div>
                    )}
                  </div>
                  <div>
                    <label htmlFor="quarter" className="block text-sm font-medium text-gray-700 mb-2">
                      Quarter
                    </label>
                    <select
                      id="quarter"
                      {...formik.getFieldProps('quarter')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="1">First Quarter</option>
                      <option value="2">Second Quarter</option>
                      <option value="3">Third Quarter</option>
                      <option value="4">Fourth Quarter</option>
                    </select>
                    {formik.touched.quarter && formik.errors.quarter && (
                      <div className="text-xs text-red-600 mt-1">{formik.errors.quarter}</div>
                    )}
                  </div>
                </div>

                {/* Error Message */}
                {formik.errors.title && typeof formik.errors.title === 'string' && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-sm text-red-800">{formik.errors.title}</p>
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
                    disabled={formik.isSubmitting || createMutation.status === 'pending'}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {formik.isSubmitting || createMutation.status === 'pending' ? (
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