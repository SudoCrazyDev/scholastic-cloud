import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { classSectionService } from '../../services/classSectionService'
import { subjectService } from '../../services/subjectService'
import { studentService } from '../../services/studentService'
import { Alert } from '../../components/alert'
import { Button } from '../../components/button'
import { Badge } from '../../components/badge'
import { ConfirmationModal } from '../../components/ConfirmationModal'
import { StudentAssignmentModal } from './components/StudentAssignmentModal'
import { CreateStudentModal } from './components/CreateStudentModal'
import { StudentModal } from '../Students/components/StudentModal'
import { ClassSectionSubjectModal } from '../ClassSections/components/ClassSectionSubjectModal'
import { SubjectList } from './components/SubjectList'
import StudentRankingTab from './components/StudentRankingTab'
import { useAuth } from '../../hooks/useAuth'
import {
  ArrowLeft,
  Users,
  BookOpen,
  Calendar,
  User,
  Building2,
  Loader2,
  UserCheck,
  Plus,
  Trash2,
  Search,
  Edit,
  Trophy,
  FileText,
  BarChart3,
  Download,
  Eye
} from 'lucide-react'
import type { Student, Subject } from '../../types'

const ClassSectionDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<'students' | 'subjects' | 'ranking' | 'report-cards' | 'consolidated-grades'>('students')
  const [showAssignmentModal, setShowAssignmentModal] = useState(false)
  const [showCreateStudentModal, setShowCreateStudentModal] = useState(false)
  const [showRemoveModal, setShowRemoveModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [studentToRemove, setStudentToRemove] = useState<{ id: string; name: string; assignmentId: string } | null>(null)
  const [studentToEdit, setStudentToEdit] = useState<Student | null>(null)
  const [editModalError, setEditModalError] = useState<string | null>(null)
  const [editModalSuccess, setEditModalSuccess] = useState<string | null>(null)
  const [studentSearchTerm, setStudentSearchTerm] = useState('')

  // Subject-related state
  const [showSubjectModal, setShowSubjectModal] = useState(false)
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null)
  const [subjectModalError, setSubjectModalError] = useState<string | null>(null)
  const [subjectModalSuccess, setSubjectModalSuccess] = useState<string | null>(null)
  const [subjectDeleteConfirmation, setSubjectDeleteConfirmation] = useState<{
    isOpen: boolean
    subject: Subject | null
    loading: boolean
  }>({
    isOpen: false,
    subject: null,
    loading: false
  })

  // Report cards and consolidated grades state
  const [selectedQuarter, setSelectedQuarter] = useState('1st Quarter')

  const institutionId = user?.user_institutions?.[0]?.institution_id || ''

  // Fetch class section details
  const {
    data: classSection,
    isLoading: classSectionLoading,
    error: classSectionError,
  } = useQuery({
    queryKey: ['class-section', id],
    queryFn: () => classSectionService.getClassSection(id!),
    enabled: !!id,
  })

  // Fetch subjects for this class section
  const {
    data: subjectsResponse,
    isLoading: subjectsLoading,
    error: subjectsError,
    refetch: refetchSubjects
  } = useQuery({
    queryKey: ['subjects', { class_section_id: id }],
    queryFn: () => subjectService.getSubjects({ class_section_id: id }),
    enabled: !!id,
  })

  // Fetch students for this class section
  const {
    data: studentsResponse,
    isLoading: studentsLoading,
    error: studentsError,
    refetch: refetchStudents
  } = useQuery({
    queryKey: ['students-by-section', id],
    queryFn: () => studentService.getStudentsByClassSection(id!),
    enabled: !!id,
  })

  const subjects = subjectsResponse?.data || []
  const students = studentsResponse?.data?.map((item: { student: Student; id: string }) => ({
    ...item.student,
    assignmentId: item.id
  })) || []
  const classSectionData = classSection?.data

  // Subject mutations
  const createSubjectMutation = useMutation({
    mutationFn: (data: any) => subjectService.createSubject(data),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['subjects', { class_section_id: id }] })
      refetchSubjects()
      setSubjectModalSuccess('Subject created successfully!')
      setTimeout(() => setSubjectModalSuccess(null), 3000)
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to create subject'
      setSubjectModalError(message)
      setTimeout(() => setSubjectModalError(null), 5000)
    }
  })

  const updateSubjectMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => subjectService.updateSubject(id, data),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['subjects', { class_section_id: id }] })
      refetchSubjects()
      setSubjectModalSuccess('Subject updated successfully!')
      setTimeout(() => setSubjectModalSuccess(null), 3000)
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to update subject'
      setSubjectModalError(message)
      setTimeout(() => setSubjectModalError(null), 5000)
    }
  })

  const deleteSubjectMutation = useMutation({
    mutationFn: (id: string) => subjectService.deleteSubject(id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['subjects', { class_section_id: id }] })
      refetchSubjects()
      setSubjectDeleteConfirmation({ isOpen: false, subject: null, loading: false })
    },
    onError: (error: any) => {
      console.error('Failed to delete subject:', error)
      setSubjectDeleteConfirmation(prev => ({ ...prev, loading: false }))
    }
  })

  const reorderSubjectsMutation = useMutation({
    mutationFn: (subjectOrders: Array<{ id: string; order: number }>) => 
      subjectService.reorderSubjects(id!, subjectOrders),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['subjects', { class_section_id: id }] })
      refetchSubjects()
    },
    onError: (error: any) => {
      console.error('Failed to reorder subjects:', error)
    }
  })

  // Remove student mutation
  const removeStudentMutation = useMutation({
    mutationFn: (assignmentId: string) => studentService.removeStudentFromSection(assignmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students-by-section', id] })
      setShowRemoveModal(false)
      setStudentToRemove(null)
    },
    onError: (error: unknown) => {
      console.error('Failed to remove student:', error)
    }
  })

  const getFullName = (user: { first_name?: string; middle_name?: string; last_name?: string; ext_name?: string }) => {
    const parts = [user?.first_name, user?.middle_name, user?.last_name, user?.ext_name]
    return parts.filter(Boolean).join(' ')
  }

  // Filter students by search term
  const filteredStudents = students.filter(student => {
    if (!studentSearchTerm) return true
    const fullName = getFullName(student).toLowerCase()
    const lrn = student.lrn.toLowerCase()
    return fullName.includes(studentSearchTerm.toLowerCase()) || lrn.includes(studentSearchTerm.toLowerCase())
  })

  // Group students by gender and sort alphabetically
  const groupedStudents: Record<string, Student[]> = filteredStudents.reduce((acc, student) => {
    const gender = student.gender
    if (!acc[gender]) {
      acc[gender] = []
    }
    acc[gender].push(student)
    return acc
  }, {} as Record<string, Student[]>)

  // Sort students alphabetically within each gender group
  Object.keys(groupedStudents).forEach(gender => {
    groupedStudents[gender].sort((a: Student, b: Student) => {
      const nameA = `${a.last_name} ${a.first_name} ${a.middle_name || ''}`.toLowerCase()
      const nameB = `${b.last_name} ${b.first_name} ${b.middle_name || ''}`.toLowerCase()
      return nameA.localeCompare(nameB)
    })
  })

  // Subject handlers
  const handleCreateSubject = () => {
    setEditingSubject(null)
    setSubjectModalError(null)
    setSubjectModalSuccess(null)
    setShowSubjectModal(true)
  }

  const handleEditSubject = (subject: Subject) => {
    setEditingSubject(subject)
    setSubjectModalError(null)
    setSubjectModalSuccess(null)
    setShowSubjectModal(true)
  }

  const handleDeleteSubject = (subject: Subject) => {
    setSubjectDeleteConfirmation({
      isOpen: true,
      subject,
      loading: false
    })
  }

  const handleSubjectSubmit = async (data: any) => {
    try {
      if (editingSubject) {
        await updateSubjectMutation.mutateAsync({ id: editingSubject.id, data })
      } else {
        await createSubjectMutation.mutateAsync(data)
      }
      setShowSubjectModal(false)
    } catch (error) {
      // Error is handled in mutation onError
    }
  }

  const handleSubjectModalClose = () => {
    setShowSubjectModal(false)
    setEditingSubject(null)
    setSubjectModalError(null)
    setSubjectModalSuccess(null)
  }

  const handleReorderSubjects = async (subjectOrders: Array<{ id: string; order: number }>) => {
    await reorderSubjectsMutation.mutateAsync(subjectOrders)
  }

  const handleAssignmentSuccess = () => {
    refetchStudents()
  }

  const handleEditStudent = (student: Student) => {
    setStudentToEdit(student)
    setShowEditModal(true)
  }

  const handleEditSuccess = () => {
    refetchStudents()
    setEditModalSuccess('Student updated successfully!')
    setTimeout(() => setEditModalSuccess(null), 3000)
  }

  const handleEditError = (error: string) => {
    setEditModalError(error)
    setTimeout(() => setEditModalError(null), 5000)
  }

  const handleRemoveStudent = (student: Student & { assignmentId: string }) => {
    setStudentToRemove({
      id: student.id,
      name: getFullName(student),
      assignmentId: student.assignmentId
    })
    setShowRemoveModal(true)
  }

  const handleConfirmRemove = () => {
    if (studentToRemove) {
      removeStudentMutation.mutate(studentToRemove.assignmentId)
    }
  }

  // Report cards and consolidated grades handlers
  const handleViewReportCard = (studentId: string) => {
    console.log('View report card for student:', studentId)
    // Placeholder for PDF viewing functionality
  }

  const handleDownloadReportCard = (studentId: string) => {
    console.log('Download report card for student:', studentId)
    // Placeholder for PDF download functionality
  }

  const handleViewConsolidatedGrades = () => {
    console.log('View consolidated grades for quarter:', selectedQuarter)
    // Placeholder for PDF viewing functionality
  }

  const handleDownloadConsolidatedGrades = () => {
    console.log('Download consolidated grades for quarter:', selectedQuarter)
    // Placeholder for PDF download functionality
  }

  if (classSectionLoading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center justify-center py-12"
      >
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </motion.div>
    )
  }

  if (classSectionError || !classSectionData) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-6"
      >
        <Alert
          type="error"
          title="Error Loading Class Section"
          message="Failed to load class section details. Please try again."
          show={true}
        />
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            onClick={() => navigate('/my-class-sections')}
            variant="outline"
            size="sm"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{classSectionData.title}</h1>
            <p className="text-gray-600 mt-1">
              {classSectionData.grade_level} • {classSectionData.academic_year || 'Current Year'}
            </p>
          </div>
        </div>
        <Badge color="indigo">
          {classSectionData.grade_level}
        </Badge>
      </div>

      {/* Class Section Info */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white rounded-lg border border-gray-200 p-6"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex items-center space-x-3">
            <Building2 className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-900">Institution</p>
              <p className="text-sm text-gray-600">ID: {classSectionData.institution_id}</p>
            </div>
          </div>
          
          {classSectionData.adviser && (
            <div className="flex items-center space-x-3">
              <UserCheck className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-900">Adviser</p>
                <p className="text-sm text-gray-600">{getFullName(classSectionData.adviser)}</p>
              </div>
            </div>
          )}

          {classSectionData.academic_year && (
            <div className="flex items-center space-x-3">
              <Calendar className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-900">Academic Year</p>
                <p className="text-sm text-gray-600">{classSectionData.academic_year}</p>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-lg border border-gray-200"
      >
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('students')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'students'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4" />
                <span>Students ({students.length})</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('subjects')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'subjects'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <BookOpen className="w-4 h-4" />
                <span>Subjects ({subjects.length})</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('ranking')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'ranking'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Trophy className="w-4 h-4" />
                <span>Student Ranking</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('report-cards')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'report-cards'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4" />
                <span>Report Cards</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('consolidated-grades')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'consolidated-grades'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <BarChart3 className="w-4 h-4" />
                <span>Consolidated Grades</span>
              </div>
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          <AnimatePresence mode="wait">
            {activeTab === 'students' && (
              <motion.div
                key="students"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                {/* Class Summary */}
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-4 mb-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-indigo-600">
                        {studentSearchTerm ? `${filteredStudents.length}/${students.length}` : students.length}
                      </div>
                      <div className="text-sm text-gray-600">
                        {studentSearchTerm ? 'Filtered/Total' : 'Total Students'}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {groupedStudents.male?.length || 0}
                      </div>
                      <div className="text-sm text-gray-600">Male Students</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-pink-600">
                        {groupedStudents.female?.length || 0}
                      </div>
                      <div className="text-sm text-gray-600">Female Students</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{subjects.length}</div>
                      <div className="text-sm text-gray-600">Subjects</div>
                    </div>
                  </div>
                </div>

                {/* Add Students Button and Search */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                  <h3 className="text-lg font-medium text-gray-900">Class Students</h3>
                  <div className="flex items-center space-x-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input
                        type="text"
                        placeholder="Search students..."
                        value={studentSearchTerm}
                        onChange={(e) => setStudentSearchTerm(e.target.value)}
                        className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                      />
                    </div>
                    <Button
                      onClick={() => setShowCreateStudentModal(true)}
                      size="sm"
                      variant="outline"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Create Student
                    </Button>
                    <Button
                      onClick={() => setShowAssignmentModal(true)}
                      size="sm"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Assign Students
                    </Button>
                  </div>
                </div>

                {studentsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                  </div>
                ) : studentsError ? (
                  <Alert
                    type="error"
                    message="Failed to load students"
                    show={true}
                  />
                ) : filteredStudents.length === 0 ? (
                  <div className="text-center py-8">
                    <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No students found</h3>
                    <p className="text-gray-600 mb-4">
                      {studentSearchTerm 
                        ? `No students match "${studentSearchTerm}". Try a different search term.`
                        : 'No students have been assigned to this class section yet.'
                      }
                    </p>
                    {!studentSearchTerm && (
                      <Button
                        onClick={() => setShowAssignmentModal(true)}
                        variant="outline"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Students
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-6">
                    {Object.entries(groupedStudents).map(([gender, studentsList]) => (
                      <div key={gender} className="space-y-3">
                        <div className="flex items-center space-x-2">
                          {gender === 'male' ? (
                            <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                              <span className="text-white text-xs font-bold">M</span>
                            </div>
                          ) : gender === 'female' ? (
                            <div className="w-5 h-5 bg-pink-500 rounded-full flex items-center justify-center">
                              <span className="text-white text-xs font-bold">F</span>
                            </div>
                          ) : (
                            <User className="w-5 h-5 text-gray-500" />
                          )}
                          <h3 className="text-lg font-semibold text-gray-900 capitalize">
                            {gender} Students ({studentsList.length})
                          </h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {(studentsList as (Student & { assignmentId: string })[]).map((student: Student & { assignmentId: string }, index: number) => (
                            <motion.div
                              key={student.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: index * 0.05 }}
                              className="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:border-gray-300 transition-colors cursor-pointer group"
                              onClick={() => navigate(`/students/${student.id}`)}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3 flex-1">
                                  <div className="flex-shrink-0">
                                    {student.profile_picture ? (
                                      <img
                                        src={student.profile_picture}
                                        alt={getFullName(student)}
                                        className="w-12 h-12 rounded-full object-cover border-2 border-gray-200 group-hover:border-indigo-300 transition-colors"
                                      />
                                    ) : (
                                      <div className="w-12 h-12 bg-gray-300 rounded-full flex items-center justify-center border-2 border-gray-200 group-hover:border-indigo-300 transition-colors">
                                        <User className="w-6 h-6 text-gray-600" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate group-hover:text-indigo-600 transition-colors">
                                      {getFullName(student)}
                                    </p>
                                    <div className="flex items-center space-x-2 mt-1">
                                      <Badge color={student.gender === 'male' ? 'blue' : 'pink'} className="text-xs px-1 py-0.5">
                                        {student.gender === 'male' ? 'M' : 'F'}
                                      </Badge>
                                      <span className="text-xs text-gray-500">LRN: {student.lrn}</span>
                                    </div>
                                    {student.religion && (
                                      <p className="text-xs text-gray-500 mt-1">
                                        {student.religion}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center space-x-1">
                                  <Button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleEditStudent(student)
                                    }}
                                    variant="ghost"
                                    size="sm"
                                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-all"
                                    title="Edit student information"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      navigate(`/students/${student.id}`)
                                    }}
                                    variant="ghost"
                                    size="sm"
                                    className="text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 opacity-0 group-hover:opacity-100 transition-all"
                                    title="View student details"
                                  >
                                    <User className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleRemoveStudent(student)
                                    }}
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                                    disabled={removeStudentMutation.isPending}
                                    title="Remove student from class"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'subjects' && (
              <motion.div
                key="subjects"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <SubjectList
                  subjects={subjects}
                  loading={subjectsLoading}
                  error={subjectsError}
                  onCreateSubject={handleCreateSubject}
                  onEditSubject={handleEditSubject}
                  onDeleteSubject={handleDeleteSubject}
                  onReorderSubjects={handleReorderSubjects}
                  reordering={reorderSubjectsMutation.isPending}
                  onRefetch={refetchSubjects}
                />
              </motion.div>
            )}

            {activeTab === 'ranking' && (
              <motion.div
                key="ranking"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <StudentRankingTab
                  students={students}
                  classSectionTitle={classSectionData?.title || 'Class Section'}
                />
              </motion.div>
            )}

            {activeTab === 'report-cards' && (
              <motion.div
                key="report-cards"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <div className="space-y-6">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="text"
                      placeholder="Search students..."
                      value={studentSearchTerm}
                      onChange={(e) => setStudentSearchTerm(e.target.value)}
                      className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm w-full"
                    />
                  </div>

                  {/* Students List */}
                  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200">
                      <h3 className="text-lg font-medium text-gray-900">Student Report Cards</h3>
                      <p className="text-sm text-gray-600 mt-1">View and download individual student report cards</p>
                    </div>
                    
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Student Name
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Grade Level
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Section
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Status
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {filteredStudents.map((student) => (
                            <tr key={student.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900">{getFullName(student)}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-900">{classSectionData.grade_level}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-900">{classSectionData.title}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <Badge color="green" className="text-xs">
                                  Active
                                </Badge>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <div className="flex items-center justify-end space-x-2">
                                  <Button
                                    onClick={() => handleViewReportCard(student.id)}
                                    variant="outline"
                                    size="sm"
                                  >
                                    <Eye className="w-4 h-4 mr-1" />
                                    View
                                  </Button>
                                  <Button
                                    onClick={() => handleDownloadReportCard(student.id)}
                                    variant="solid"
                                    color="primary"
                                    size="sm"
                                  >
                                    <Download className="w-4 h-4 mr-1" />
                                    Download
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'consolidated-grades' && (
              <motion.div
                key="consolidated-grades"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <div className="space-y-6">
                  {/* Quarter Filter */}
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-gray-700">Quarter:</span>
                      <select
                        value={selectedQuarter}
                        onChange={(e) => setSelectedQuarter(e.target.value)}
                        className="w-48 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        {['1st Quarter', '2nd Quarter', '3rd Quarter', '4th Quarter'].map((quarter) => (
                          <option key={quarter} value={quarter}>
                            {quarter}
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Button
                        onClick={handleViewConsolidatedGrades}
                        variant="outline"
                        size="sm"
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        View PDF
                      </Button>
                      <Button
                        onClick={handleDownloadConsolidatedGrades}
                        variant="solid"
                        color="primary"
                        size="sm"
                      >
                        <Download className="w-4 h-4 mr-1" />
                        Download PDF
                      </Button>
                    </div>
                  </div>

                  {/* Consolidated Grades Preview */}
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-medium text-gray-900">Consolidated Grades - {selectedQuarter}</h3>
                        <p className="text-sm text-gray-600 mt-1">All students' subject grades for the selected quarter</p>
                      </div>
                    </div>
                    
                    <div className="bg-gray-50 rounded-lg p-8 text-center">
                      <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <h4 className="text-lg font-medium text-gray-900 mb-2">Consolidated Grades Report</h4>
                      <p className="text-gray-600 mb-4">
                        This will display a comprehensive PDF report showing all students' grades across all subjects for {selectedQuarter.toLowerCase()}.
                      </p>
                      <div className="flex items-center justify-center space-x-4">
                        <Button
                          onClick={handleViewConsolidatedGrades}
                          variant="outline"
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          Preview Report
                        </Button>
                        <Button
                          onClick={handleDownloadConsolidatedGrades}
                          variant="solid"
                          color="primary"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download Report
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Create Student Modal */}
      {classSectionData && (
        <CreateStudentModal
          isOpen={showCreateStudentModal}
          onClose={() => setShowCreateStudentModal(false)}
          classSection={classSectionData}
          onSuccess={handleAssignmentSuccess}
        />
      )}

      {/* Student Assignment Modal */}
      {classSectionData && (
        <StudentAssignmentModal
          isOpen={showAssignmentModal}
          onClose={() => setShowAssignmentModal(false)}
          classSection={classSectionData}
          onSuccess={handleAssignmentSuccess}
        />
      )}

      {/* Student Edit Modal */}
      <StudentModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false)
          setStudentToEdit(null)
          setEditModalError(null)
          setEditModalSuccess(null)
        }}
        student={studentToEdit}
        onSubmit={async (data) => {
          try {
            if (studentToEdit) {
              await studentService.updateStudent(studentToEdit.id, data)
              handleEditSuccess()
            }
          } catch (error: unknown) {
            const errorMessage = error && typeof error === 'object' && 'response' in error 
              ? ((error.response as { data?: { message?: string } })?.data?.message) || 'Failed to update student'
              : 'Failed to update student'
            handleEditError(errorMessage)
            throw error
          }
        }}
        loading={false}
        error={editModalError}
        success={editModalSuccess}
      />

      {/* Subject Modal */}
      <ClassSectionSubjectModal
        isOpen={showSubjectModal}
        onClose={handleSubjectModalClose}
        onSubmit={handleSubjectSubmit}
        subject={editingSubject}
        classSectionId={id!}
        institutionId={institutionId}
        parentSubjects={subjects.filter(s => s.subject_type === 'parent')}
        loading={createSubjectMutation.isPending || updateSubjectMutation.isPending}
        error={subjectModalError}
      />

      {/* Remove Student Confirmation Modal */}
      <ConfirmationModal
        isOpen={showRemoveModal}
        onClose={() => {
          setShowRemoveModal(false)
          setStudentToRemove(null)
        }}
        onConfirm={handleConfirmRemove}
        title="Remove Student"
        message={`Are you sure you want to remove ${studentToRemove?.name} from this class section? This action cannot be undone.`}
        confirmText="Remove"
        cancelText="Cancel"
        variant="danger"
        loading={removeStudentMutation.isPending}
      />

      {/* Delete Subject Confirmation Modal */}
      <ConfirmationModal
        isOpen={subjectDeleteConfirmation.isOpen}
        onClose={() => setSubjectDeleteConfirmation({ isOpen: false, subject: null, loading: false })}
        onConfirm={() => {
          if (subjectDeleteConfirmation.subject) {
            setSubjectDeleteConfirmation(prev => ({ ...prev, loading: true }))
            deleteSubjectMutation.mutate(subjectDeleteConfirmation.subject.id)
          }
        }}
        title="Delete Subject"
        message={`Are you sure you want to delete "${subjectDeleteConfirmation.subject?.title}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        loading={subjectDeleteConfirmation.loading}
      />
    </motion.div>
  )
}

export default ClassSectionDetail 