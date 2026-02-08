import React from 'react'
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { Button } from '../../../components/button'
import { Input } from '../../../components/input'
import { Select } from '../../../components/select'
import type { User, Role } from '../../../types'

interface UserHeaderProps {
  search: string
  onSearchChange: (value: string) => void
  roleFilter: string
  onRoleFilterChange: (value: string) => void
  roles: Role[]
  selectedRows: User[]
  onCreate: () => void
  onBulkDelete: () => void
}

export const UserHeader: React.FC<UserHeaderProps> = ({
  search,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
  roles,
  selectedRows,
  onCreate,
  onBulkDelete,
}) => {
  const roleValue = roleFilter ?? ''
  const roleOptions = [
    { value: '', label: 'All roles' },
    ...roles.map((r) => ({ value: String(r.id), label: r.title })),
  ]

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Left side - Search and filters */}
        <div className="flex flex-col sm:flex-row gap-4 flex-1 items-stretch sm:items-center">
          {/* Search */}
          <div className="flex-1 min-w-0">
            <Input
              type="text"
              placeholder="Search users by name or email..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full"
              size="md"
            />
          </div>
          {/* Role filter - reusable Select, height aligned with Input */}
          <div className="w-full sm:w-48 shrink-0 flex">
            <Select
              value={roleValue}
              onChange={(e) => onRoleFilterChange(e.target.value)}
              options={roleOptions}
              aria-label="Filter by role"
              className="h-[42px] [&_select]:h-full [&_select]:min-h-0 [&_select]:py-2.5"
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