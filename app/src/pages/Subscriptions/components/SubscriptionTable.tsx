import React from 'react'
import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { DataTable, type Column, type Action } from '../../../components/DataTable'
import type { Subscription } from '../../../types'

interface SubscriptionTableProps {
  subscriptions: Subscription[]
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
  selectedRows: Subscription[]
  onSelectionChange: (rows: Subscription[]) => void
  onEdit: (subscription: Subscription) => void
  onDelete: (subscription: Subscription) => void
}

export const SubscriptionTable: React.FC<SubscriptionTableProps> = ({
  subscriptions,
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
  const columns: Column<Subscription>[] = [
    {
      key: 'title',
      label: 'Title',
      sortable: true,
      render: (value) => (
        <div className="font-medium text-gray-900">{value}</div>
      ),
    },
    {
      key: 'description',
      label: 'Description',
      sortable: false,
      render: (value) => (
        <div className="text-gray-600">
          {value || 'No description'}
        </div>
      ),
    },
    {
      key: 'price',
      label: 'Price',
      sortable: true,
      render: (value) => (
        <div className="text-gray-900 font-medium">
          ${Number(value).toFixed(2)}
        </div>
      ),
    },
    {
      key: 'created_at',
      label: 'Created',
      sortable: true,
      render: (value) => new Date(value).toLocaleDateString(),
    },
  ]

  const actions: Action<Subscription>[] = [
    {
      key: 'edit',
      label: 'Edit Subscription',
      icon: PencilIcon,
      variant: 'primary',
      onClick: (subscription) => onEdit(subscription),
      tooltip: 'Edit this subscription',
    },
    {
      key: 'delete',
      label: 'Delete Subscription',
      icon: TrashIcon,
      variant: 'danger',
      onClick: (subscription) => onDelete(subscription),
      tooltip: 'Delete this subscription',
    },
  ]
console.log(subscriptions)
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <DataTable<Subscription>
        columns={columns}
        data={subscriptions}
        loading={loading}
        error={error}
        pagination={pagination}
        search={{
          ...search,
          placeholder: "Search by title or description...",
        }}
        sorting={sorting}
        selectable={true}
        selectedRows={selectedRows}
        onSelectionChange={onSelectionChange}
        actions={actions}
        striped={true}
        dense={false}
        emptyMessage="No subscriptions found. Try adjusting your search criteria or create a new subscription."
      />
    </div>
  )
} 