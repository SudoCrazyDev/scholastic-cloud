import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeftIcon, AcademicCapIcon } from '@heroicons/react/24/outline'
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

export default function MyGrades() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const studentId = (user as { student_id?: string })?.student_id

  const { data: gradesResponse, isLoading, error } = useQuery({
    queryKey: ['student-running-grades', { student_id: studentId }],
    queryFn: () => studentRunningGradeService.list({ student_id: studentId }),
    enabled: !!studentId,
  })

  const grades = gradesResponse?.data as StudentRunningGrade[] | undefined
  const rows = useMemo((): SubjectGradeRow[] => {
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
        <span className="ml-3 text-gray-600">Loading grades...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error loading grades</h2>
          <p className="text-gray-600 mb-4">We couldn&apos;t load your grades. Please try again later.</p>
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
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={handleBack} className="flex items-center">
              <ArrowLeftIcon className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
            <div className="flex items-center gap-2">
              <AcademicCapIcon className="w-8 h-8 text-indigo-600" />
              <h1 className="text-2xl font-bold text-gray-900">My Grades</h1>
            </div>
            <div className="w-28" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden"
        >
          {rows.length === 0 ? (
            <div className="py-16 text-center">
              <AcademicCapIcon className="w-14 h-14 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No grades recorded yet.</p>
              <p className="text-sm text-gray-400 mt-1">Your grades will appear here once they are posted.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Subject
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Q1
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Q2
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Q3
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Q4
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Final
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Remarks
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {rows.map((row) => (
                    <tr key={row.subject_id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-medium text-gray-900 uppercase">{row.subject_title}</span>
                        {row.subject_code && (
                          <span className="ml-2 text-sm text-gray-500">({row.subject_code})</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700">
                        {row.quarter1 ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700">
                        {row.quarter2 ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700">
                        {row.quarter3 ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700">
                        {row.quarter4 ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-center font-medium text-gray-900">
                        {row.final_grade ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {row.remarks ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}
