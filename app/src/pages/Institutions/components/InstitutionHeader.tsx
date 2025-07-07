import React from 'react'
import { motion } from 'framer-motion'
import { PlusIcon } from '@heroicons/react/24/outline'
import type { Institution } from '../../../types'

interface InstitutionHeaderProps {
  selectedRows: Institution[]
  onCreate: () => void
  onBulkDelete: () => void
}

export const InstitutionHeader: React.FC<InstitutionHeaderProps> = ({
  selectedRows,
  onCreate,
  onBulkDelete,
}) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Institutions Management</h1>
          <p className="text-gray-600 mt-1">Manage educational institutions and their subscriptions</p>
        </div>
        <div className="flex items-center space-x-3">
          {selectedRows.length > 0 && (
            <motion.button
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              onClick={onBulkDelete}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-all duration-200"
            >
              Delete Selected ({selectedRows.length})
            </motion.button>
          )}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onCreate}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors duration-200 cursor-pointer flex items-center space-x-2"
          >
            <PlusIcon className="w-4 h-4" />
            <span>Add New Institution</span>
          </motion.button>
        </div>
      </div>
    </div>
  )
} 