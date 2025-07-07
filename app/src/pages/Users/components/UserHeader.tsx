import React from 'react'
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { Button } from '../../../components/button'
import { Input } from '../../../components/input'
import type { User } from '../../../types'

interface UserHeaderProps {
  search: string
  onSearchChange: (value: string) => void
  selectedRows: User[]
  onCreate: () => void
  onBulkDelete: () => void
}

export const UserHeader: React.FC<UserHeaderProps> = ({
  search,
  onSearchChange,
  selectedRows,
  onCreate,
  onBulkDelete,
}) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Left side - Search */}
        <div className="flex flex-col sm:flex-row gap-4 flex-1">
          {/* Search */}
          <div className="flex-1 min-w-0">
            <Input
              type="text"
              placeholder="Search users by name or email..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full"
            />
          </div>
        </div>

        {/* Right side - Actions */}
        <div className="flex items-center gap-3">
          {selectedRows.length > 0 && (
            <Button
              color="danger"
              size="sm"
              onClick={onBulkDelete}
              className="flex items-center gap-2"
            >
              <TrashIcon className="w-4 h-4" />
              Delete ({selectedRows.length})
            </Button>
          )}
          
          <Button
            onClick={onCreate}
            className="flex items-center gap-2"
          >
            <PlusIcon className="w-4 h-4" />
            Add User
          </Button>
        </div>
      </div>
    </div>
  )
} 