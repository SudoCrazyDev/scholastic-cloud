import React from 'react'
import { motion } from 'framer-motion'
import { PlusIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline'

interface ClassSectionHeaderProps {
  onCreate: () => void
  onManageTemplates: () => void
}

export const ClassSectionHeader: React.FC<ClassSectionHeaderProps> = ({
  onCreate,
  onManageTemplates,
}) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Class Sections</h1>
          <p className="text-gray-600 mt-1">Add or update class sections and assign subjects</p>
        </div>
        <div className="flex items-center space-x-3">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onManageTemplates}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors duration-200 cursor-pointer flex items-center space-x-2"
          >
            <DocumentDuplicateIcon className="w-4 h-4" />
            <span>Manage Templates</span>
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onCreate}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors duration-200 cursor-pointer flex items-center space-x-2"
          >
            <PlusIcon className="w-4 h-4" />
            <span>Create Section</span>
          </motion.button>
        </div>
      </div>
    </div>
  )
} 