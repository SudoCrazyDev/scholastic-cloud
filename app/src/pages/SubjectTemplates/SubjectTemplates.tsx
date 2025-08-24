import { useState } from 'react'
import { PlusIcon, PencilIcon, TrashIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline'
import { useSubjectTemplates } from '../../hooks/useSubjectTemplates'
import { SubjectTemplateModal } from './components/SubjectTemplateModal'
import { Button } from '../../components/button'
import type { SubjectTemplate } from '../../types'

export function SubjectTemplates() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<SubjectTemplate | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedGradeLevel, setSelectedGradeLevel] = useState<string>('')
  
  const { 
    templates, 
    loading, 
    error, 
    createTemplate, 
    updateTemplate, 
    deleteTemplate 
  } = useSubjectTemplates({ 
    search: searchQuery, 
    grade_level: selectedGradeLevel 
  })

  const handleCreate = () => {
    setSelectedTemplate(null)
    setIsModalOpen(true)
  }

  const handleEdit = (template: SubjectTemplate) => {
    setSelectedTemplate(template)
    setIsModalOpen(true)
  }

  const handleDelete = async (template: SubjectTemplate) => {
    if (window.confirm(`Are you sure you want to delete the template "${template.name}"?`)) {
      try {
        await deleteTemplate(template.id)
      } catch (err) {
        console.error('Failed to delete template:', err)
      }
    }
  }

  const handleModalClose = () => {
    setIsModalOpen(false)
    setSelectedTemplate(null)
  }

  const handleModalSubmit = async (data: any) => {
    try {
      if (selectedTemplate) {
        await updateTemplate(selectedTemplate.id, data)
      } else {
        await createTemplate(data)
      }
      handleModalClose()
    } catch (err) {
      console.error('Failed to save template:', err)
      throw err
    }
  }

  // Grade levels for filtering (you might want to fetch these from an API)
  const gradeLevels = [
    'Kindergarten',
    'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6',
    'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10',
    'Grade 11', 'Grade 12'
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Subject Templates</h1>
          <p className="mt-2 text-gray-600">
            Create and manage subject templates to streamline class section setup
          </p>
        </div>

        {/* Filters and Actions */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <div className="flex flex-col sm:flex-row gap-4 flex-1">
              {/* Search */}
              <input
                type="text"
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              
              {/* Grade Level Filter */}
              <select
                value={selectedGradeLevel}
                onChange={(e) => setSelectedGradeLevel(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">All Grade Levels</option>
                {gradeLevels.map(level => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
            </div>
            
            {/* Create Button */}
            <Button
              onClick={handleCreate}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <PlusIcon className="w-5 h-5 mr-2" />
              Create Template
            </Button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {/* Templates Grid */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : templates.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <DocumentDuplicateIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No templates found</h3>
            <p className="text-gray-600 mb-4">
              {searchQuery || selectedGradeLevel 
                ? 'Try adjusting your filters'
                : 'Get started by creating your first subject template'}
            </p>
            {!searchQuery && !selectedGradeLevel && (
              <Button
                onClick={handleCreate}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <PlusIcon className="w-5 h-5 mr-2" />
                Create Your First Template
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map(template => (
              <div
                key={template.id}
                className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200"
              >
                <div className="p-6">
                  {/* Template Header */}
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">{template.name}</h3>
                      {template.grade_level && (
                        <span className="inline-block mt-1 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                          {template.grade_level}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(template)}
                        className="text-gray-600 hover:text-indigo-600 transition-colors"
                        title="Edit template"
                      >
                        <PencilIcon className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDelete(template)}
                        className="text-gray-600 hover:text-red-600 transition-colors"
                        title="Delete template"
                      >
                        <TrashIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  {/* Description */}
                  {template.description && (
                    <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                      {template.description}
                    </p>
                  )}

                  {/* Subject Count */}
                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Subjects:</span>
                      <span className="font-medium text-gray-900">
                        {template.items?.length || 0} subjects
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

                  {/* Created Info */}
                  <div className="mt-4 pt-4 border-t text-xs text-gray-500">
                    Created {new Date(template.created_at).toLocaleDateString()}
                    {template.creator && ` by ${template.creator.first_name} ${template.creator.last_name}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal */}
        <SubjectTemplateModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          onSubmit={handleModalSubmit}
          template={selectedTemplate}
        />
      </div>
    </div>
  )
}