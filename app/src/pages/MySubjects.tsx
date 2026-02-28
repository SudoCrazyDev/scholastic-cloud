import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeftIcon, BookOpenIcon } from '@heroicons/react/24/outline'
import { Button } from '../components/button'
import { useAuth } from '../hooks/useAuth'
import { useQuery } from '@tanstack/react-query'
import { studentRunningGradeService } from '../services/studentRunningGradeService'
import type { StudentRunningGrade } from '../services/studentRunningGradeService'
import { roundGrade, getGradeRemarks } from '../utils/gradeUtils'

interface SubjectGradeRow {
  subject_id: string
  subject_title: string
  subject_code?: string
  quarter1?: number
  quarter2?: number
  quarter3?: number
  quarter4?: number
  final_grade?: number
  remarks?: string
  academic_year?: string
}

export default function MySubjects() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const studentId = (user as { student_id?: string })?.student_id

  const { data: gradesResponse, isLoading, error } = useQuery({
    queryKey: ['student-running-grades', { student_id: studentId }],
    queryFn: () => studentRunningGradeService.list({ student_id: studentId }),
    enabled: !!studentId,
  })

  const grades = gradesResponse?.data as StudentRunningGrade[] | undefined
  const subjects = useMemo((): SubjectGradeRow[] => {
    if (!grades || !Array.isArray(grades)) return []
    const bySubject: Record<string, SubjectGradeRow> = {}
    grades.forEach((g: StudentRunningGrade) => {
      if (!bySubject[g.subject_id]) {
        bySubject[g.subject_id] = {
          subject_id: g.subject_id,
          subject_title: (g.subject as { title?: string })?.title || 'Subject',
          subject_code: (g.subject as { code?: string })?.code,
          academic_year: g.academic_year,
        }
      }
      const row = bySubject[g.subject_id]
      const rounded = roundGrade(g.final_grade ?? g.grade)
      if (g.quarter === '1') row.quarter1 = rounded
      if (g.quarter === '2') row.quarter2 = rounded
      if (g.quarter === '3') row.quarter3 = rounded
      if (g.quarter === '4') row.quarter4 = rounded
      if (rounded !== undefined) {
        const quarters = [row.quarter1, row.quarter2, row.quarter3, row.quarter4].filter(
          (q): q is number => q !== undefined && q > 0
        )
        row.final_grade =
          quarters.length > 0
            ? Math.round(quarters.reduce((a, b) => a + b, 0) / quarters.length)
            : undefined
        row.remarks = row.final_grade !== undefined ? getGradeRemarks(row.final_grade) : undefined
      }
    })
    return Object.values(bySubject)
  }, [grades])

  const handleBack = () => navigate('/dashboard')

  if (!studentId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Not a student account</h2>
          <p className="text-gray-600 mb-4">Your account is not linked to a student record.</p>
          <Button onClick={handleBack} variant="outline">
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        <span className="ml-3 text-gray-600">Loading subjects...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error loading subjects</h2>
          <p className="text-gray-600 mb-4">We couldn&apos;t load your subjects. Please try again later.</p>
          <Button onClick={handleBack} variant="outline">
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        {/* Header: stack on mobile, row on tablet+ */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-6 sm:mb-8"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={handleBack}
              className="flex items-center w-fit shrink-0"
            >
              <ArrowLeftIcon className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Back to Dashboard</span>
              <span className="sm:hidden ml-2">Back</span>
            </Button>
            <div className="flex items-center gap-2 flex-shrink-0">
              <BookOpenIcon className="w-7 h-7 sm:w-8 sm:h-8 text-indigo-600" />
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">My Subject</h1>
            </div>
          </div>
        </motion.div>

        {subjects.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white rounded-lg border border-gray-200 shadow-sm py-12 sm:py-16 text-center px-4"
          >
            <BookOpenIcon className="w-12 h-12 sm:w-14 sm:h-14 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-sm sm:text-base">No subjects with grades yet.</p>
            <p className="text-xs sm:text-sm text-gray-400 mt-1">Your subjects and grades will appear here once they are posted.</p>
          </motion.div>
        ) : (
          <div className="space-y-4 sm:space-y-6">
            {subjects.map((subject, index) => (
              <motion.div
                key={subject.subject_id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
              >
                <div className="px-3 py-3 sm:px-5 sm:py-4 border-b border-gray-100 bg-gray-50/50">
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900 uppercase break-words">
                    {subject.subject_title}
                    {subject.subject_code && (
                      <span className="ml-1 sm:ml-2 text-xs sm:text-sm font-normal text-gray-500">({subject.subject_code})</span>
                    )}
                  </h2>
                  {subject.academic_year && (
                    <p className="text-xs text-gray-500 mt-0.5">Academic year: {subject.academic_year}</p>
                  )}
                </div>
                <div className="p-3 sm:p-5">
                  <p className="text-xs sm:text-sm font-medium text-gray-500 mb-2 sm:mb-3">Grades</p>
                  {/* Mobile: 2 cols (3 rows). Tablet: 3 cols (2 rows). Desktop: 6 cols (1 row) */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 sm:gap-4">
                    <div className="bg-gray-50 rounded-lg p-2.5 sm:p-3 text-center min-w-0">
                      <p className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase">Q1</p>
                      <p className="text-base sm:text-lg font-semibold text-gray-900 mt-0.5 sm:mt-1">{subject.quarter1 ?? '—'}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2.5 sm:p-3 text-center min-w-0">
                      <p className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase">Q2</p>
                      <p className="text-base sm:text-lg font-semibold text-gray-900 mt-0.5 sm:mt-1">{subject.quarter2 ?? '—'}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2.5 sm:p-3 text-center min-w-0">
                      <p className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase">Q3</p>
                      <p className="text-base sm:text-lg font-semibold text-gray-900 mt-0.5 sm:mt-1">{subject.quarter3 ?? '—'}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2.5 sm:p-3 text-center min-w-0">
                      <p className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase">Q4</p>
                      <p className="text-base sm:text-lg font-semibold text-gray-900 mt-0.5 sm:mt-1">{subject.quarter4 ?? '—'}</p>
                    </div>
                    <div className="bg-indigo-50 rounded-lg p-2.5 sm:p-3 text-center min-w-0">
                      <p className="text-[10px] sm:text-xs font-medium text-indigo-600 uppercase">Final</p>
                      <p className="text-base sm:text-lg font-semibold text-indigo-900 mt-0.5 sm:mt-1">{subject.final_grade ?? '—'}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2.5 sm:p-3 text-center min-w-0 col-span-2 sm:col-span-1">
                      <p className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase">Remarks</p>
                      <p className="text-xs sm:text-sm font-medium text-gray-700 mt-0.5 sm:mt-1 line-clamp-2 sm:line-clamp-1" title={subject.remarks ?? ''}>
                        {subject.remarks ?? '—'}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
