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
  /** Modules the role can open — the count of distinct `<module>.view` grants. */
  const moduleCount = (role: Role) =>
    new Set(
      (role.permissions ?? [])
        .filter((p) => p.endsWith('.view'))
        .map((p) => p.split('.')[0])
    ).size

  const columns: Column<Role>[] = [
    {
      key: 'title',
      label: 'Role',
      sortable: true,
      render: (value, role) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-white-900">{value}</span>
          {role.is_system && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-600">
              Built-in
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'permissions',
      label: 'Access',
      render: (_value, role) => {
        // A wildcard role reaches everything, including modules added later,
        // so a module count would be misleading.
        if ((role.permissions ?? []).includes('*')) {
          return <span className="text-sm text-gray-700">All modules</span>
        }

        const count = moduleCount(role)

        return (
          <span className={count === 0 ? 'text-sm text-gray-400' : 'text-sm text-gray-700'}>
            {count === 0 ? 'No access' : `${count} module${count === 1 ? '' : 's'}`}
          </span>
        )
      },
    },
    {
      key: 'assigned_users_count',
      label: 'People',
      render: (value) => (
        <span className="text-sm text-gray-700">{value ?? 0}</span>
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
      // Built-in roles are shared platform-wide, and a role still assigned to
      // someone would strip their access on delete.
      disabled: (role) => Boolean(role.is_system) || (role.assigned_users_count ?? 0) > 0,
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
          placeholder: "Search roles...",
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