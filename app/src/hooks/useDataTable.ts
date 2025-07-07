import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'

export interface UseDataTableOptions<T = any> {
  queryKey: string[]
  queryFn: (params: DataTableParams) => Promise<any>
  initialPage?: number
  initialItemsPerPage?: number
  initialSearch?: string
  initialSort?: { key: string; direction: 'asc' | 'desc' }
  staleTime?: number
  retry?: number
}

export interface DataTableParams {
  page: number
  limit: number
  search?: string
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
}

export interface UseDataTableReturn<T = any> {
  data: T[]
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
  refresh: () => void
  selectedRows: T[]
  setSelectedRows: (rows: T[]) => void
}

export function useDataTable<T = any>({
  queryKey,
  queryFn,
  initialPage = 1,
  initialItemsPerPage = 10,
  initialSearch = '',
  initialSort,
  staleTime = 5 * 60 * 1000,
  retry = 1,
}: UseDataTableOptions<T>): UseDataTableReturn<T> {
  const [currentPage, setCurrentPage] = useState(initialPage)
  const [itemsPerPage] = useState(initialItemsPerPage)
  const [searchValue, setSearchValue] = useState(initialSearch)
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(initialSort || null)
  const [selectedRows, setSelectedRows] = useState<T[]>([])

  // Build query parameters
  const queryParams: DataTableParams = {
    page: currentPage,
    limit: itemsPerPage,
    ...(searchValue && { search: searchValue }),
    ...(sortConfig && { sortBy: sortConfig.key, sortDirection: sortConfig.direction }),
  }

  // Fetch data using TanStack Query
  const {
    data: response,
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey: [...queryKey, queryParams],
    queryFn: () => queryFn(queryParams),
    staleTime,
    retry,
  })

  const data = response?.data || []
  const pagination = response?.pagination

  // Handle page change
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page)
  }, [])

  // Handle search
  const handleSearch = useCallback((value: string) => {
    setSearchValue(value)
    setCurrentPage(1) // Reset to first page when searching
  }, [])

  // Handle sort
  const handleSort = useCallback((config: { key: string; direction: 'asc' | 'desc' }) => {
    setSortConfig(config)
    setCurrentPage(1) // Reset to first page when sorting
  }, [])

  return {
    data,
    loading,
    error: error?.message || null,
    pagination: {
      currentPage: pagination?.current_page || 1,
      totalPages: pagination?.last_page || 1,
      totalItems: pagination?.total || 0,
      itemsPerPage: pagination?.per_page || itemsPerPage,
      onPageChange: handlePageChange,
    },
    search: {
      value: searchValue,
      onSearch: handleSearch,
    },
    sorting: {
      config: sortConfig,
      onSort: handleSort,
    },
    refresh: refetch,
    selectedRows,
    setSelectedRows,
  }
} 