import React, { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { classSectionService } from '../../services/classSectionService'
import { subjectService } from '../../services/subjectService'
import { studentService } from '../../services/studentService'
import { studentRunningGradeService } from '../../services/studentRunningGradeService'
import { institutionService } from '../../services/institutionService'
import { Alert } from '../../components/alert'
import { ConfirmationModal } from '../../components/ConfirmationModal'
import { ReportCardModal } from '../../components/ReportCardModal'
import { StudentReportCardModal } from '../../components/StudentReportCardModal'
import { StudentAssignmentModal } from './components/StudentAssignmentModal'
import { CreateStudentModal } from './components/CreateStudentModal'
import { StudentModal } from '../Students/components/StudentModal'
import { ClassSectionSubjectModal } from '../ClassSections/components/ClassSectionSubjectModal'
import { useAuth } from '../../hooks/useAuth'
import { useClassSectionDetailMutations } from '../../hooks/useClassSectionDetailMutations'
import {
  ArrowLeft,
  Users,
  BookOpen,
  Loader2,
  Trophy,
  FileText,
  BarChart3,
  Award,
  Calendar
} from 'lucide-react'
import type { Student, Subject, StudentSubjectGrade } from '../../types'
import ClassSectionHeader from './components/ClassSectionHeader'
import ClassSectionStudentsTab from './components/ClassSectionStudentsTab'
import ClassSectionRankingTab from './components/ClassSectionRankingTab'
import ClassSectionReportCardsTab from './components/ClassSectionReportCardsTab'
import ClassSectionConsolidatedGradesTab from './components/ClassSectionConsolidatedGradesTab'
import ClassSectionSubjectsTab from './components/ClassSectionSubjectsTab'
import ClassSectionCoreValuesTab from './components/ClassSectionCoreValuesTab'
import ClassSectionAttendanceTab from './components/ClassSectionAttendanceTab'
import { Select } from '../../components/select'
import { roundGrade, getGradeRemarks } from '../../utils/gradeUtils'

const QUARTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '1', label: 'First Quarter' },
  { value: '2', label: 'Second Quarter' },
  { value: '3', label: 'Third Quarter' },
  { value: '4', label: 'Fourth Quarter' },
]

const ERROR_TIMEOUT = 5000
const SUCCESS_TIMEOUT = 3000

const ClassSectionDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<'students' | 'subjects' | 'ranking' | 'report-cards' | 'consolidated-grades' | 'core-values' | 'attendance'>('students')
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
  const [showReportCardModal, setShowReportCardModal] = useState(false)
  const [showStudentReportCardModal, setShowStudentReportCardModal] = useState(false)
  const [selectedStudentForReport, setSelectedStudentForReport] = useState<{ id: string; name: string } | null>(null)

  const institutionId = user?.user_institutions?.[0]?.institution_id || ''

  const {
    data: classSection,
    isLoading: classSectionLoading,
    error: classSectionError,
  } = useQuery({
    queryKey: ['class-section', id],
    queryFn: () => classSectionService.getClassSection(id!),
    enabled: !!id,
  })

  const effectiveInstitutionId = useMemo(() => {
    return institutionId || classSection?.data?.institution_id || ''
  }, [institutionId, classSection?.data?.institution_id])

  const {
    data: institution,
  } = useQuery({
    queryKey: ['institution', effectiveInstitutionId],
    queryFn: () => institutionService.getInstitution(effectiveInstitutionId),
    enabled: !!effectiveInstitutionId,
  })



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

  const subjects = useMemo(() => subjectsResponse?.data || [], [subjectsResponse?.data])
  
  const students = useMemo(() => 
    studentsResponse?.data?.map((item: Student) => ({
      ...item,
      assignmentId: item.student_section_id
    })) || [], 
    [studentsResponse?.data]
  )
  
  const classSectionData = classSection?.data

  const selectedStudent = useMemo(() => {
    if (!selectedStudentForReport?.id || !students.length) return null
    return students.find(student => student.id === selectedStudentForReport.id) || null
  }, [selectedStudentForReport?.id, students])

  const fallbackInstitution = useMemo(() => ({
    id: effectiveInstitutionId || 'unknown',
    title: 'School Name',
    abbr: 'SN',
    address: 'School Address',
    division: 'Division',
    region: 'Region',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }), [effectiveInstitutionId])

  const finalInstitution = institution?.data || fallbackInstitution
  const enhancedClassSectionData = classSectionData



  const {
    data: studentGrades,
    isLoading: studentGradesLoading
  } = useQuery({
    queryKey: ['student-running-grades', { student_id: selectedStudentForReport?.id }],
    queryFn: () => studentRunningGradeService.list({ student_id: selectedStudentForReport?.id }),
    enabled: !!selectedStudentForReport?.id,
  })

  const transformedGrades = useMemo((): StudentSubjectGrade[] => {
    if (!studentGrades?.data || !selectedStudentForReport?.id) return []

    const gradesBySubject = studentGrades.data.reduce((acc: Record<string, StudentSubjectGrade>, grade: any) => {
      if (!acc[grade.subject_id]) {
        acc[grade.subject_id] = {
          subject_id: grade.subject_id,
          student_id: grade.student_id,
          quarter1_grade: undefined,
          quarter2_grade: undefined,
          quarter3_grade: undefined,
          quarter4_grade: undefined,
          final_grade: undefined,
          remarks: undefined,
          academic_year: grade.academic_year,
        }
      }

      const quarter = grade.quarter
      const roundedGrade = roundGrade(grade.final_grade)
      
      const quarterMap: Record<string, 'quarter1_grade' | 'quarter2_grade' | 'quarter3_grade' | 'quarter4_grade'> = {
        '1': 'quarter1_grade',
        '2': 'quarter2_grade',
        '3': 'quarter3_grade',
        '4': 'quarter4_grade',
      }

      const quarterKey = quarterMap[quarter]
      if (quarterKey && roundedGrade !== undefined) {
        acc[grade.subject_id][quarterKey] = roundedGrade as number | string
      }

      if (roundedGrade !== undefined) {
        acc[grade.subject_id].final_grade = roundedGrade
        acc[grade.subject_id].remarks = getGradeRemarks(roundedGrade)
      }

      return acc
    }, {} as Record<string, StudentSubjectGrade>)

    return Object.values(gradesBySubject)
  }, [studentGrades?.data, selectedStudentForReport?.id])
  
  const {
    createSubjectMutation,
    updateSubjectMutation,
    deleteSubjectMutation,
    reorderSubjectsMutation,
    reorderChildSubjectsMutation,
    removeStudentMutation,
  } = useClassSectionDetailMutations({
    classSectionId: id!,
    onSubjectCreateSuccess: refetchSubjects,
    onSubjectUpdateSuccess: refetchSubjects,
    onSubjectDeleteSuccess: () => {
      refetchSubjects()
      setSubjectDeleteConfirmation({ isOpen: false, subject: null, loading: false })
    },
    onSubjectError: (error: string) => {
      setSubjectModalError(error)
      setTimeout(() => setSubjectModalError(null), ERROR_TIMEOUT)
    },
    onSubjectDeleteError: () => {
      setSubjectDeleteConfirmation(prev => ({ ...prev, loading: false }))
    },
    onReorderSubjectsSuccess: refetchSubjects,
    onReorderChildSubjectsSuccess: refetchSubjects,
    onRemoveStudentSuccess: () => {
      setShowRemoveModal(false)
      setStudentToRemove(null)
    },
  })

  const getFullName = useCallback((user: { first_name?: string; middle_name?: string; last_name?: string; ext_name?: string }) => {
    const parts = [
      user?.last_name ? `${user.last_name},` : '',
      user?.first_name || '',
      user?.middle_name ? `${user.middle_name.charAt(0)}.` : '',
      user?.ext_name || ''
    ]
    return parts.filter(Boolean).join(' ')
  }, [])

  const filteredStudents = useMemo(() => {
    if (!studentSearchTerm) return students
    const searchLower = studentSearchTerm.toLowerCase()
    return students.filter(student => {
      const fullName = getFullName(student).toLowerCase()
      const lrn = student.lrn?.toLowerCase() || ''
      return fullName.includes(searchLower) || lrn.includes(searchLower)
    })
  }, [students, studentSearchTerm, getFullName])

  const groupedStudents = useMemo(() => {
    const grouped: Record<string, (Student & { assignmentId: string })[]> = {}
    
    students.forEach(student => {
      const gender = student.gender || 'other'
      if (!grouped[gender]) {
        grouped[gender] = []
      }
      grouped[gender].push(student)
    })

    Object.keys(grouped).forEach(gender => {
      grouped[gender].sort((a, b) => {
        const nameA = `${a.last_name} ${a.first_name} ${a.middle_name || ''}`.toLowerCase()
        const nameB = `${b.last_name} ${b.first_name} ${b.middle_name || ''}`.toLowerCase()
        return nameA.localeCompare(nameB)
      })
    })

    return grouped
  }, [students])

  const handleCreateSubject = useCallback(() => {
    setEditingSubject(null)
    setSubjectModalError(null)
    setShowSubjectModal(true)
  }, [])

  const handleEditSubject = useCallback((subject: Subject) => {
    setEditingSubject(subject)
    setSubjectModalError(null)
    setShowSubjectModal(true)
  }, [])

  const handleDeleteSubject = useCallback((subject: Subject) => {
    setSubjectDeleteConfirmation({
      isOpen: true,
      subject,
      loading: false
    })
  }, [])

  const handleSubjectSubmit = useCallback(async (data: any) => {
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
  }, [editingSubject, updateSubjectMutation, createSubjectMutation])

  const handleSubjectModalClose = useCallback(() => {
    setShowSubjectModal(false)
    setEditingSubject(null)
    setSubjectModalError(null)
  }, [])

  const handleReorderSubjects = useCallback(async (subjectOrders: Array<{ id: string; order: number }>) => {
    await reorderSubjectsMutation.mutateAsync(subjectOrders)
  }, [reorderSubjectsMutation])

  const handleReorderChildSubjects = useCallback(async (parentId: string, childOrders: Array<{ id: string; order: number }>) => {
    await reorderChildSubjectsMutation.mutateAsync({ parentId, childOrders })
  }, [reorderChildSubjectsMutation])

  const handleAssignmentSuccess = useCallback(() => {
    refetchStudents()
  }, [refetchStudents])

  const handleEditStudent = useCallback((student: Student) => {
    setStudentToEdit(student)
    setShowEditModal(true)
  }, [])

  const handleEditSuccess = useCallback(() => {
    refetchStudents()
    setEditModalSuccess('Student updated successfully!')
    setTimeout(() => setEditModalSuccess(null), SUCCESS_TIMEOUT)
  }, [refetchStudents])

  const handleEditError = useCallback((error: string) => {
    setEditModalError(error)
    setTimeout(() => setEditModalError(null), ERROR_TIMEOUT)
  }, [])

  const handleRemoveStudent = useCallback((student: Student & { assignmentId: string }) => {
    setStudentToRemove({
      id: student.id,
      name: getFullName(student),
      assignmentId: student.assignmentId
    })
    setShowRemoveModal(true)
  }, [getFullName])

  const handleConfirmRemove = useCallback(() => {
    if (studentToRemove) {
      removeStudentMutation.mutate(studentToRemove.assignmentId)
    }
  }, [studentToRemove, removeStudentMutation])

  const hasReportCardData = useMemo(() => {
    return !!(finalInstitution && enhancedClassSectionData && selectedStudent && subjects.length > 0)
  }, [finalInstitution, enhancedClassSectionData, selectedStudent, subjects])

  const handleViewTempReportCard = useCallback((studentId: string) => {
    const student = students.find(s => s.id === studentId)
    if (student) {
      setSelectedStudentForReport({
        id: studentId,
        name: getFullName(student)
      })
      if (hasReportCardData) {
        setShowReportCardModal(true)
      }
    }
  }, [students, getFullName, hasReportCardData])

  const handleViewReportCard = useCallback((studentId: string) => {
    const student = students.find(s => s.id === studentId)
    if (student) {
      setSelectedStudentForReport({
        id: studentId,
        name: getFullName(student)
      })
      if (hasReportCardData) {
        setShowStudentReportCardModal(true)
      }
    }
  }, [students, getFullName, hasReportCardData])

  const handleStudentSubmit = useCallback(async (data: any) => {
    if (!studentToEdit) return
    try {
      await studentService.updateStudent(studentToEdit.id, data)
      handleEditSuccess()
    } catch (error: unknown) {
      const errorMessage = error && typeof error === 'object' && 'response' in error 
        ? ((error.response as { data?: { message?: string } })?.data?.message) || 'Failed to update student'
        : 'Failed to update student'
      handleEditError(errorMessage)
      throw error
    }
  }, [studentToEdit, handleEditSuccess, handleEditError])

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
            <button
              onClick={() => setActiveTab('attendance')}
              className={`py-3 px-2 sm:py-4 sm:px-1 border-b-2 font-medium text-sm transition-all duration-200 rounded-t-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                activeTab === 'attendance'
                  ? 'border-indigo-500 text-indigo-700 bg-indigo-50 shadow-sm'
                  : 'border-transparent text-gray-500 hover:text-indigo-600 hover:bg-indigo-50/60 hover:border-indigo-200'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4" />
                <span>Attendance</span>
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
                  options={QUARTER_OPTIONS}
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
                    onReorderChildSubjects={handleReorderChildSubjects}
                    reordering={reorderSubjectsMutation.isPending || reorderChildSubjectsMutation.isPending}
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
                    getFullName={getFullName}
                    studentSearchTerm={studentSearchTerm}
                    setStudentSearchTerm={setStudentSearchTerm}
                    handleViewTempReportCard={handleViewTempReportCard}
                    handleViewReportCard={handleViewReportCard}
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

              {activeTab === 'attendance' && (
                <motion.div
                  key="attendance"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <ClassSectionAttendanceTab
                    classSectionId={id!}
                    students={students}
                    academicYear={classSectionData?.academic_year || ''}
                    getFullName={getFullName}
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
        onSubmit={handleStudentSubmit}
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
        parentSubjects={subjects.filter((s: Subject) => s.subject_type === 'parent')}
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

      {/* Report Card Modal */}
      <ReportCardModal
        isOpen={showReportCardModal}
        onClose={() => {
          setShowReportCardModal(false)
          setSelectedStudentForReport(null)
        }}
        studentName={selectedStudentForReport?.name}
        studentId={selectedStudentForReport?.id}
        sectionSubjects={subjects}
        studentSubjectsGrade={transformedGrades}
        loading={studentGradesLoading}
        institution={finalInstitution}
        classSection={enhancedClassSectionData}
        student={selectedStudent}
      />

      {/* Student Report Card Modal */}
      <StudentReportCardModal
        isOpen={showStudentReportCardModal}
        onClose={() => {
          setShowStudentReportCardModal(false)
          setSelectedStudentForReport(null)
        }}
        studentName={selectedStudentForReport?.name}
        studentId={selectedStudentForReport?.id}
      />
    </motion.div>
  )
}

export default ClassSectionDetail 