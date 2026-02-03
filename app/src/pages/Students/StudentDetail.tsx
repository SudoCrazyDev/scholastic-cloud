import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { 
  ArrowLeftIcon,
  UserIcon,
  AcademicCapIcon,
  HeartIcon,
  IdentificationIcon,
  PencilIcon,
  CameraIcon,
  XMarkIcon,
  PhotoIcon,
  DocumentTextIcon,
  BanknotesIcon
} from '@heroicons/react/24/outline'
import { Badge } from '../../components/badge'
import { Button } from '../../components/button'
import { StudentFinanceTab } from './components'
import { studentService } from '../../services/studentService'
import type { Student } from '../../types'

const tabs = [
  { id: 'personal', name: 'Personal Details', icon: UserIcon },
  { id: 'academic', name: 'Academic Information', icon: AcademicCapIcon },
  { id: 'medical', name: 'Medical Records', icon: HeartIcon },
  { id: 'documents', name: 'Documents', icon: IdentificationIcon },
  { id: 'finance', name: 'Finance', icon: BanknotesIcon },
]

export default function StudentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const fromClassSectionId = (location.state as { fromClassSectionId?: string } | null)?.fromClassSectionId
  const [activeTab, setActiveTab] = useState('personal')
  const [student, setStudent] = useState<Student | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [profileImage, setProfileImage] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  useEffect(() => {
    const fetchStudent = async () => {
      if (!id) return
      
      setLoading(true)
      setError(null)
      
      try {
        const response = await studentService.getStudent(id)
        if (response.success) {
          setStudent(response.data)
          setProfileImage(response.data.profile_picture || null)
        } else {
          setError('Failed to fetch student data')
        }
      } catch (err) {
        console.error('Error fetching student:', err)
        setError('Failed to load student details')
      } finally {
        setLoading(false)
      }
    }

    fetchStudent()
  }, [id])

  const handleBack = () => {
    if (fromClassSectionId) {
      navigate(`/my-class-sections/${fromClassSectionId}`)
    } else {
      navigate('/students')
    }
  }

  const handleEdit = (student: Student) => {
    // Navigate back to students page and open edit modal
    navigate('/students', { state: { editStudent: student } })
  }

  const handleGenerateSF9 = () => {
    // Navigate to SF9 page with student pre-selected
    navigate('/sf9', { state: { selectedStudentId: student?.id } })
  }

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !student) return

    setIsUploading(true)
    
    try {
      // Convert file to base64 for now (in a real app, you'd upload to a file server)
      const reader = new FileReader()
      reader.onload = async (e) => {
        const base64Image = e.target?.result as string
        
        // Update the student with the new profile picture
        const response = await studentService.updateStudent(student.id, {
          profile_picture: base64Image
        })
        
        if (response.success) {
          setProfileImage(base64Image)
          setStudent(response.data)
        }
        setIsUploading(false)
      }
      reader.readAsDataURL(file)
    } catch (err) {
      console.error('Error uploading image:', err)
      setIsUploading(false)
    }
  }

  const handleRemoveImage = async () => {
    if (!student) return

    try {
      const response = await studentService.updateStudent(student.id, {
        profile_picture: undefined
      })
      
      if (response.success) {
        setProfileImage(null)
        setStudent(response.data)
      }
    } catch (err) {
      console.error('Error removing image:', err)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        <span className="ml-3 text-gray-600">Loading student details...</span>
      </div>
    )
  }

  if (error || !student) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {error ? 'Error Loading Student' : 'Student Not Found'}
          </h2>
          <p className="text-gray-600 mb-4">
            {error || "The student you're looking for doesn't exist."}
          </p>
          <Button onClick={handleBack} variant="outline">
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            Back to Students
          </Button>
        </div>
      </div>
    )
  }

  const getFullName = (student: Student) => {
    const parts = [student.first_name, student.middle_name, student.last_name].filter(Boolean)
    const fullName = parts.join(' ')
    return student.ext_name ? `${fullName} ${student.ext_name}` : fullName
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const calculateAge = (birthdate: string) => {
    const birth = new Date(birthdate)
    const today = new Date()
    let age = today.getFullYear() - birth.getFullYear()
    const monthDiff = today.getMonth() - birth.getMonth()
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--
    }
    
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

  const renderPersonalDetails = () => (
    <div className="space-y-6">
      {/* Profile Picture and Basic Information */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">Profile Information</h3>
        
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Profile Picture Section */}
          <div className="flex-shrink-0">
            <div className="relative">
              <div className="w-48 h-48 rounded-full overflow-hidden bg-gray-100 border-4 border-gray-200 flex items-center justify-center">
                {profileImage ? (
                  <img
                    src={profileImage}
                    alt={`${getFullName(student)} profile`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-gray-400">
                    <PhotoIcon className="w-16 h-16 mb-2" />
                    <span className="text-sm">No photo</span>
                  </div>
                )}
                
                {/* Upload overlay */}
                {isUploading && (
                  <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-full">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                  </div>
                )}
              </div>
              
              {/* Action buttons */}
              <div className="flex justify-center mt-4 space-x-2">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    disabled={isUploading}
                  />
                  <div className="flex items-center px-3 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-sm">
                    <CameraIcon className="w-4 h-4 mr-1" />
                    {profileImage ? 'Change' : 'Upload'}
                  </div>
                </label>
                
                {profileImage && (
                  <button
                    onClick={handleRemoveImage}
                    disabled={isUploading}
                    className="flex items-center px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm disabled:opacity-50"
                  >
                    <XMarkIcon className="w-4 h-4 mr-1" />
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Basic Information */}
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

      {/* Name Breakdown */}
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

      {/* System Information */}
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
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBack}
                className="flex items-center"
              >
                <ArrowLeftIcon className="w-4 h-4 mr-2" />
                Back to Students
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 uppercase">{getFullName(student)}</h1>
                <p className="mt-1 text-gray-600">Student ID: {student.id}</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Button
                onClick={handleGenerateSF9}
                variant="outline"
                className="border-green-600 text-green-600 hover:bg-green-50"
              >
                <DocumentTextIcon className="w-4 h-4 mr-2" />
                Generate SF9
              </Button>
              <Button
                onClick={() => handleEdit(student)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <PencilIcon className="w-4 h-4 mr-2" />
                Edit Student
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="bg-white rounded-lg border border-gray-200 mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
              {tabs.map((tab) => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`
                      flex items-center py-4 px-1 border-b-2 font-medium text-sm
                      ${activeTab === tab.id
                        ? 'border-indigo-500 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }
                    `}
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    {tab.name}
                  </button>
                )
              })}
            </nav>
          </div>
        </div>

        {/* Tab Content */}
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