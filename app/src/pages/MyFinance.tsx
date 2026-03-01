import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/button'
import { StudentFinanceTab } from './Students/components'
import { studentService } from '../services/studentService'
import { useAuth } from '../hooks/useAuth'
import type { Student } from '../types'

export default function MyFinance() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const studentId = (user as { student_id?: string })?.student_id

  const [student, setStudent] = useState<Student | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchStudent = async () => {
      if (!studentId) {
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)
      try {
        const response = await studentService.getStudent(studentId)
        if (response.success) {
          setStudent(response.data)
        } else {
          setError('Failed to load your finance profile')
        }
      } catch (err) {
        console.error('Error fetching student finance profile:', err)
        setError('Failed to load your finance profile')
      } finally {
        setLoading(false)
      }
    }

    fetchStudent()
  }, [studentId])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        <span className="ml-3 text-gray-600">Loading your finance page...</span>
      </div>
    )
  }

  if (!studentId || error || !student) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {!studentId ? 'Not a student account' : 'Finance page unavailable'}
          </h2>
          <p className="text-gray-600 mb-4">
            {!studentId
              ? 'Your account is not linked to a student record.'
              : error || "We couldn't load your finance page."}
          </p>
          <Button onClick={() => navigate('/dashboard')} variant="outline">
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">My Finance</h1>
              <p className="mt-1 text-gray-600">
                View your balance, notice of account, ledger, and pay online.
              </p>
            </div>
            <Button variant="outline" onClick={() => navigate('/dashboard')}>
              <ArrowLeftIcon className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </div>
        </motion.div>

        <StudentFinanceTab student={student} studentId={student.id} />
      </div>
    </div>
  )
}
