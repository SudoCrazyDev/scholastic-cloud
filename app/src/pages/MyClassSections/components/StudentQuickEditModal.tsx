import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XMarkIcon, CameraIcon, PhotoIcon } from '@heroicons/react/24/outline'
import { Formik, Form, Field, ErrorMessage } from 'formik'
import * as Yup from 'yup'
import { Input } from '../../../components/input'
import { Button } from '../../../components/button'
import { Select } from '../../../components/select'
import { Alert } from '../../../components/alert'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { studentService } from '../../../services/studentService'
import type { Student, UpdateStudentData } from '../../../types'

interface StudentQuickEditModalProps {
  isOpen: boolean
  onClose: () => void
  student: Student | null
  onSuccess?: () => void
}

const RELIGION_OPTIONS = [
  { value: 'Islam', label: 'Islam' },
  { value: 'Catholic', label: 'Catholic' },
  { value: 'Iglesia Ni Cristo', label: 'Iglesia Ni Cristo' },
  { value: 'Baptists', label: 'Baptists' },
  { value: 'Others', label: 'Others' },
]

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
]

// Form values type
type FormValues = {
  first_name: string
  middle_name: string
  last_name: string
  ext_name: string
  birthdate: string
  gender: 'male' | 'female' | 'other'
  religion: 'Islam' | 'Catholic' | 'Iglesia Ni Cristo' | 'Baptists' | 'Others'
  lrn: string
}

// Validation schema for quick edit (only essential fields)
const validationSchema = Yup.object({
  first_name: Yup.string()
    .required('First name is required')
    .min(2, 'First name must be at least 2 characters')
    .max(50, 'First name must be less than 50 characters')
    .matches(/^[a-zA-Z\s]+$/, 'First name can only contain letters and spaces'),
  
  middle_name: Yup.string()
    .max(50, 'Middle name must be less than 50 characters')
    .matches(/^[a-zA-Z\s]*$/, 'Middle name can only contain letters and spaces'),
  
  last_name: Yup.string()
    .required('Last name is required')
    .min(2, 'Last name must be at least 2 characters')
    .max(50, 'Last name must be less than 50 characters')
    .matches(/^[a-zA-Z\s]+$/, 'Last name can only contain letters and spaces'),
  
  ext_name: Yup.string()
    .max(20, 'Extension name must be less than 20 characters')
    .matches(/^[a-zA-Z\s.,]*$/, 'Extension name can only contain letters, spaces, dots, and commas'),
  
  birthdate: Yup.date()
    .required('Birthdate is required')
    .max(new Date(), 'Birthdate cannot be in the future')
    .test('age', 'Age must be between 3 and 120 years', function(value) {
      if (!value) return false
      const today = new Date()
      const birthDate = new Date(value)
      let age = today.getFullYear() - birthDate.getFullYear()
      const monthDiff = today.getMonth() - birthDate.getMonth()
      
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--
      }
      
      return age >= 3 && age <= 120
    }),
  
  gender: Yup.string()
    .required('Gender is required')
    .oneOf(['male', 'female', 'other'] as const, 'Please select a valid gender'),
  
  religion: Yup.string()
    .required('Religion is required')
    .oneOf(['Islam', 'Catholic', 'Iglesia Ni Cristo', 'Baptists', 'Others'] as const, 'Please select a valid religion'),
  
  lrn: Yup.string()
    .required('LRN is required')
    .matches(/^\d{12}$/, 'LRN must be exactly 12 digits'),
})

