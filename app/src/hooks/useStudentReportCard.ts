import { createContext, useContext } from 'react'
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
import type { ReportCardBundle } from '../services/reportCardPublicationService'

/**
 * A card's data, already composed by the API, for screens that may not call the
 * endpoints below — the student portal, where most of them are staff-only.
 *
 * Inside this provider the hook fetches nothing and returns what it is given,
 * so the portal prints a published card with the same components an adviser
 * prints with. See `MyReportCardController` on the API.
 */
const ReportCardDataContext = createContext<ReportCardBundle | null>(null)

export const ReportCardDataProvider = ReportCardDataContext.Provider

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
  const preloaded = useContext(ReportCardDataContext)
  // Nothing to fetch when the card's data was handed down already.
  enabled = enabled && !preloaded

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

  // Section's department (or institution default) determines which school days to use for attendance
  const departmentIdForSchoolDays =
    classSectionData?.data?.department_id ??
    institutionData?.data?.default_department_id ??
    null

  // Fetch school days for the section's department (so Final Report Card attendance uses department school days)
  const {
    data: schoolDaysData,
    isLoading: schoolDaysLoading,
    error: schoolDaysError,
  } = useQuery({
    queryKey: ['school-days', institutionId, academicYear, departmentIdForSchoolDays],
    queryFn: () =>
      schoolDayService.getSchoolDays({
        institution_id: institutionId,
        academic_year: academicYear,
        department_id: departmentIdForSchoolDays ?? undefined,
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

  if (preloaded) {
    return {
      student: preloaded.student,
      institution: preloaded.institution,
      classSection: preloaded.class_section,
      subjects: preloaded.subjects,
      grades: preloaded.grades,
      coreValueMarkings: preloaded.core_value_markings,
      attendances: preloaded.attendances.filter((attendance) => attendance.student_id === studentId),
      schoolDays: preloaded.school_days,
      isLoading: false,
      error: null,
    }
  }

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