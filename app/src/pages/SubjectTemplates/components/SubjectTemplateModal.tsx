import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XMarkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useFormik } from 'formik'
import * as Yup from 'yup'
import { Input } from '../../../components/input'
import { Button } from '../../../components/button'
import { Select } from '../../../components/select'
import type { SubjectTemplate, CreateSubjectTemplateData, UpdateSubjectTemplateData } from '../../../types'

interface SubjectTemplateModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: CreateSubjectTemplateData | UpdateSubjectTemplateData) => Promise<void>
  template?: SubjectTemplate | null
}

interface TemplateItem {
  tempId: string // Temporary ID for UI tracking
  id?: string // Actual ID for existing items
  subject_type: 'parent' | 'child'
  parent_item_index?: number
  title: string
  variant?: string
  start_time?: string
  end_time?: string
  is_limited_student?: boolean
  order?: number
}

const validationSchema = Yup.object().shape({
  name: Yup.string()
    .min(2, 'Name must be at least 2 characters')
    .max(255, 'Name must be less than 255 characters')
    .required('Template name is required'),
  description: Yup.string()
    .max(500, 'Description must be less than 500 characters')
    .nullable()
    .optional(),
  grade_level: Yup.string()
    .max(50, 'Grade level must be less than 50 characters')
    .nullable()
    .optional(),
})

