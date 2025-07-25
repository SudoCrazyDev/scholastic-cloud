import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { classSectionService } from '../../services/classSectionService'
import { subjectService } from '../../services/subjectService'
import { studentService } from '../../services/studentService'
import { Alert } from '../../components/alert'
import { ConfirmationModal } from '../../components/ConfirmationModal'
import { StudentAssignmentModal } from './components/StudentAssignmentModal'
import { CreateStudentModal } from './components/CreateStudentModal'
import { StudentModal } from '../Students/components/StudentModal'
import { ClassSectionSubjectModal } from '../ClassSections/components/ClassSectionSubjectModal'
import StudentRankingTab from './components/StudentRankingTab'
import { useAuth } from '../../hooks/useAuth'
import {
  ArrowLeft,
  Users,
  BookOpen,
  Loader2,
  Trophy,
  FileText,
  BarChart3,
  Award
} from 'lucide-react'
import type { Student, Subject } from '../../types'
import ClassSectionHeader from './components/ClassSectionHeader';
import ClassSectionStudentsTab from './components/ClassSectionStudentsTab';
import ClassSectionRankingTab from './components/ClassSectionRankingTab';
import ClassSectionReportCardsTab from './components/ClassSectionReportCardsTab';
import ClassSectionConsolidatedGradesTab from './components/ClassSectionConsolidatedGradesTab';
import ClassSectionSubjectsTab from './components/ClassSectionSubjectsTab';
import ClassSectionCoreValuesTab from './components/ClassSectionCoreValuesTab';
import { Select } from '../../components/select';

const ClassSectionDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<'students' | 'subjects' | 'ranking' | 'report-cards' | 'consolidated-grades' | 'core-values'>('students')
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
  const [selectedQuarter, setSelectedQuarter] = useState<string>('1')

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
  const groupedStudents: Record<string, (Student & { assignmentId: string })[]> = students.reduce((acc, student) => {
    const gender = student.gender;
    if (!acc[gender]) {
      acc[gender] = [];
    }
    acc[gender].push(student);
    return acc;
  }, {} as Record<string, (Student & { assignmentId: string })[]>);

  // Sort students alphabetically within each gender group
  Object.keys(groupedStudents).forEach(gender => {
    groupedStudents[gender].sort((a, b) => {
      const nameA = `${a.last_name} ${a.first_name} ${a.middle_name || ''}`.toLowerCase();
      const nameB = `${b.last_name} ${b.first_name} ${b.middle_name || ''}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });
  });

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
      className="space-y-8 min-h-screen py-8 px-2 sm:px-6 lg:px-12"
    >
      {/* Back Button */}
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-2 px-4 py-2 mb-4 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
      >
        <ArrowLeft className="w-5 h-5" />
        <span className="font-medium">Back to Sections</span>
      </button>
      {/* Header */}
      <ClassSectionHeader classSectionData={classSectionData} getFullName={getFullName} user={user} />

      {/* Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white/90 rounded-2xl border border-gray-200 shadow-lg backdrop-blur-md"
      >
        <div className="sticky top-0 z-20 border-b border-gray-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 transition-shadow">
          <nav
            className="flex overflow-x-auto no-scrollbar space-x-2 sm:space-x-8 px-2 sm:px-6 py-1 sm:py-0"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <button
              onClick={() => setActiveTab('students')}
              className={`py-3 px-2 sm:py-4 sm:px-1 border-b-2 font-medium text-sm transition-all duration-200 rounded-t-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                activeTab === 'students'
                  ? 'border-indigo-500 text-indigo-700 bg-indigo-50 shadow-sm'
                  : 'border-transparent text-gray-500 hover:text-indigo-600 hover:bg-indigo-50/60 hover:border-indigo-200'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4" />
                <span>Students ({students.length})</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('subjects')}
              className={`py-3 px-2 sm:py-4 sm:px-1 border-b-2 font-medium text-sm transition-all duration-200 rounded-t-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                activeTab === 'subjects'
                  ? 'border-indigo-500 text-indigo-700 bg-indigo-50 shadow-sm'
                  : 'border-transparent text-gray-500 hover:text-indigo-600 hover:bg-indigo-50/60 hover:border-indigo-200'
              }`}
            >
              <div className="flex items-center space-x-2">
                <BookOpen className="w-4 h-4" />
                <span>Subjects ({subjects.length})</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('ranking')}
              className={`py-3 px-2 sm:py-4 sm:px-1 border-b-2 font-medium text-sm transition-all duration-200 rounded-t-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                activeTab === 'ranking'
                  ? 'border-indigo-500 text-indigo-700 bg-indigo-50 shadow-sm'
                  : 'border-transparent text-gray-500 hover:text-indigo-600 hover:bg-indigo-50/60 hover:border-indigo-200'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Trophy className="w-4 h-4" />
                <span>Student Ranking</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('report-cards')}
              className={`py-3 px-2 sm:py-4 sm:px-1 border-b-2 font-medium text-sm transition-all duration-200 rounded-t-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                activeTab === 'report-cards'
                  ? 'border-indigo-500 text-indigo-700 bg-indigo-50 shadow-sm'
                  : 'border-transparent text-gray-500 hover:text-indigo-600 hover:bg-indigo-50/60 hover:border-indigo-200'
              }`}
            >
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4" />
                <span>Report Cards</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('consolidated-grades')}
              className={`py-3 px-2 sm:py-4 sm:px-1 border-b-2 font-medium text-sm transition-all duration-200 rounded-t-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                activeTab === 'consolidated-grades'
                  ? 'border-indigo-500 text-indigo-700 bg-indigo-50 shadow-sm'
                  : 'border-transparent text-gray-500 hover:text-indigo-600 hover:bg-indigo-50/60 hover:border-indigo-200'
              }`}
            >
              <div className="flex items-center space-x-2">
                <BarChart3 className="w-4 h-4" />
                <span>Consolidated Grades</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('core-values')}
              className={`py-3 px-2 sm:py-4 sm:px-1 border-b-2 font-medium text-sm transition-all duration-200 rounded-t-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                activeTab === 'core-values'
                  ? 'border-indigo-500 text-indigo-700 bg-indigo-50 shadow-sm'
                  : 'border-transparent text-gray-500 hover:text-indigo-600 hover:bg-indigo-50/60 hover:border-indigo-200'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Award className="w-4 h-4" />
                <span>Core Values</span>
              </div>
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-4 sm:p-8 min-h-[300px]">
          {/* Quarter Filter for Consolidated Grades */}
          {activeTab === 'consolidated-grades' && (
            <div className="mb-4 flex items-center gap-2">
              <span className="text-sm text-gray-700 font-medium">Quarter:</span>
              <div className="min-w-[140px]">
                <Select
                  options={[
                    { value: '1', label: 'First Quarter' },
                    { value: '2', label: 'Second Quarter' },
                    { value: '3', label: 'Third Quarter' },
                    { value: '4', label: 'Fourth Quarter' },
                  ]}
                  value={selectedQuarter}
                  onChange={e => setSelectedQuarter(e.target.value)}
                />
              </div>
            </div>
          )}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.25 }}
            >
              {activeTab === 'students' && (
                <ClassSectionStudentsTab
                  students={students}
                  groupedStudents={groupedStudents}
                  subjects={subjects}
                  studentSearchTerm={studentSearchTerm}
                  setStudentSearchTerm={setStudentSearchTerm}
                  onCreateStudent={() => setShowCreateStudentModal(true)}
                  onAssignStudents={() => setShowAssignmentModal(true)}
                  onEditStudent={handleEditStudent}
                  onRemoveStudent={handleRemoveStudent}
                  studentsLoading={studentsLoading}
                  studentsError={studentsError}
                  removeStudentMutationPending={removeStudentMutation.isPending}
                  getFullName={getFullName}
                  navigate={navigate}
                />
              )}

              {activeTab === 'subjects' && (
                <motion.div
                  key="subjects"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <ClassSectionSubjectsTab
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
                  <ClassSectionRankingTab
                    students={students}
                    classSectionTitle={classSectionData?.title || 'Class Section'}
                    sectionId={id!}
                    quarter={Number(selectedQuarter)}
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
                  <ClassSectionReportCardsTab
                    filteredStudents={filteredStudents}
                    classSectionData={classSectionData}
                    getFullName={getFullName}
                    studentSearchTerm={studentSearchTerm}
                    setStudentSearchTerm={setStudentSearchTerm}
                    handleViewReportCard={handleViewReportCard}
                    handleDownloadReportCard={handleDownloadReportCard}
                  />
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
                  <ClassSectionConsolidatedGradesTab
                    sectionId={id!}
                    selectedQuarter={Number(selectedQuarter)}
                  />
                </motion.div>
              )}

              {activeTab === 'core-values' && (
                <motion.div
                  key="core-values"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <ClassSectionCoreValuesTab
                    classSectionId={id!}
                    classSectionData={classSectionData}
                  />
                </motion.div>
              )}
            </motion.div>
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