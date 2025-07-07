'use client'

/**
 * DataTable Component
 * 
 * A flexible data table component with support for:
 * - Pagination
 * - Search
 * - Sorting
 * - Row selection
 * - Dynamic actions (icons, buttons, modals, custom components)
 * 
 * Dynamic Actions Examples:
 * 
 * 1. Simple icon actions:
 * const actions: Action<User>[] = [
 *   {
 *     key: 'edit',
 *     label: 'Edit',
 *     icon: PencilIcon,
 *     variant: 'primary',
 *     onClick: (user) => handleEdit(user),
 *   },
 *   {
 *     key: 'delete',
 *     label: 'Delete',
 *     icon: TrashIcon,
 *     variant: 'danger',
 *     onClick: (user) => handleDelete(user),
 *   }
 * ]
 * 
 * 2. Conditional actions:
 * const actions: Action<User>[] = [
 *   {
 *     key: 'activate',
 *     label: 'Activate',
 *     icon: CheckIcon,
 *     variant: 'success',
 *     disabled: (user) => user.status === 'active',
 *     onClick: (user) => handleActivate(user),
 *   }
 * ]
 * 
 * 3. Custom rendered actions:
 * const actions: Action<User>[] = [
 *   {
 *     key: 'custom',
 *     label: 'Custom Action',
 *     render: (user) => (
 *       <button className="bg-purple-500 text-white px-2 py-1 rounded">
 *         {user.name}
 *       </button>
 *     ),
 *   }
 * ]
 * 
 * 4. Modal triggers:
 * const actions: Action<User>[] = [
 *   {
 *     key: 'view',
 *     label: 'View Details',
 *     icon: EyeIcon,
 *     variant: 'info',
 *     onClick: (user) => setSelectedUser(user),
 *   }
 * ]
 */

