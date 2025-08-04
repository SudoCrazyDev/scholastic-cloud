import { useQuery } from '@tanstack/react-query'
import { studentService } from '../services/studentService'
import { institutionService } from '../services/institutionService'
import { classSectionService } from '../services/classSectionService'
import { subjectService } from '../services/subjectService'
import { studentRunningGradeService } from '../services/studentRunningGradeService'
import type { Student, Institution, ClassSection, Subject, StudentRunningGrade } from '../types'

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
  })

  // Fetch subjects for the class section
  const {
    data: subjectsData,
    isLoading: subjectsLoading,
    error: subjectsError
  } = useQuery({
    queryKey: ['subjects', classSectionId],
    queryFn: () => subjectService.getSubjects({ class_section_id: classSectionId }),
    enabled: enabled && !!classSectionId,
    staleTime: 5 * 60 * 1000,
  })

  // Fetch all grades for the student across all subjects
  const {
    data: gradesData,
    isLoading: gradesLoading,
    error: gradesError
  } = useQuery({
    queryKey: ['student-grades', studentId, classSectionId, academicYear],
    queryFn: async () => {
      const subjects = subjectsData?.data || []
      const allGrades: StudentRunningGrade[] = []
      
      // Fetch grades for each subject
      for (const subject of subjects) {
        try {
          const grades = await studentRunningGradeService.getByStudentAndSubject(studentId, subject.id)
          if (grades.data) {
            allGrades.push(...grades.data)
          }
        } catch (error) {
          console.warn(`Failed to fetch grades for subject ${subject.id}:`, error)
        }
      }
      
      return { data: allGrades }
    },
    enabled: enabled && !!studentId && !!classSectionId && !!subjectsData?.data,
    staleTime: 5 * 60 * 1000,
  })

  const isLoading = studentLoading || institutionLoading || classSectionLoading || subjectsLoading || gradesLoading
  const error = studentError?.message || institutionError?.message || classSectionError?.message || subjectsError?.message || gradesError?.message || null

  return {
    student: studentData?.data || {} as Student,
    institution: institutionData?.data || {} as Institution,
    classSection: classSectionData?.data || {} as ClassSection,
    subjects: subjectsData?.data || [],
    grades: gradesData?.data || [],
    isLoading,
    error
  }
} 