import { useQuery } from '@tanstack/react-query'
import { studentService } from '../services/studentService'
import { institutionService } from '../services/institutionService'
import { classSectionService } from '../services/classSectionService'
import { subjectService } from '../services/subjectService'
import { studentRunningGradeService } from '../services/studentRunningGradeService'
import { coreValueMarkingService } from '../services/coreValueMarkingService'
import { studentAttendanceService } from '../services/studentAttendanceService'
import { schoolDayService } from '../services/schoolDayService'
import type { Student, Institution, ClassSection, Subject, StudentAttendance, SchoolDay } from '../types'
import type { StudentRunningGrade } from '../services/studentRunningGradeService'

interface UseStudentReportCardParams {
  studentId: string
  classSectionId: string
  institutionId: string
  academicYear?: string
  enabled?: boolean
}

interface StudentReportCardData {
  student: Student
  institution: Institution
  classSection: ClassSection
  subjects: Subject[]
  grades: StudentRunningGrade[]
  coreValueMarkings: any[]
  attendances: StudentAttendance[]
  schoolDays: SchoolDay[]
  isLoading: boolean
  error: string | null
}

export const useStudentReportCard = ({
  studentId,
  classSectionId,
  institutionId,
  academicYear = '2024-2025',
  enabled = true
}: UseStudentReportCardParams): StudentReportCardData => {
  // Fetch student data
  const {
    data: studentData,
    isLoading: studentLoading,
    error: studentError
  } = useQuery({
    queryKey: ['student', studentId],
    queryFn: () => studentService.getStudent(studentId),
    enabled: enabled && !!studentId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  // Fetch institution data
  const {
    data: institutionData,
    isLoading: institutionLoading,
    error: institutionError
  } = useQuery({
    queryKey: ['institution', institutionId],
    queryFn: () => institutionService.getInstitution(institutionId),
    enabled: enabled && !!institutionId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  // Fetch class section data
  const {
    data: classSectionData,
    isLoading: classSectionLoading,
    error: classSectionError
  } = useQuery({
    queryKey: ['class-section', classSectionId],
    queryFn: () => classSectionService.getClassSection(classSectionId),
    enabled: enabled && !!classSectionId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  // Fetch subjects for the class section (same query key as ClassSectionDetail so cache is shared)
  const {
    data: subjectsData,
    isLoading: subjectsLoading,
    error: subjectsError
  } = useQuery({
    queryKey: ['subjects', { class_section_id: classSectionId }],
    queryFn: () => subjectService.getSubjects({ class_section_id: classSectionId }),
    enabled: enabled && !!classSectionId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  // Fetch all grades for the student in one call (same as Temp Report Card / ClassSectionDetail)
  const {
    data: gradesData,
    isLoading: gradesLoading,
    error: gradesError
  } = useQuery({
    queryKey: ['student-running-grades', { student_id: studentId }],
    queryFn: () => studentRunningGradeService.list({ student_id: studentId }),
    enabled: enabled && !!studentId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  // Fetch learner observed values markings (same source as Temp Report Card and Core Values tab)
  const coreValueMarkingsParams = { student_id: studentId, academic_year: academicYear }
  const {
    data: coreValueMarkingsData,
    isLoading: coreValueMarkingsLoading,
    error: coreValueMarkingsError,
  } = useQuery({
    queryKey: ['core-value-markings', coreValueMarkingsParams],
    queryFn: () => coreValueMarkingService.get(coreValueMarkingsParams),
    enabled: enabled && !!studentId && !!academicYear,
    staleTime: 0,
    retry: 1,
    retryDelay: 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  // Fetch attendance data for the student
  const {
    data: attendancesData,
    isLoading: attendancesLoading,
    error: attendancesError,
  } = useQuery({
    queryKey: ['student-attendances', studentId, classSectionId, academicYear],
    queryFn: () => studentAttendanceService.getAttendances({
      class_section_id: classSectionId,
      academic_year: academicYear,
    }),
    enabled: enabled && !!studentId && !!classSectionId && !!academicYear,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  // Fetch school days for the institution
  const {
    data: schoolDaysData,
    isLoading: schoolDaysLoading,
    error: schoolDaysError,
  } = useQuery({
    queryKey: ['school-days', institutionId, academicYear],
    queryFn: () => schoolDayService.getSchoolDays({
      institution_id: institutionId,
      academic_year: academicYear,
    }),
    enabled: enabled && !!institutionId && !!academicYear,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const isLoading =
    studentLoading ||
    institutionLoading ||
    classSectionLoading ||
    subjectsLoading ||
    gradesLoading ||
    coreValueMarkingsLoading ||
    attendancesLoading ||
    schoolDaysLoading

  const error =
    studentError?.message ||
    institutionError?.message ||
    classSectionError?.message ||
    subjectsError?.message ||
    gradesError?.message ||
    coreValueMarkingsError?.message ||
    attendancesError?.message ||
    schoolDaysError?.message ||
    null

  // Filter attendances for this specific student
  const studentAttendances = (attendancesData?.data || []).filter(
    (attendance: StudentAttendance) => attendance.student_id === studentId
  )

  const subjectsOut = subjectsData?.data || []
  const gradesOut = gradesData?.data || []

  return {
    student: studentData?.data || {} as Student,
    institution: institutionData?.data || {} as Institution,
    classSection: classSectionData?.data || {} as ClassSection,
    subjects: subjectsOut,
    grades: gradesOut,
    coreValueMarkings: Array.isArray(coreValueMarkingsData) ? coreValueMarkingsData : [],
    attendances: studentAttendances,
    schoolDays: schoolDaysData?.data || [],
    isLoading,
    error
  }
} 