import React from 'react'
import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { DataTable, type Column, type Action } from '../../../components/DataTable'
import type { Role } from '../../../types'

interface RoleTableProps {
  roles: Role[]
  loading: boolean
  error: string | null
  pagination: {
    currentPage: number
    totalPages: number
    totalItems: number
    itemsPerPage: number
    onPageChange: (page: number) => void
  }
  search: {
    value: string
    onSearch: (value: string) => void
  }
  sorting: {
    config: { key: string; direction: 'asc' | 'desc' } | null
    onSort: (config: { key: string; direction: 'asc' | 'desc' }) => void
  }
  selectedRows: Role[]
  onSelectionChange: (rows: Role[]) => void
  onEdit: (role: Role) => void
  onDelete: (role: Role) => void
}

export const RoleTable: React.FC<RoleTableProps> = ({
  roles,
  loading,
  error,
  pagination,
  search,
  sorting,
  selectedRows,
  onSelectionChange,
  onEdit,
  onDelete,
}) => {
  const columns: Column<Role>[] = [
    {
      key: 'title',
      label: 'Title',
      sortable: true,
      render: (value) => (
        <div className="font-medium text-white-900">{value}</div>
      ),
    },
    {
      key: 'slug',
      label: 'Slug',
      sortable: true,
      render: (value) => (
        <code className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded">
          {value}
        </code>
      ),
    },
    {
      key: 'created_at',
      label: 'Created',
      sortable: true,
      render: (value) => new Date(value).toLocaleDateString(),
    },
  ]

  const actions: Action<Role>[] = [
    {
      key: 'edit',
      label: 'Edit Role',
      icon: PencilIcon,
      variant: 'primary',
      onClick: (role) => onEdit(role),
      tooltip: 'Edit this role',
    },
    {
      key: 'delete',
      label: 'Delete Role',
      icon: TrashIcon,
      variant: 'danger',
      onClick: (role) => onDelete(role),
      tooltip: 'Delete this role',
    },
  ]

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <DataTable<Role>
        columns={columns}
        data={roles}
        loading={loading}
        error={error}
        pagination={pagination}
        search={{
          ...search,
          placeholder: "Search by title or slug...",
        }}
        sorting={sorting}
        selectable={true}
        selectedRows={selectedRows}
        onSelectionChange={onSelectionChange}
        actions={actions}
        striped={true}
        dense={false}
        emptyMessage="No roles found. Try adjusting your search criteria or create a new role."
      />
    </div>
  )
} 