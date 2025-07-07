import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../lib/api'

export interface UseDataTableOptions<T = any> {
  endpoint: string
  initialPage?: number
  initialItemsPerPage?: number
  initialSearch?: string
  initialSort?: { key: string; direction: 'asc' | 'desc' }
  searchFields?: string[]
  transformData?: (data: T[]) => T[]
  onError?: (error: string) => void
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
  endpoint,
  initialPage = 1,
  initialItemsPerPage = 10,
  initialSearch = '',
  initialSort,
  searchFields = [],
  transformData,
  onError,
}: UseDataTableOptions<T>): UseDataTableReturn<T> {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(initialPage)
  const [itemsPerPage] = useState(initialItemsPerPage)
  const [searchValue, setSearchValue] = useState(initialSearch)
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(initialSort || null)
  const [pagination, setPagination] = useState({
    currentPage: initialPage,
    totalPages: 1,
    totalItems: 0,
    itemsPerPage: initialItemsPerPage,
  })
  const [selectedRows, setSelectedRows] = useState<T[]>([])

  // Use refs to store stable references
  const endpointRef = useRef(endpoint)
  const transformDataRef = useRef(transformData)
  const onErrorRef = useRef(onError)
  const searchFieldsRef = useRef(searchFields)

  // Update refs when props change
  useEffect(() => {
    endpointRef.current = endpoint
    transformDataRef.current = transformData
    onErrorRef.current = onError
    searchFieldsRef.current = searchFields
  }, [endpoint, transformData, onError, searchFields])

  // Fetch data function - stable reference
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      const params = new URLSearchParams()
      
      // Pagination
      params.append('page', currentPage.toString())
      params.append('limit', itemsPerPage.toString())
      
      // Search
      if (searchValue.trim()) {
        if (searchFieldsRef.current.length > 0) {
          searchFieldsRef.current.forEach(field => {
            params.append(`search[${field}]`, searchValue.trim())
          })
        } else {
          params.append('search', searchValue.trim())
        }
      }
      
      // Sorting
      if (sortConfig) {
        params.append('sort_by', sortConfig.key)
        params.append('sort_direction', sortConfig.direction)
      }
      
      const queryParams = params.toString()
      const url = `${endpointRef.current}${queryParams ? `?${queryParams}` : ''}`
      
      const response = await api.get(url)
      
      if (response.data) {
        const responseData = response.data
        const transformedData = transformDataRef.current ? transformDataRef.current(responseData.data || []) : (responseData.data || [])
        setData(transformedData)
        
        // Handle both 'pagination' and 'meta' response formats
        const paginationData = responseData.pagination || responseData.meta
        if (paginationData) {
          setPagination({
            currentPage: paginationData.current_page || paginationData.currentPage || 1,
            totalPages: paginationData.last_page || paginationData.totalPages || 1,
            totalItems: paginationData.total || 0,
            itemsPerPage: paginationData.per_page || paginationData.itemsPerPage || itemsPerPage,
          })
        }
      } else {
        throw new Error('Invalid response format')
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message || 'An error occurred while fetching data'
      setError(errorMessage)
      onErrorRef.current?.(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [currentPage, itemsPerPage, searchValue, sortConfig])

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

  // Refresh data
  const refresh = useCallback(() => {
    fetchData()
  }, [fetchData])

  // Fetch data when dependencies change
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Reset selected rows when data changes
  useEffect(() => {
    setSelectedRows([])
  }, [data])

  return {
    data,
    loading,
    error,
    pagination: {
      currentPage: pagination.currentPage,
      totalPages: pagination.totalPages,
      totalItems: pagination.totalItems,
      itemsPerPage: pagination.itemsPerPage,
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
    refresh,
    selectedRows,
    setSelectedRows,
  }
} 