export function StudentQuickEditModal({ 
  isOpen, 
  onClose, 
  student, 
  onSuccess 
}: StudentQuickEditModalProps) {
  const queryClient = useQueryClient()
  const [profileImage, setProfileImage] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [showAlert, setShowAlert] = useState(false)
  const [alertMessage, setAlertMessage] = useState('')
  const [alertType, setAlertType] = useState<'success' | 'error'>('success')

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: UpdateStudentData) => 
      studentService.updateStudent(student!.id, data),
    onSuccess: () => {
      setAlertMessage('Student updated successfully!')
      setAlertType('success')
      setShowAlert(true)
      
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['students'] })
      queryClient.invalidateQueries({ queryKey: ['students-by-section'] })
      queryClient.invalidateQueries({ queryKey: ['student'] })
      
      // Call success callback
      if (onSuccess) {
        onSuccess()
      }
      
      // Close modal after a short delay
      setTimeout(() => {
        handleClose()
      }, 1500)
    },
    onError: (error: unknown) => {
      console.error('Failed to update student:', error)
      const errorMessage = error && typeof error === 'object' && 'response' in error 
        ? ((error.response as { data?: { message?: string } })?.data?.message) || 'Failed to update student'
        : 'Failed to update student'
      setAlertMessage(errorMessage)
      setAlertType('error')
      setShowAlert(true)
    }
  })

  // Initialize profile image when student changes
  useEffect(() => {
    if (student) {
      setProfileImage(student.profile_picture || null)
    }
  }, [student])

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setIsUploading(true)
      // Simulate upload delay
      setTimeout(() => {
        const reader = new FileReader()
        reader.onload = (e) => {
          setProfileImage(e.target?.result as string)
          setIsUploading(false)
        }
        reader.readAsDataURL(file)
      }, 1000)
    }
  }

  const handleRemoveImage = () => {
    setProfileImage(null)
  }

  const handleClose = () => {
    setShowAlert(false)
    setProfileImage(null)
    onClose()
  }

  const handleSubmit = (values: FormValues) => {
    const updateData: UpdateStudentData = {
      ...values,
      profile_picture: profileImage || undefined,
    }
    updateMutation.mutate(updateData)
  }

  if (!student) return null

  const initialValues: FormValues = {
    first_name: student.first_name || '',
    middle_name: student.middle_name || '',
    last_name: student.last_name || '',
    ext_name: student.ext_name || '',
    birthdate: student.birthdate ? new Date(student.birthdate).toISOString().split('T')[0] : '',
    gender: (student.gender as 'male' | 'female' | 'other') || 'male',
    religion: (student.religion as 'Islam' | 'Catholic' | 'Iglesia Ni Cristo' | 'Baptists' | 'Others') || 'Others',
    lrn: student.lrn || '',
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 overflow-y-auto"
        >
          <div className="flex min-h-full items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={handleClose}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">
                  Quick Edit Student
                </h2>
                <button
                  onClick={handleClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>

              {/* Alert */}
              <AnimatePresence>
                {showAlert && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mx-6 mt-4"
                  >
                    <Alert
                      type={alertType}
                      message={alertMessage}
                      show={true}
                      onClose={() => setShowAlert(false)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Form */}
              <div className="p-6">
                <Formik
                  initialValues={initialValues}
                  validationSchema={validationSchema}
                  onSubmit={handleSubmit}
                  enableReinitialize
                >
                  {({ isValid }) => (
                    <Form className="space-y-6">
                      {/* Profile Picture */}
                      <div className="flex flex-col items-center space-y-4">
                        <div className="relative">
                          {profileImage ? (
                            <div className="relative">
                              <img
                                src={profileImage}
                                alt="Profile"
                                className="w-24 h-24 rounded-full object-cover border-4 border-gray-200"
                              />
                              <button
                                type="button"
                                onClick={handleRemoveImage}
                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                              >
                                <XMarkIcon className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center border-4 border-gray-200">
                              <PhotoIcon className="w-12 h-12 text-gray-400" />
                            </div>
                          )}
                        </div>
                        
                        <div className="flex space-x-2">
                          <label className="cursor-pointer">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleImageUpload}
                              className="hidden"
                              disabled={isUploading}
                            />
                            <div className="flex items-center space-x-2 px-3 py-2 bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100 transition-colors">
                              <CameraIcon className="w-4 h-4" />
                              <span className="text-sm font-medium">
                                {isUploading ? 'Uploading...' : 'Upload Photo'}
                              </span>
                            </div>
                          </label>
                        </div>
                      </div>

                      {/* Form Fields */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* First Name */}
                        <div>
                          <Field
                            as={Input}
                            name="first_name"
                            label="First Name"
                            placeholder="Enter first name"
                            required
                          />
                          <ErrorMessage name="first_name" component="div" className="text-red-500 text-sm mt-1" />
                        </div>

                        {/* Middle Name */}
                        <div>
                          <Field
                            as={Input}
                            name="middle_name"
                            label="Middle Name"
                            placeholder="Enter middle name"
                          />
                          <ErrorMessage name="middle_name" component="div" className="text-red-500 text-sm mt-1" />
                        </div>

                        {/* Last Name */}
                        <div>
                          <Field
                            as={Input}
                            name="last_name"
                            label="Last Name"
                            placeholder="Enter last name"
                            required
                          />
                          <ErrorMessage name="last_name" component="div" className="text-red-500 text-sm mt-1" />
                        </div>

                        {/* Extension Name */}
                        <div>
                          <Field
                            as={Input}
                            name="ext_name"
                            label="Extension Name"
                            placeholder="e.g., Jr., Sr., III"
                          />
                          <ErrorMessage name="ext_name" component="div" className="text-red-500 text-sm mt-1" />
                        </div>

                        {/* Birthdate */}
                        <div>
                          <Field
                            as={Input}
                            name="birthdate"
                            label="Birthdate"
                            type="date"
                            required
                          />
                          <ErrorMessage name="birthdate" component="div" className="text-red-500 text-sm mt-1" />
                        </div>

                        {/* Gender */}
                        <div>
                          <Field
                            as={Select}
                            name="gender"
                            label="Gender"
                            options={GENDER_OPTIONS}
                            required
                          />
                          <ErrorMessage name="gender" component="div" className="text-red-500 text-sm mt-1" />
                        </div>

                        {/* Religion */}
                        <div>
                          <Field
                            as={Select}
                            name="religion"
                            label="Religion"
                            options={RELIGION_OPTIONS}
                            required
                          />
                          <ErrorMessage name="religion" component="div" className="text-red-500 text-sm mt-1" />
                        </div>

                        {/* LRN */}
                        <div>
                          <Field
                            as={Input}
                            name="lrn"
                            label="LRN (Learner Reference Number)"
                            placeholder="Enter 12-digit LRN"
                            required
                          />
                          <ErrorMessage name="lrn" component="div" className="text-red-500 text-sm mt-1" />
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleClose}
                          disabled={updateMutation.isPending}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={!isValid || updateMutation.isPending}
                          loading={updateMutation.isPending}
                        >
                          {updateMutation.isPending ? 'Updating...' : 'Update Student'}
                        </Button>
                      </div>
                    </Form>
                  )}
                </Formik>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
} 