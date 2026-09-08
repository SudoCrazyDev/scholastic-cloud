import React from 'react'
import { motion } from 'framer-motion'
import {
  MagnifyingGlassIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { Input } from '../../../components/input'
import { Button } from '../../../components/button'
import { Select } from '../../../components/select'
import type { Student, StudentSectionStatus } from '../../../types'

interface StudentHeaderProps {
  search: string
  onSearchChange: (value: string) => void
  sectionStatus: StudentSectionStatus
  onSectionStatusChange: (value: StudentSectionStatus) => void
  /** Matching students across every page, for the filter's result count. */
  totalItems?: number
  selectedRows: Student[]
  onCreate: () => void
  onBulkDelete: () => void
}

export const StudentHeader: React.FC<StudentHeaderProps> = ({
  search,
  onSearchChange,
  sectionStatus,
  onSectionStatusChange,
  totalItems,
  selectedRows,
  onCreate,
  onBulkDelete,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {/* Search and filters */}
        <div className="flex flex-1 flex-col sm:flex-row gap-3 sm:items-center">
          <div className="flex-1 max-w-md">
            <Input
              type="text"
              placeholder="Search by name or LRN..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              leftIcon={<MagnifyingGlassIcon />}
            />
          </div>

          <div className="w-full sm:w-56">
            <Select
              aria-label="Filter by section"
              value={sectionStatus}
              onChange={(e) => onSectionStatusChange(e.target.value as StudentSectionStatus)}
              options={[
                { value: 'all', label: 'All students' },
                { value: 'unassigned', label: 'Without a section' },
                { value: 'assigned', label: 'With a section' },
              ]}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {/* Bulk delete */}
          {selectedRows.length > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
            >
              <Button
                variant="outline"
                size="sm"
                onClick={onBulkDelete}
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                <TrashIcon className="w-4 h-4 mr-2" />
                Delete ({selectedRows.length})
              </Button>
            </motion.div>
          )}

          {/* Create button */}
          <Button
            onClick={onCreate}
            size="sm"
            className="bg-primary-600 hover:bg-primary-700 text-white"
          >
            <PlusIcon className="w-4 h-4 mr-2" />
            New Student
          </Button>
        </div>
      </div>

      {/* Only worth saying while a filter is narrowing the list — the plain,
          unfiltered count is already what the pagination reads out. */}
      {sectionStatus !== 'all' && totalItems !== undefined && (
        <p className="mt-4 text-sm text-gray-600">
          {totalItems.toLocaleString('en-PH')} student{totalItems === 1 ? '' : 's'}{' '}
          {sectionStatus === 'unassigned' ? 'without a section' : 'with a section'}
          {search ? ` matching “${search}”` : ''}
        </p>
      )}
    </motion.div>
  )
} 