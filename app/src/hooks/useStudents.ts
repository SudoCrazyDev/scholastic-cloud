import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { studentService } from '../services/studentService'
import type { Student, CreateStudentData, UpdateStudentData } from '../types'

export function useStudents(options?: { class_section_id?: string }) {
  const queryClient = useQueryClient()
  const [searchValue, setSearchValue] = useState('')
  const [selectedRows, setSelectedRows] = useState<Student[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingStudent, setEditingStudent] = useState<Student | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState({
    isOpen: false,
    student: null as Student | null,
    title: '',
    message: '',
    onConfirm: () => {},
    loading: false,
  })

  // Parse search value to extract individual fields
  const parseSearchValue = (search: string) => {
    const parts = search.trim().split(' ')
    return {
      first_name: parts[0] || '',
      middle_name: parts[1] || '',
      last_name: parts[2] || '',
    }
  }

  const searchParams = parseSearchValue(searchValue)

  // Query for fetching students
  const {
    data: studentsData,
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['students', { ...searchParams, ...options }],
    queryFn: () => studentService.getStudents({
      ...searchParams,
      ...options,
      per_page: 15,
    }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })

  const students = studentsData?.data || []
  const pagination = studentsData?.pagination ? {
    currentPage: studentsData.pagination.current_page,
    totalPages: studentsData.pagination.last_page,
    totalItems: studentsData.pagination.total,
    onPageChange: (page: number) => {
      // This would need to be implemented with a separate query for pagination
      console.log('Navigate to page:', page)
    },
  } : null

  // Create student mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateStudentData) => studentService.createStudent(data),
    onSuccess: (response) => {
      toast.success('Student created successfully!')
      queryClient.invalidateQueries({ queryKey: ['students'] })
      setIsModalOpen(false)
      setEditingStudent(null)
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to create student'
      toast.error(message)
    },
  })

  // Update student mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateStudentData }) => 
      studentService.updateStudent(id, data),
    onSuccess: (response) => {
      toast.success('Student updated successfully!')
      queryClient.invalidateQueries({ queryKey: ['students'] })
      setIsModalOpen(false)
      setEditingStudent(null)
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to update student'
      toast.error(message)
    },
  })

  // Delete student mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => studentService.deleteStudent(id),
    onSuccess: (response) => {
      toast.success('Student deleted successfully!')
      queryClient.invalidateQueries({ queryKey: ['students'] })
      setSelectedRows([])
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to delete student'
      toast.error(message)
    },
  })

  // Check student exists mutation
  const checkExistsMutation = useMutation({
    mutationFn: (data: { first_name: string; middle_name?: string; last_name?: string }) =>
      studentService.checkStudentExists(data),
  })

  const search = {
    value: searchValue,
    onSearch: (value: string) => setSearchValue(value)
  }

  const handleCreate = useCallback(() => {
    setEditingStudent(null)
    setIsModalOpen(true)
  }, [])

  const handleView = useCallback((student: Student) => {
    // Navigate to student detail page
    window.location.href = `/students/${student.id}`
  }, [])

  const handleDelete = useCallback((student: Student) => {
    setDeleteConfirmation({
      isOpen: true,
      student,
      title: 'Delete Student',
      message: `Are you sure you want to delete ${student.first_name} ${student.last_name}? This action cannot be undone.`,
      onConfirm: () => {
        setDeleteConfirmation(prev => ({ ...prev, loading: true }))
        deleteMutation.mutate(student.id, {
          onSuccess: () => {
            setDeleteConfirmation(prev => ({ ...prev, isOpen: false, loading: false }))
          },
          onError: () => {
            setDeleteConfirmation(prev => ({ ...prev, loading: false }))
          }
        })
      },
      loading: false,
    })
  }, [deleteMutation])

  const handleBulkDelete = useCallback(() => {
    if (selectedRows.length === 0) return

    setDeleteConfirmation({
      isOpen: true,
      student: null,
      title: 'Delete Multiple Students',
      message: `Are you sure you want to delete ${selectedRows.length} student(s)? This action cannot be undone.`,
      onConfirm: () => {
        setDeleteConfirmation(prev => ({ ...prev, loading: true }))
        // Delete students one by one
        Promise.all(selectedRows.map(student => deleteMutation.mutateAsync(student.id)))
          .then(() => {
            setDeleteConfirmation(prev => ({ ...prev, isOpen: false, loading: false }))
            setSelectedRows([])
          })
          .catch(() => {
            setDeleteConfirmation(prev => ({ ...prev, loading: false }))
          })
      },
      loading: false,
    })
  }, [selectedRows, deleteMutation])

  const handleModalSubmit = useCallback(async (data: CreateStudentData) => {
    if (editingStudent) {
      updateMutation.mutate({ id: editingStudent.id, data })
    } else {
      createMutation.mutate(data)
    }
  }, [editingStudent, createMutation, updateMutation])

  const handleModalClose = useCallback(() => {
    setIsModalOpen(false)
    setEditingStudent(null)
  }, [])

  const handleDeleteConfirmationClose = useCallback(() => {
    setDeleteConfirmation(prev => ({ ...prev, isOpen: false }))
  }, [])

  const handleEdit = useCallback((student: Student) => {
    setEditingStudent(student)
    setIsModalOpen(true)
  }, [])

  return {
    students,
    loading,
    error: error?.message || null,
    pagination,
    search,
    selectedRows,
    isModalOpen,
    editingStudent,
    modalLoading: createMutation.isPending || updateMutation.isPending,
    modalError: createMutation.error?.message || updateMutation.error?.message || null,
    deleteConfirmation,
    handleCreate,
    handleView,
    handleEdit,
    handleDelete,
    handleBulkDelete,
    handleModalSubmit,
    handleModalClose,
    handleDeleteConfirmationClose,
    setSelectedRows,
    checkExists: checkExistsMutation.mutate,
    checkExistsLoading: checkExistsMutation.isPending,
  }
} 