import React, { useState, useCallback, useMemo } from 'react'
import { ChevronUpIcon, ChevronDownIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from './table'
import { Input } from './input'
import { Alert } from './alert'

export interface Column<T = any> {
  key: string
  label: string
  sortable?: boolean
  render?: (value: any, row: T) => React.ReactNode
  width?: string
  align?: 'left' | 'center' | 'right'
}

export interface Action<T = any> {
  key: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
  variant?: 'primary' | 'secondary' | 'danger' | 'warning' | 'success' | 'info'
  size?: 'sm' | 'md' | 'lg'
  onClick: (row: T, event: React.MouseEvent) => void
  disabled?: boolean | ((row: T) => boolean)
  tooltip?: string
  className?: string
  render?: (row: T) => React.ReactNode
}

export interface SortConfig {
  key: string
  direction: 'asc' | 'desc'
}

export interface DataTableProps<T = any> {
  columns: Column<T>[]
  data: T[]
  loading?: boolean
  error?: string | null
  pagination?: {
    currentPage: number
    totalPages: number
    totalItems: number
    itemsPerPage: number
    onPageChange: (page: number) => void
  }
  search?: {
    value: string
    placeholder?: string
    onSearch: (value: string) => void
  }
  sorting?: {
    config: SortConfig | null
    onSort: (config: SortConfig) => void
  }
  emptyMessage?: string
  className?: string
  striped?: boolean
  dense?: boolean
  onRowClick?: (row: T) => void
  selectable?: boolean
  selectedRows?: T[]
  onSelectionChange?: (rows: T[]) => void
  actions?: Action<T>[]
  actionsColumnWidth?: string
  actionsColumnLabel?: string
}

export function DataTable<T = any>({
  columns,
  data,
  loading = false,
  error = null,
  pagination,
  search,
  sorting,
  emptyMessage = 'No data available',
  className = '',
  striped = true,
  dense = false,
  onRowClick,
  selectable = false,
  selectedRows = [],
  onSelectionChange,
  actions,
  actionsColumnWidth,
  actionsColumnLabel,
}: DataTableProps<T>) {
  const [localSelectedRows, setLocalSelectedRows] = useState<T[]>(selectedRows)

  // Handle row selection
  const handleRowSelect = useCallback((row: T) => {
    if (!selectable || !onSelectionChange) return

    const isSelected = localSelectedRows.some(selectedRow => 
      (selectedRow as any).id === (row as any).id
    )

    let newSelection: T[]
    if (isSelected) {
      newSelection = localSelectedRows.filter(selectedRow => 
        (selectedRow as any).id !== (row as any).id
      )
    } else {
      newSelection = [...localSelectedRows, row]
    }

    setLocalSelectedRows(newSelection)
    onSelectionChange(newSelection)
  }, [selectable, onSelectionChange, localSelectedRows])

  // Handle select all
  const handleSelectAll = useCallback(() => {
    if (!selectable || !onSelectionChange) return

    const newSelection = localSelectedRows.length === data.length ? [] : [...data]
    setLocalSelectedRows(newSelection)
    onSelectionChange(newSelection)
  }, [selectable, onSelectionChange, localSelectedRows, data])

  // Check if all rows are selected
  const allSelected = useMemo(() => {
    return data.length > 0 && localSelectedRows.length === data.length
  }, [data.length, localSelectedRows.length])

  // Check if some rows are selected
  const someSelected = useMemo(() => {
    return localSelectedRows.length > 0 && localSelectedRows.length < data.length
  }, [localSelectedRows.length, data.length])

  // Handle sort click
  const handleSort = useCallback((key: string) => {
    if (!sorting?.onSort) return

    const currentDirection = sorting.config?.key === key ? sorting.config.direction : null
    const newDirection: 'asc' | 'desc' = currentDirection === 'asc' ? 'desc' : 'asc'
    
    sorting.onSort({ key, direction: newDirection })
  }, [sorting])

  // Get sort icon
  const getSortIcon = useCallback((key: string) => {
    if (!sorting?.config || sorting.config.key !== key) {
      return <ChevronUpIcon className="w-4 h-4 opacity-30" />
    }
    
    return sorting.config.direction === 'asc' 
      ? <ChevronUpIcon className="w-4 h-4" />
      : <ChevronDownIcon className="w-4 h-4" />
  }, [sorting])

  // Render cell content
  const renderCell = useCallback((column: Column<T>, row: T) => {
    const value = (row as any)[column.key]
    
    if (column.render) {
      return column.render(value, row)
    }
    
    return value
  }, [])

  if (error) {
    return (
      <div className="space-y-4">
        <Alert 
          type="error"
          title="Error loading data"
          message={error}
          className="animate-in slide-in-from-top-2 duration-300"
        />
      </div>
    )
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Search Bar */}
      {search && (
        <div className="relative animate-in slide-in-from-top-2 duration-300">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            type="text"
            placeholder={search.placeholder || "Search..."}
            value={search.value}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => search.onSearch(e.target.value)}
            className="pl-10 transition-all duration-200 focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden animate-in slide-in-from-top-2 duration-300 delay-100">
        <Table striped={striped} dense={dense}>
          <TableHead>
            <TableRow>
              {selectable && (
                <TableHeader className="w-12">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(input) => {
                      if (input) input.indeterminate = someSelected
                    }}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </TableHeader>
              )}
              {columns.map((column) => (
                <TableHeader
                  key={column.key}
                  className={`${column.width ? `w-${column.width}` : ''} ${
                    column.align === 'center' ? 'text-center' : 
                    column.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span>{column.label}</span>
                    {column.sortable && sorting && (
                      <button
                        onClick={() => handleSort(column.key)}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors duration-200"
                      >
                        {getSortIcon(column.key)}
                      </button>
                    )}
                  </div>
                </TableHeader>
              ))}
              {actions && (
                <TableHeader className={`${actionsColumnWidth || 'w-32'} text-center`}>
                  <span>{actionsColumnLabel || 'Actions'}</span>
                </TableHeader>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={columns.length + (selectable ? 1 : 0) + (actions ? 1 : 0)} className="text-center py-8">
                  <div className="flex items-center justify-center space-x-2">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    <span className="text-gray-500">Loading...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + (selectable ? 1 : 0) + (actions ? 1 : 0)} className="text-center py-8">
                  <div className="text-gray-500">{emptyMessage}</div>
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, index) => (
                <TableRow
                  key={(row as any).id || index}
                  onClick={() => onRowClick?.(row)}
                  className={`transition-all duration-200 ${
                    onRowClick ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800' : ''
                  }`}
                >
                  {selectable && (
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={localSelectedRows.some(selectedRow => 
                          (selectedRow as any).id === (row as any).id
                        )}
                        onChange={() => handleRowSelect(row)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </TableCell>
                  )}
                  {columns.map((column) => (
                    <TableCell
                      key={column.key}
                      className={`${
                        column.align === 'center' ? 'text-center' : 
                        column.align === 'right' ? 'text-right' : 'text-left'
                      }`}
                    >
                      {renderCell(column, row)}
                    </TableCell>
                  ))}
                  {actions && (
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center space-x-2">
                        {actions.map((action) => {
                          const isDisabled = typeof action.disabled === 'function' 
                            ? action.disabled(row) 
                            : action.disabled

                          if (action.render) {
                            return (
                              <div key={action.key} onClick={(e) => e.stopPropagation()}>
                                {action.render(row)}
                              </div>
                            )
                          }

                          const getVariantClasses = (variant?: string) => {
                            switch (variant) {
                              case 'primary': return 'text-blue-400 hover:text-blue-600'
                              case 'secondary': return 'text-gray-400 hover:text-gray-600'
                              case 'danger': return 'text-red-400 hover:text-red-600'
                              case 'warning': return 'text-yellow-400 hover:text-yellow-600'
                              case 'success': return 'text-green-400 hover:text-green-600'
                              case 'info': return 'text-cyan-400 hover:text-cyan-600'
                              default: return 'text-gray-400 hover:text-gray-600'
                            }
                          }

                          return (
                            <button
                              key={action.key}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (!isDisabled) {
                                  action.onClick(row, e)
                                }
                              }}
                              disabled={isDisabled}
                              className={`p-1 transition-colors duration-200 ${getVariantClasses(action.variant)} ${
                                isDisabled ? 'opacity-50 cursor-not-allowed' : ''
                              } ${action.className || ''}`}
                              title={action.tooltip || action.label}
                            >
                              {action.icon && <action.icon className="w-4 h-4" />}
                            </button>
                          )
                        })}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pagination && (
        <div className="flex items-center justify-between animate-in slide-in-from-top-2 duration-300 delay-200">
          <div className="text-sm text-gray-500">
            Showing {((pagination.currentPage - 1) * pagination.itemsPerPage) + 1} to{' '}
            {Math.min(pagination.currentPage * pagination.itemsPerPage, pagination.totalItems)} of{' '}
            {pagination.totalItems} results
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => pagination.onPageChange(pagination.currentPage - 1)}
              disabled={pagination.currentPage === 1}
              className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              Previous
            </button>
            
            <div className="flex items-center space-x-1">
              {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                const page = i + 1
                const isActive = page === pagination.currentPage
                
                return (
                  <button
                    key={page}
                    onClick={() => pagination.onPageChange(page)}
                    className={`w-8 h-8 p-0 text-sm font-medium rounded-md transition-all duration-200 ${
                      isActive 
                        ? 'bg-blue-600 text-white scale-105' 
                        : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 hover:scale-105'
                    } focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                  >
                    {page}
                  </button>
                )
              })}
            </div>
            
            <button
              onClick={() => pagination.onPageChange(pagination.currentPage + 1)}
              disabled={pagination.currentPage === pagination.totalPages}
              className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
} 