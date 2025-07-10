import { useState, useCallback } from 'react'
import type { Student, CreateStudentData } from '../types'

// Mock data for development
const mockStudents: Student[] = [
  {
    id: '1',
    first_name: 'John',
    middle_name: 'Michael',
    last_name: 'Doe',
    ext_name: 'Jr.',
    birthdate: '2008-05-15',
    gender: 'male',
    religion: 'CATHOLIC',
    lrn: '123456789012',
    profile_picture: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: '2',
    first_name: 'Jane',
    middle_name: 'Elizabeth',
    last_name: 'Smith',
    ext_name: '',
    birthdate: '2009-03-22',
    gender: 'female',
    religion: 'ISLAM',
    lrn: '234567890123',
    profile_picture: 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150&h=150&fit=crop&crop=face',
    created_at: '2024-01-02T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
  },
  {
    id: '3',
    first_name: 'Carlos',
    middle_name: 'Miguel',
    last_name: 'Santos',
    ext_name: 'III',
    birthdate: '2007-11-08',
    gender: 'male',
    religion: 'IGLESIA NI CRISTO',
    lrn: '345678901234',
    created_at: '2024-01-03T00:00:00Z',
    updated_at: '2024-01-03T00:00:00Z',
  },
  {
    id: '4',
    first_name: 'Maria',
    middle_name: 'Clara',
    last_name: 'Garcia',
    ext_name: '',
    birthdate: '2008-07-14',
    gender: 'female',
    religion: 'BAPTISTS',
    lrn: '456789012345',
    profile_picture: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face',
    created_at: '2024-01-04T00:00:00Z',
    updated_at: '2024-01-04T00:00:00Z',
  },
  {
    id: '5',
    first_name: 'Ahmed',
    middle_name: 'Hassan',
    last_name: 'Al-Rashid',
    ext_name: '',
    birthdate: '2009-01-30',
    gender: 'male',
    religion: 'ISLAM',
    lrn: '567890123456',
    created_at: '2024-01-05T00:00:00Z',
    updated_at: '2024-01-05T00:00:00Z',
  },
]

export function useStudents() {
  const [students, setStudents] = useState<Student[]>(mockStudents)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchValue, setSearchValue] = useState('')
  const search = {
    value: searchValue,
    onSearch: (value: string) => setSearchValue(value)
  }
  const [selectedRows, setSelectedRows] = useState<Student[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingStudent, setEditingStudent] = useState<Student | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [modalSuccess, setModalSuccess] = useState<string | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState({
    isOpen: false,
    student: null as Student | null,
    title: '',
    message: '',
    onConfirm: () => {},
    loading: false,
  })

  // Filter students based on search
  const filteredStudents = students.filter(student => {
    if (!searchValue) return true
    const fullName = `${student.first_name} ${student.middle_name || ''} ${student.last_name} ${student.ext_name || ''}`.toLowerCase()
    return fullName.includes(searchValue.toLowerCase())
  })

  const handleCreate = useCallback(() => {
    setEditingStudent(null)
    setIsModalOpen(true)
    setModalError(null)
    setModalSuccess(null)
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
        // Simulate API call
        setTimeout(() => {
          setStudents(prev => prev.filter(s => s.id !== student.id))
          setDeleteConfirmation(prev => ({ ...prev, isOpen: false, loading: false }))
        }, 1000)
      },
      loading: false,
    })
  }, [])

  const handleBulkDelete = useCallback(() => {
    if (selectedRows.length === 0) return

    setDeleteConfirmation({
      isOpen: true,
      student: null,
      title: 'Delete Multiple Students',
      message: `Are you sure you want to delete ${selectedRows.length} student(s)? This action cannot be undone.`,
      onConfirm: () => {
        setDeleteConfirmation(prev => ({ ...prev, loading: true }))
        // Simulate API call
        setTimeout(() => {
          const studentIds = selectedRows.map(s => s.id)
          setStudents(prev => prev.filter(s => !studentIds.includes(s.id)))
          setSelectedRows([])
          setDeleteConfirmation(prev => ({ ...prev, isOpen: false, loading: false }))
        }, 1000)
      },
      loading: false,
    })
  }, [selectedRows])

  const handleModalSubmit = useCallback(async (data: CreateStudentData) => {
    setModalLoading(true)
    setModalError(null)
    setModalSuccess(null)

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000))

      if (editingStudent) {
        // Update existing student
        const updatedStudent: Student = {
          ...editingStudent,
          ...data,
          updated_at: new Date().toISOString(),
        }
        setStudents(prev => prev.map(s => s.id === editingStudent.id ? updatedStudent : s))
        setModalSuccess('Student updated successfully!')
      } else {
        // Create new student
        const newStudent: Student = {
          id: Date.now().toString(),
          ...data,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        setStudents(prev => [...prev, newStudent])
        setModalSuccess('Student created successfully!')
      }

      // Close modal after success
      setTimeout(() => {
        setIsModalOpen(false)
        setModalSuccess(null)
      }, 1500)
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setModalLoading(false)
    }
  }, [editingStudent])

  const handleModalClose = useCallback(() => {
    setIsModalOpen(false)
    setEditingStudent(null)
    setModalError(null)
    setModalSuccess(null)
  }, [])

  const handleDeleteConfirmationClose = useCallback(() => {
    setDeleteConfirmation(prev => ({ ...prev, isOpen: false }))
  }, [])

  // Mock pagination
  const pagination = {
    currentPage: 1,
    totalPages: 1,
    totalItems: filteredStudents.length,
    onPageChange: (page: number) => {
      // In a real app, this would fetch data for the specific page
      console.log('Navigate to page:', page)
    },
  }

  return {
    students: filteredStudents,
    loading,
    error,
    pagination,
    search,
    selectedRows,
    isModalOpen,
    editingStudent,
    modalLoading,
    modalError,
    deleteConfirmation,
    handleCreate,
    handleView,
    handleDelete,
    handleBulkDelete,
    handleModalSubmit,
    handleModalClose,
    handleDeleteConfirmationClose,
    setSelectedRows,
    modalSuccess,
  }
} 