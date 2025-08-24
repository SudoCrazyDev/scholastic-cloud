import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XMarkIcon, PlusIcon, PencilIcon, TrashIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { useSubjectTemplates } from '../../../hooks/useSubjectTemplates'
import { SubjectTemplateModal } from '../../SubjectTemplates/components/SubjectTemplateModal'
import { Button } from '../../../components/button'
import type { SubjectTemplate } from '../../../types'

interface SubjectTemplatesModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SubjectTemplatesModal({ isOpen, onClose }: SubjectTemplatesModalProps) {
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<SubjectTemplate | null>(null)
  
  const { 
    templates, 
    loading, 
    error, 
    createTemplate, 
    updateTemplate, 
    deleteTemplate,
    fetchTemplates 
  } = useSubjectTemplates()

  // Refresh templates when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchTemplates()
    }
  }, [isOpen, fetchTemplates])

  // Show error if there's one from the hook
  useEffect(() => {
    if (error) {
      toast.error(error)
    }
  }, [error])

  const handleCreate = () => {
    setSelectedTemplate(null)
    setIsTemplateModalOpen(true)
  }

  const handleEdit = (template: SubjectTemplate) => {
    setSelectedTemplate(template)
    setIsTemplateModalOpen(true)
  }

  const handleDelete = async (template: SubjectTemplate) => {
    if (window.confirm(`Are you sure you want to delete the template "${template.name}"?`)) {
      const toastId = toast.loading('Deleting template...')
      try {
        await deleteTemplate(template.id)
        toast.success(`Template "${template.name}" deleted successfully`, { id: toastId })
      } catch (err) {
        console.error('Failed to delete template:', err)
        toast.error(`Failed to delete template: ${err instanceof Error ? err.message : 'Unknown error'}`, { id: toastId })
      }
    }
  }

  const handleModalClose = () => {
    setIsTemplateModalOpen(false)
    setSelectedTemplate(null)
  }

  const handleModalSubmit = async (data: any) => {
    const isEditing = !!selectedTemplate
    const toastId = toast.loading(isEditing ? 'Updating template...' : 'Creating template...')
    
    try {
      if (isEditing) {
        await updateTemplate(selectedTemplate.id, data)
        toast.success(`Template "${data.name}" updated successfully`, { id: toastId })
      } else {
        await createTemplate(data)
        toast.success(`Template "${data.name}" created successfully`, { id: toastId })
      }
      handleModalClose()
    } catch (err) {
      console.error('Failed to save template:', err)
      toast.error(`Failed to save template: ${err instanceof Error ? err.message : 'Unknown error'}`, { id: toastId })
      throw err
    }
  }



  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-40 overflow-y-auto">
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
              className="relative w-full max-w-6xl bg-white rounded-lg shadow-xl max-h-[90vh] overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">Subject Templates</h3>
                  <p className="mt-1 text-sm text-gray-600">
                    Create and manage subject templates to streamline class section setup
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {/* Actions */}
                <div className="flex justify-end mb-6">
                  <Button
                    onClick={handleCreate}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    <PlusIcon className="w-5 h-5 mr-2" />
                    Create Template
                  </Button>
                </div>

                {/* Templates Grid */}
                {loading ? (
                  <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                  </div>
                ) : templates.length === 0 ? (
                  <div className="bg-gray-50 rounded-lg p-12 text-center">
                    <DocumentDuplicateIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No templates yet</h3>
                    <p className="text-gray-600 mb-4">
                      Get started by creating your first subject template
                    </p>
                    <Button
                      onClick={handleCreate}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                      <PlusIcon className="w-5 h-5 mr-2" />
                      Create Your First Template
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {templates.map(template => (
                      <div
                        key={template.id}
                        className="bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow duration-200"
                      >
                        <div className="p-4">
                          {/* Template Header */}
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex-1">
                              <h4 className="font-semibold text-gray-900">{template.name}</h4>
                              {template.grade_level && (
                                <span className="inline-block mt-1 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                                  {template.grade_level}
                                </span>
                              )}
                            </div>
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleEdit(template)}
                                className="p-1 text-gray-600 hover:text-indigo-600 transition-colors"
                                title="Edit template"
                              >
                                <PencilIcon className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(template)}
                                className="p-1 text-gray-600 hover:text-red-600 transition-colors"
                                title="Delete template"
                              >
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Description */}
                          {template.description && (
                            <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                              {template.description}
                            </p>
                          )}

                          {/* Subject Count */}
                          <div className="border-t pt-3">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-600">Subjects:</span>
                              <span className="font-medium text-gray-900">
                                {template.items?.length || 0}
                              </span>
                            </div>
                            
                            {/* Subject Preview */}
                            {template.items && template.items.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {template.items.slice(0, 3).map((item, index) => (
                                  <div key={item.id || index} className="text-xs text-gray-500">
                                    • {item.title}
                                    {item.variant && ` - ${item.variant}`}
                                  </div>
                                ))}
                                {template.items.length > 3 && (
                                  <div className="text-xs text-gray-400">
                                    +{template.items.length - 3} more...
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>

          {/* Template Create/Edit Modal */}
          <SubjectTemplateModal
            isOpen={isTemplateModalOpen}
            onClose={handleModalClose}
            onSubmit={handleModalSubmit}
            template={selectedTemplate}
          />
        </div>
      )}
    </AnimatePresence>
  )
}