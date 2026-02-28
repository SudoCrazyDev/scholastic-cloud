import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeftIcon,
  UserIcon,
  AcademicCapIcon,
  HeartIcon,
  IdentificationIcon,
  PhotoIcon,
  BanknotesIcon,
} from '@heroicons/react/24/outline'
import { Badge } from '../components/badge'
import { Button } from '../components/button'
import { StudentFinanceTab } from './Students/components'
import { studentService } from '../services/studentService'
import { useAuth } from '../hooks/useAuth'
import type { Student } from '../types'

const tabs = [
  { id: 'personal', name: 'Personal Details', icon: UserIcon },
  { id: 'academic', name: 'Academic Information', icon: AcademicCapIcon },
  { id: 'medical', name: 'Medical Records', icon: HeartIcon },
  { id: 'documents', name: 'Documents', icon: IdentificationIcon },
  { id: 'finance', name: 'Finance', icon: BanknotesIcon },
]

export default function MyPersonalInfo() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const studentId = (user as { student_id?: string })?.student_id

  const [activeTab, setActiveTab] = useState('personal')
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
          setError('Failed to fetch your information')
        }
      } catch (err) {
        console.error('Error fetching student:', err)
        setError('Failed to load your information')
      } finally {
        setLoading(false)
      }
    }
    fetchStudent()
  }, [studentId])

  const handleBack = () => navigate('/dashboard')

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        <span className="ml-3 text-gray-600">Loading your information...</span>
      </div>
    )
  }

  if (!studentId || error || !student) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {!studentId ? 'Not a student account' : error ? 'Error' : 'Not found'}
          </h2>
          <p className="text-gray-600 mb-4">
            {!studentId
              ? 'Your account is not linked to a student record.'
              : error || "We couldn't load your information."}
          </p>
          <Button onClick={handleBack} variant="outline">
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    )
  }

  const getFullName = (s: Student) => {
    const parts = [s.first_name, s.middle_name, s.last_name].filter(Boolean)
    const fullName = parts.join(' ')
    return s.ext_name ? `${fullName} ${s.ext_name}` : fullName
  }

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

  const calculateAge = (birthdate: string) => {
    const birth = new Date(birthdate)
    const today = new Date()
    let age = today.getFullYear() - birth.getFullYear()
    const monthDiff = today.getMonth() - birth.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--
    return age
  }

  const getGenderColor = (gender: string) => {
    switch (gender) {
      case 'male': return 'blue'
      case 'female': return 'pink'
      default: return 'zinc'
    }
  }

  const getReligionColor = (religion: string) => {
    switch (religion) {
      case 'Islam': return 'green'
      case 'Catholic': return 'purple'
      case 'Iglesia Ni Cristo': return 'blue'
      case 'Baptists': return 'indigo'
      case 'Others': return 'zinc'
      default: return 'zinc'
    }
  }

  const profileImage = student.profile_picture || null

  const renderPersonalDetails = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">Profile Information</h3>
        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex-shrink-0">
            <div className="w-48 h-48 rounded-full overflow-hidden bg-gray-100 border-4 border-gray-200 flex items-center justify-center">
              {profileImage ? (
                <img
                  src={typeof profileImage === 'string' ? profileImage : undefined}
                  alt={`${getFullName(student)} profile`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-gray-400">
                  <PhotoIcon className="w-16 h-16 mb-2" />
                  <span className="text-sm">No photo</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Full Name</label>
                <p className="text-gray-900 font-medium text-lg uppercase">{getFullName(student)}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Age</label>
                <p className="text-gray-900">{calculateAge(student.birthdate)} years old</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Birthdate</label>
                <p className="text-gray-900">{formatDate(student.birthdate)}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Gender</label>
                <Badge color={getGenderColor(student.gender || 'other')}>
                  {(student.gender || 'other').charAt(0).toUpperCase() + (student.gender || 'other').slice(1)}
                </Badge>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Religion</label>
                <Badge color={getReligionColor(student.religion || 'Others')}>
                  {student.religion}
                </Badge>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">LRN</label>
                <p className="text-gray-900 font-mono">{student.lrn}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Name Breakdown</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">First Name</label>
            <p className="text-gray-900 uppercase">{student.first_name}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Middle Name</label>
            <p className="text-gray-900 uppercase">{student.middle_name || 'N/A'}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Last Name</label>
            <p className="text-gray-900 uppercase">{student.last_name}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Extension Name</label>
            <p className="text-gray-900 uppercase">{student.ext_name || 'N/A'}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">System Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Student ID</label>
            <p className="text-gray-900 font-mono">{student.id}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Created</label>
            <p className="text-gray-900">{formatDate(student.created_at || '')}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Last Updated</label>
            <p className="text-gray-900">{formatDate(student.updated_at || '')}</p>
          </div>
        </div>
      </div>
    </div>
  )

  const renderAcademicInfo = () => (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="text-center py-12">
        <AcademicCapIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Academic Information</h3>
        <p className="text-gray-500">Academic details will be available when connected to the backend API.</p>
      </div>
    </div>
  )

  const renderMedicalRecords = () => (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="text-center py-12">
        <HeartIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Medical Records</h3>
        <p className="text-gray-500">Medical information will be available when connected to the backend API.</p>
      </div>
    </div>
  )

  const renderDocuments = () => (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="text-center py-12">
        <IdentificationIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Documents</h3>
        <p className="text-gray-500">Student documents will be available when connected to the backend API.</p>
      </div>
    </div>
  )

  const renderTabContent = () => {
    switch (activeTab) {
      case 'personal':
        return renderPersonalDetails()
      case 'academic':
        return renderAcademicInfo()
      case 'medical':
        return renderMedicalRecords()
      case 'documents':
        return renderDocuments()
      case 'finance':
        return <StudentFinanceTab student={student} studentId={student.id} />
      default:
        return renderPersonalDetails()
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button variant="outline" size="sm" onClick={handleBack} className="flex items-center">
                <ArrowLeftIcon className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 uppercase">{getFullName(student)}</h1>
                <p className="mt-1 text-gray-600">Student ID: {student.id}</p>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="bg-white rounded-lg border border-gray-200 mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
              {tabs.map((tab) => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm ${
                      activeTab === tab.id
                        ? 'border-indigo-500 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    {tab.name}
                  </button>
                )
              })}
            </nav>
          </div>
        </div>

        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          {renderTabContent()}
        </motion.div>
      </div>
    </div>
  )
}
