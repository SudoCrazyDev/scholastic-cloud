import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
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
import type { Student, Subject, StudentSubjectGrade } from '../../types'
import ClassSectionHeader from './components/ClassSectionHeader';
import ClassSectionStudentsTab from './components/ClassSectionStudentsTab';
import ClassSectionRankingTab from './components/ClassSectionRankingTab';
import ClassSectionReportCardsTab from './components/ClassSectionReportCardsTab';
import ClassSectionConsolidatedGradesTab from './components/ClassSectionConsolidatedGradesTab';
import ClassSectionSubjectsTab from './components/ClassSectionSubjectsTab';
import ClassSectionCoreValuesTab from './components/ClassSectionCoreValuesTab';
import { Select } from '../../components/select';
import { roundGrade, getGradeRemarks } from '../../utils/gradeUtils';

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

  // Get institution ID from class section if user doesn't have it
  const effectiveInstitutionId = useMemo(() => {
    if (institutionId) return institutionId;
    if (classSection?.data?.institution_id) return classSection.data.institution_id;
    return '';
  }, [institutionId, classSection?.data?.institution_id]);

  // Fetch institution details
  const {
    data: institution,
  } = useQuery({
    queryKey: ['institution', effectiveInstitutionId],
    queryFn: () => institutionService.getInstitution(effectiveInstitutionId),
    enabled: !!effectiveInstitutionId,
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
  const students = studentsResponse?.data?.map((item: Student) => ({
    ...item,
    assignmentId: item.student_section_id
  })) || []
  const classSectionData = classSection?.data

  // Get the selected student object for report card
  const selectedStudent = useMemo(() => {
    if (!selectedStudentForReport?.id || !students.length) return null;
    return students.find(student => student.id === selectedStudentForReport.id) || null;
  }, [selectedStudentForReport?.id, students]);

  // Create fallback institution data if the query fails
  const fallbackInstitution = useMemo(() => ({
    id: effectiveInstitutionId || 'unknown',
    title: 'School Name',
    abbr: 'SN',
    address: 'School Address',
    division: 'Division',
    region: 'Region',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }), [effectiveInstitutionId]);

  // Use actual institution data or fallback
  const finalInstitution = institution?.data || fallbackInstitution;



  // The backend now automatically includes the adviser relationship
  const enhancedClassSectionData = useMemo(() => {
    if (!classSectionData) return null;
    return classSectionData;
  }, [classSectionData]);



  // Fetch student grades for report card
  const {
    data: studentGrades,
    isLoading: studentGradesLoading
  } = useQuery({
    queryKey: ['student-running-grades', { student_id: selectedStudentForReport?.id }],
    queryFn: () => studentRunningGradeService.list({ student_id: selectedStudentForReport?.id }),
    enabled: !!selectedStudentForReport?.id,
  })

  // Transform the grades data to match the expected format
  const transformedGrades = useMemo((): StudentSubjectGrade[] => {
    if (!studentGrades?.data || !selectedStudentForReport?.id) return [];

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
        };
      }

      const quarter = grade.quarter;
      const roundedGrade = roundGrade(grade.final_grade);
      
      // Assign rounded quarterly grades
      if (quarter === "1") {
        acc[grade.subject_id].quarter1_grade = roundedGrade;
      } else if (quarter === "2") {
        acc[grade.subject_id].quarter2_grade = roundedGrade;
      } else if (quarter === "3") {
        acc[grade.subject_id].quarter3_grade = roundedGrade;
      } else if (quarter === "4") {
        acc[grade.subject_id].quarter4_grade = roundedGrade;
      }

      // Set final grade and remarks if grade exists
      if (roundedGrade !== undefined) {
        acc[grade.subject_id].final_grade = roundedGrade;
        acc[grade.subject_id].remarks = getGradeRemarks(roundedGrade);
      }

      return acc;
    }, {} as Record<string, StudentSubjectGrade>);

    return Object.values(gradesBySubject);
  }, [studentGrades?.data, selectedStudentForReport?.id]);
  
  // Subject mutations
  const createSubjectMutation = useMutation({
    mutationFn: (data: any) => subjectService.createSubject(data),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['subjects', { class_section_id: id }] })
      refetchSubjects()
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
    mutationFn: (subjectOrders: Array<{ id: string; order: number }>) => {
      console.log('reorderSubjectsMutation called with:', subjectOrders)
      return subjectService.reorderSubjects(id!, subjectOrders)
    },
    onSuccess: () => {
      toast.success('Subjects reordered successfully!', {
        duration: 3000,
        position: 'top-right',
        style: {
          background: '#10B981',
          color: '#fff',
        },
      })
      queryClient.removeQueries({ queryKey: ['subjects', { class_section_id: id }] })
      refetchSubjects()
    },
    onError: () => {
      toast.error('Failed to reorder subjects. Please try again.', {
        duration: 4000,
        position: 'top-right',
      })
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
    const parts = [`${user?.last_name},`, user?.first_name, `${user?.middle_name ? user?.middle_name.charAt(0) + "." : ""}`,  user?.ext_name]
    return parts.filter(Boolean).join(' ')
  }

  // Filter students by search term
  const filteredStudents = students.filter(student => {
    if (!studentSearchTerm) return true
    const fullName = getFullName(student).toLowerCase()
    const lrn = student.lrn?.toLowerCase() || ''
    return fullName.includes(studentSearchTerm.toLowerCase()) || lrn.includes(studentSearchTerm.toLowerCase())
  })

  // Group students by gender and sort alphabetically
  const groupedStudents: Record<string, (Student & { assignmentId: string })[]> = students.reduce((acc, student) => {
    const gender = student.gender || '';
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
    setShowSubjectModal(true)
  }

  const handleEditSubject = (subject: Subject) => {
    setEditingSubject(subject)
    setSubjectModalError(null)
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
      let result: any
      if (editingSubject) {
        result = await updateSubjectMutation.mutateAsync({ id: editingSubject.id, data })
      } else {
        result = await createSubjectMutation.mutateAsync(data)
      }
      setShowSubjectModal(false)
      return result
    } catch (error) {
      // Error is handled in mutation onError
    }
  }

  const handleSubjectModalClose = () => {
    setShowSubjectModal(false)
    setEditingSubject(null)
    setSubjectModalError(null)
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

  // Check if we have all the necessary data for the report card
  const hasReportCardData = useMemo(() => {
    return !!(
      finalInstitution &&
      enhancedClassSectionData &&
      selectedStudent &&
      subjects.length > 0
    );
  }, [finalInstitution, enhancedClassSectionData, selectedStudent, subjects]);

  // Report cards and consolidated grades handlers
  const handleViewTempReportCard = (studentId: string) => {
    const student = students.find(s => s.id === studentId)
    if (student) {
      setSelectedStudentForReport({
        id: studentId,
        name: getFullName(student)
      })
      // Only open modal if we have the necessary data
      if (hasReportCardData) {
        setShowReportCardModal(true)
      } else {
        console.log('Cannot open report card modal - missing data:', {
          institution: !!finalInstitution,
          classSection: !!classSectionData,
          student: !!selectedStudent,
          subjects: subjects.length
        });
        // You could show an alert here to inform the user
      }
    }
  }

  const handleViewReportCard = (studentId: string) => {
    const student = students.find(s => s.id === studentId)
    if (student) {
      setSelectedStudentForReport({
        id: studentId,
        name: getFullName(student)
      })
      // Only open modal if we have the necessary data
      if (hasReportCardData) {
        setShowStudentReportCardModal(true)
      } else {
        console.log('Cannot open student report card modal - missing data:', {
          institution: !!finalInstitution,
          classSection: !!classSectionData,
          student: !!selectedStudent,
          subjects: subjects.length
        });
        // You could show an alert here to inform the user
      }
    }
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