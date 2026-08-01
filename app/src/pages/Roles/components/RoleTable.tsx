import React, { useMemo } from 'react'
import { PencilIcon, TrashIcon, EyeIcon } from '@heroicons/react/24/outline'
import { DataTable, type Column, type Action } from '../../../components/DataTable'
import { Badge } from '../../../components/badge'
import { useModuleCatalog } from '../../../hooks/useModuleCatalog'
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

/** Matches the icon buttons DataTable renders for its own actions. */
const iconButton = 'p-1 transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed'

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
  const { data: catalog } = useModuleCatalog()

  /** module key -> the group it belongs to, for naming what a role reaches. */
  const groupOfModule = useMemo(() => {
    const map = new Map<string, string>()
    catalog?.groups.forEach((group) => {
      group.modules.forEach((module) => map.set(module.key, group.label))
    })
    return map
  }, [catalog])

  /** Modules the role can open — distinct `<module>.view` grants. */
  const modulesOf = (role: Role) =>
    Array.from(
      new Set(
        (role.permissions ?? [])
          .filter((p) => p.endsWith('.view'))
          .map((p) => p.split('.')[0])
      )
    )

  const columns: Column<Role>[] = [
    {
      key: 'title',
      label: 'Role',
      sortable: true,
      render: (value, role) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 dark:text-gray-100">{value}</span>
          {role.is_system && <Badge color="zinc">Built-in</Badge>}
        </div>
      ),
    },
    {
      key: 'permissions',
      label: 'Access',
      render: (_value, role) => {
        // A wildcard role reaches everything, including modules added later,
        // so a module count would be both wrong and misleading.
        if ((role.permissions ?? []).includes('*')) {
          return <Badge color="violet">All modules</Badge>
        }

        const modules = modulesOf(role)

        // A role nobody can use anything with is worth flagging rather than
        // rendering as a quiet zero.
        if (modules.length === 0) {
          return <Badge color="amber">No access</Badge>
        }

        // Name the areas rather than only counting them — "Finance, HRIS" says
        // more at a glance than "15 modules".
        const groups = Array.from(
          new Set(modules.map((m) => groupOfModule.get(m)).filter(Boolean) as string[])
        )
        const shown = groups.slice(0, 3)
        const rest = groups.length - shown.length

        return (
          <div className="min-w-0">
            <div className="text-sm text-gray-900 dark:text-gray-100">
              {modules.length} module{modules.length === 1 ? '' : 's'}
            </div>
            {shown.length > 0 && (
              <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                {shown.join(', ')}
                {rest > 0 ? ` +${rest}` : ''}
              </div>
            )}
          </div>
        )
      },
    },
    {
      key: 'assigned_users_count',
      label: 'People',
      render: (value) => {
        const count = value ?? 0

        return count === 0 ? (
          <span className="text-sm text-gray-400 dark:text-gray-500">—</span>
        ) : (
          <span className="text-sm text-gray-900 dark:text-gray-100">{count}</span>
        )
      },
    },
    {
      key: 'created_at',
      label: 'Created',
      sortable: true,
      render: (value) => (
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {new Date(value).toLocaleDateString()}
        </span>
      ),
    },
  ]

  const actions: Action<Role>[] = [
    {
      key: 'edit',
      label: 'Edit Role',
      // Rendered per row: a built-in role opens read-only, and offering a
      // pencil on something that cannot be edited is a lie.
      onClick: (role) => onEdit(role),
      render: (role) => {
        const readOnly = Boolean(role.is_system)
        const Icon = readOnly ? EyeIcon : PencilIcon

        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onEdit(role)
            }}
            className={`${iconButton} text-primary-400 hover:text-primary-600`}
            title={readOnly ? `View what ${role.title} can reach` : `Edit ${role.title}`}
          >
            <Icon className="h-4 w-4" />
          </button>
        )
      },
    },
    {
      key: 'delete',
      label: 'Delete Role',
      onClick: (role) => onDelete(role),
      render: (role) => {
        const assigned = role.assigned_users_count ?? 0
        // Built-in roles are shared platform-wide; a role still assigned to
        // someone would strip their access on delete.
        const reason = role.is_system
          ? 'Built-in roles cannot be deleted'
          : assigned > 0
            ? `Assigned to ${assigned} ${assigned === 1 ? 'person' : 'people'} — move them first`
            : null

        return (
          <button
            type="button"
            disabled={reason !== null}
            onClick={(e) => {
              e.stopPropagation()
              onDelete(role)
            }}
            className={`${iconButton} text-danger-400 hover:text-danger-600`}
            title={reason ?? `Delete ${role.title}`}
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        )
      },
    },
  ]

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <DataTable<Role>
        columns={columns}
        data={roles}
        loading={loading}
        error={error}
        pagination={pagination}
        search={{
          ...search,
          placeholder: 'Search roles...',
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