export function SubjectTemplateModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  template 
}: SubjectTemplateModalProps) {
  const [items, setItems] = useState<TemplateItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditing = !!template

  const formik = useFormik({
    initialValues: {
      name: '',
      description: '',
      grade_level: '',
    },
    validationSchema,
    onSubmit: async (values) => {
      if (items.length === 0) {
        setError('Please add at least one subject to the template')
        return
      }

      setLoading(true)
      setError(null)
      
      try {
        // Prepare items data
        const itemsData = items.map((item, index) => ({
          id: item.id, // Include ID for existing items when editing
          subject_type: item.subject_type,
          parent_item_index: item.parent_item_index,
          title: item.title,
          variant: item.variant || undefined,
          start_time: item.start_time || undefined,
          end_time: item.end_time || undefined,
          is_limited_student: item.is_limited_student || false,
          order: item.order ?? index,
        }))

        const submitData = {
          name: values.name,
          description: values.description || undefined,
          grade_level: values.grade_level || undefined,
          items: itemsData,
        }

        await onSubmit(submitData)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save template')
      } finally {
        setLoading(false)
      }
    },
  })

  // Reset form when modal opens/closes or template changes
  useEffect(() => {
    if (isOpen) {
      if (template) {
        formik.setValues({
          name: template.name,
          description: template.description || '',
          grade_level: template.grade_level || '',
        })
        
        // Convert template items to UI format
        const templateItems: TemplateItem[] = template.items?.map((item) => {
          // Find parent index if this is a child item
          let parentIndex: number | undefined
          if (item.parent_item_id) {
            parentIndex = template.items?.findIndex(i => i.id === item.parent_item_id)
            if (parentIndex === -1) parentIndex = undefined
          }
          
          return {
            tempId: `existing-${item.id}`,
            id: item.id,
            subject_type: item.subject_type,
            parent_item_index: parentIndex,
            title: item.title,
            variant: item.variant,
            start_time: item.start_time,
            end_time: item.end_time,
            is_limited_student: item.is_limited_student,
            order: item.order,
          }
        }) || []
        
        setItems(templateItems)
      } else {
        formik.resetForm()
        setItems([])
      }
      setError(null)
    }
  }, [isOpen, template])

  const handleAddItem = () => {
    const newItem: TemplateItem = {
      tempId: `new-${Date.now()}`,
      subject_type: 'child',
      title: '',
      variant: '',
      start_time: '',
      end_time: '',
      is_limited_student: false,
      order: items.length,
    }
    setItems([...items, newItem])
  }

  const handleUpdateItem = (index: number, field: keyof TemplateItem, value: any) => {
    const updatedItems = [...items]
    updatedItems[index] = { ...updatedItems[index], [field]: value }
    
    // If changing from child to parent, remove parent reference
    if (field === 'subject_type' && value === 'parent') {
      updatedItems[index].parent_item_index = undefined
    }
    
    setItems(updatedItems)
  }

  const handleRemoveItem = (index: number) => {
    const updatedItems = items.filter((_, i) => i !== index)
    
    // Update parent references for remaining items
    updatedItems.forEach(item => {
      if (item.parent_item_index !== undefined) {
        if (item.parent_item_index === index) {
          // Parent was removed, clear reference
          item.parent_item_index = undefined
        } else if (item.parent_item_index > index) {
          // Adjust index after removal
          item.parent_item_index--
        }
      }
    })
    
    setItems(updatedItems)
  }

  const getAvailableParents = () => {
    return items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.subject_type === 'parent')
  }

  const gradeLevels = [
    'Kindergarten',
    'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6',
    'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10',
    'Grade 11', 'Grade 12'
  ]

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
            onClick={onClose}
          />

          {/* Modal */}
          <div className="flex min-h-full items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-4xl bg-white rounded-lg shadow-xl max-h-[90vh] overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  {isEditing ? 'Edit Subject Template' : 'Create Subject Template'}
                </h3>
                <button
                  onClick={onClose}
                  disabled={loading}
                  className="text-gray-400 hover:text-gray-600 transition-colors duration-200 disabled:opacity-50"
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={formik.handleSubmit} className="flex-1 overflow-y-auto">
                <div className="p-6 space-y-6">
                  {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                      <p className="text-sm text-red-600">{error}</p>
                    </div>
                  )}

                  {/* Template Info */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Template Name *
                      </label>
                      <Input
                        type="text"
                        name="name"
                        value={formik.values.name}
                        onChange={formik.handleChange}
                        onBlur={formik.handleBlur}
                        placeholder="e.g., Grade 7 - STEM, High School - Arts"
                        className={formik.touched.name && formik.errors.name ? 'border-red-500' : ''}
                      />
                      {formik.touched.name && formik.errors.name && (
                        <p className="mt-1 text-sm text-red-600">{formik.errors.name}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Description
                      </label>
                      <textarea
                        name="description"
                        value={formik.values.description}
                        onChange={formik.handleChange}
                        onBlur={formik.handleBlur}
                        rows={3}
                        placeholder="Describe what this template is for..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      {formik.touched.description && formik.errors.description && (
                        <p className="mt-1 text-sm text-red-600">{formik.errors.description}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Grade Level
                      </label>
                      <Select
                        name="grade_level"
                        value={formik.values.grade_level}
                        onChange={formik.handleChange}
                        onBlur={formik.handleBlur}
                        placeholder="Select grade level (optional)"
                        options={[
                          { value: '', label: 'None' },
                          ...gradeLevels.map(level => ({
                            value: level,
                            label: level
                          }))
                        ]}
                      />
                    </div>
                  </div>

                  {/* Subject Items */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <label className="block text-sm font-medium text-gray-700">
                        Template Subjects *
                      </label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddItem}
                      >
                        <PlusIcon className="w-4 h-4 mr-1" />
                        Add Subject
                      </Button>
                    </div>

                    {items.length === 0 ? (
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                        <p className="text-gray-500 mb-4">No subjects added yet</p>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleAddItem}
                        >
                          <PlusIcon className="w-4 h-4 mr-2" />
                          Add Your First Subject
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {items.map((item, index) => (
                          <div
                            key={item.tempId}
                            className="border border-gray-200 rounded-lg p-4 space-y-3"
                          >
                            {/* Subject Type and Remove Button */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-4">
                                <label className="flex items-center">
                                  <input
                                    type="radio"
                                    checked={item.subject_type === 'parent'}
                                    onChange={() => handleUpdateItem(index, 'subject_type', 'parent')}
                                    className="mr-2"
                                  />
                                  <span className="text-sm">Parent</span>
                                </label>
                                <label className="flex items-center">
                                  <input
                                    type="radio"
                                    checked={item.subject_type === 'child'}
                                    onChange={() => handleUpdateItem(index, 'subject_type', 'child')}
                                    className="mr-2"
                                  />
                                  <span className="text-sm">Child</span>
                                </label>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(index)}
                                className="text-red-600 hover:text-red-800"
                              >
                                <TrashIcon className="w-5 h-5" />
                              </button>
                            </div>

                            {/* Parent Selection for Child */}
                            {item.subject_type === 'child' && getAvailableParents().length > 0 && (
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  Parent Subject
                                </label>
                                <select
                                  value={item.parent_item_index ?? ''}
                                  onChange={(e) => handleUpdateItem(index, 'parent_item_index', 
                                    e.target.value ? parseInt(e.target.value) : undefined)}
                                  className="w-full px-3 py-1 text-sm border border-gray-300 rounded-md"
                                >
                                  <option value="">No parent</option>
                                  {getAvailableParents().map(({ item: parent, index: parentIndex }) => (
                                    <option key={parentIndex} value={parentIndex}>
                                      {parent.title || `Subject ${parentIndex + 1}`}
                                      {parent.variant && ` - ${parent.variant}`}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}

                            {/* Title and Variant */}
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  Title *
                                </label>
                                <input
                                  type="text"
                                  value={item.title}
                                  onChange={(e) => handleUpdateItem(index, 'title', e.target.value)}
                                  placeholder="e.g., Mathematics, Science"
                                  className="w-full px-3 py-1 text-sm border border-gray-300 rounded-md"
                                  required
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  Variant
                                </label>
                                <input
                                  type="text"
                                  value={item.variant || ''}
                                  onChange={(e) => handleUpdateItem(index, 'variant', e.target.value)}
                                  placeholder="e.g., Advanced, Basic"
                                  className="w-full px-3 py-1 text-sm border border-gray-300 rounded-md"
                                />
                              </div>
                            </div>

                            {/* Time Schedule */}
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  Start Time
                                </label>
                                <input
                                  type="time"
                                  value={item.start_time || ''}
                                  onChange={(e) => handleUpdateItem(index, 'start_time', e.target.value)}
                                  className="w-full px-3 py-1 text-sm border border-gray-300 rounded-md"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  End Time
                                </label>
                                <input
                                  type="time"
                                  value={item.end_time || ''}
                                  onChange={(e) => handleUpdateItem(index, 'end_time', e.target.value)}
                                  className="w-full px-3 py-1 text-sm border border-gray-300 rounded-md"
                                />
                              </div>
                            </div>

                            {/* Limited Student Option */}
                            <label className="flex items-center text-sm">
                              <input
                                type="checkbox"
                                checked={item.is_limited_student || false}
                                onChange={(e) => handleUpdateItem(index, 'is_limited_student', e.target.checked)}
                                className="mr-2"
                              />
                              <span className="text-gray-700">Limited student capacity</span>
                            </label>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </form>

              {/* Footer */}
              <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => formik.handleSubmit()}
                  disabled={loading || formik.isSubmitting}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {loading || formik.isSubmitting ? 'Saving...' : (isEditing ? 'Update Template' : 'Create Template')}
                </Button>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
}