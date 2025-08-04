import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XMarkIcon, CameraIcon, PhotoIcon } from '@heroicons/react/24/outline'
import { Formik, Form, Field, ErrorMessage } from 'formik'
import * as Yup from 'yup'
import { Input } from '../../../components/input'
import { Button } from '../../../components/button'
import { Select } from '../../../components/select'
import { Alert } from '../../../components/alert'
import type { Student, CreateStudentData } from '../../../types'

interface StudentModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: CreateStudentData) => Promise<void>
  student?: Student | null
  loading?: boolean
  error?: string | null
  success?: string | null
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

// Validation schema
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
    .oneOf(['male', 'female', 'other'], 'Please select a valid gender'),
  
  religion: Yup.string()
    .required('Religion is required')
    .oneOf(['Islam', 'Catholic', 'Iglesia Ni Cristo', 'Baptists', 'Others'], 'Please select a valid religion'),
})

export function StudentModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  student, 
  loading = false,
  error = null,
  success = null
}: StudentModalProps) {
  const [profileImage, setProfileImage] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [showAlert, setShowAlert] = useState(false)
  const [alertMessage, setAlertMessage] = useState('')
  const [alertType, setAlertType] = useState<'success' | 'error'>('success')

  const isEditing = !!student

  // Handle external error/success messages
  useEffect(() => {
    if (error) {
      setAlertMessage(error)
      setAlertType('error')
      setShowAlert(true)
    } else if (success) {
      setAlertMessage(success)
      setAlertType('success')
      setShowAlert(true)
    }
  }, [error, success])

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
    onClose()
  }

  const initialValues = {
    first_name: student?.first_name || '',
    middle_name: student?.middle_name || '',
    last_name: student?.last_name || '',
    ext_name: student?.ext_name || '',
    birthdate: student?.birthdate ? student.birthdate.split('T')[0] : '',
    gender: student?.gender || '',
    religion: student?.religion || '',
    lrn: student?.lrn || '',
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={handleClose}
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl"
            >
              {/* Header */}
              <div className="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 sm:mx-0 sm:h-10 sm:w-10">
                      <CameraIcon className="h-6 w-6 text-blue-600" />
                    </div>
                    <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                      <h3 className="text-base font-semibold leading-6 text-gray-900">
                        {isEditing ? 'Edit Student' : 'Add New Student'}
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        {isEditing ? 'Update student information' : 'Enter student details to create a new record'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleClose}
                    className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>
              </div>

              {/* Alert */}
              {showAlert && (
                <div className="px-4 pb-4">
                  <Alert
                    type={alertType}
                    title={alertType === 'error' ? 'Error' : 'Success'}
                    message={alertMessage}
                    onClose={() => setShowAlert(false)}
                  />
                </div>
              )}

              {/* Form */}
              <Formik
                initialValues={initialValues}
                validationSchema={validationSchema}
                onSubmit={async (values, { setSubmitting, resetForm }) => {
                  try {
                    const submitData: CreateStudentData = {
                      ...values,
                      gender: values.gender as 'male' | 'female' | 'other',
                      religion: values.religion as 'Islam' | 'Catholic' | 'Iglesia Ni Cristo' | 'Baptists' | 'Others',
                      profile_picture: profileImage || undefined,
                    }
                    await onSubmit(submitData)
                    if (!isEditing) {
                      resetForm()
                      setProfileImage(null)
                    }
                  } catch (error) {
                    // Error handling is done by the parent component
                  } finally {
                    setSubmitting(false)
                  }
                }}
                enableReinitialize
              >
                {({ errors, touched, isSubmitting }) => (
                  <Form className="px-4 pb-4">
                    <div className="space-y-6">
                      {/* Profile Picture */}
                      <div className="flex justify-center">
                        <div className="relative">
                          <div className="h-24 w-24 rounded-full overflow-hidden bg-gray-100 border-2 border-gray-200">
                            {profileImage ? (
                              <img
                                src={profileImage}
                                alt="Profile"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center">
                                <PhotoIcon className="h-12 w-12 text-gray-400" />
                              </div>
                            )}
                          </div>
                          <div className="absolute -bottom-1 -right-1">
                            <label className="cursor-pointer">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleImageUpload}
                                className="hidden"
                                disabled={isUploading}
                              />
                              <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center hover:bg-blue-700 transition-colors">
                                <CameraIcon className="h-4 w-4 text-white" />
                              </div>
                            </label>
                          </div>
                          {isUploading && (
                            <div className="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center">
                              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                            </div>
                          )}
                        </div>
                        {profileImage && (
                          <button
                            type="button"
                            onClick={handleRemoveImage}
                            className="ml-2 text-sm text-red-600 hover:text-red-700"
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      {/* Form Fields */}
                      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                        {/* First Name */}
                        <div>
                          <label htmlFor="first_name" className="block text-sm font-medium text-gray-700">
                            First Name *
                          </label>
                          <Field
                            as={Input}
                            id="first_name"
                            name="first_name"
                            type="text"
                            placeholder="Enter first name"
                            error={touched.first_name && errors.first_name}
                          />
                          <ErrorMessage name="first_name" component="div" className="mt-1 text-sm text-red-600" />
                        </div>

                        {/* Middle Name */}
                        <div>
                          <label htmlFor="middle_name" className="block text-sm font-medium text-gray-700">
                            Middle Name
                          </label>
                          <Field
                            as={Input}
                            id="middle_name"
                            name="middle_name"
                            type="text"
                            placeholder="Enter middle name"
                            error={touched.middle_name && errors.middle_name}
                          />
                          <ErrorMessage name="middle_name" component="div" className="mt-1 text-sm text-red-600" />
                        </div>

                        {/* Last Name */}
                        <div>
                          <label htmlFor="last_name" className="block text-sm font-medium text-gray-700">
                            Last Name *
                          </label>
                          <Field
                            as={Input}
                            id="last_name"
                            name="last_name"
                            type="text"
                            placeholder="Enter last name"
                            error={touched.last_name && errors.last_name}
                          />
                          <ErrorMessage name="last_name" component="div" className="mt-1 text-sm text-red-600" />
                        </div>

                        {/* Extension Name */}
                        <div>
                          <label htmlFor="ext_name" className="block text-sm font-medium text-gray-700">
                            Extension Name
                          </label>
                          <Field
                            as={Input}
                            id="ext_name"
                            name="ext_name"
                            type="text"
                            placeholder="e.g., Jr., Sr., III"
                            error={touched.ext_name && errors.ext_name}
                          />
                          <ErrorMessage name="ext_name" component="div" className="mt-1 text-sm text-red-600" />
                        </div>

                        {/* Birthdate */}
                        <div>
                          <label htmlFor="birthdate" className="block text-sm font-medium text-gray-700">
                            Birthdate *
                          </label>
                          <Field
                            as={Input}
                            id="birthdate"
                            name="birthdate"
                            type="date"
                            error={touched.birthdate && errors.birthdate}
                          />
                          <ErrorMessage name="birthdate" component="div" className="mt-1 text-sm text-red-600" />
                        </div>

                        {/* Gender */}
                        <div>
                          <label htmlFor="gender" className="block text-sm font-medium text-gray-700">
                            Gender *
                          </label>
                          <Field
                            as={Select}
                            id="gender"
                            name="gender"
                            options={GENDER_OPTIONS}
                            placeholder="Select gender"
                            error={touched.gender && errors.gender}
                          />
                          <ErrorMessage name="gender" component="div" className="mt-1 text-sm text-red-600" />
                        </div>

                        {/* Religion */}
                        <div>
                          <label htmlFor="religion" className="block text-sm font-medium text-gray-700">
                            Religion *
                          </label>
                          <Field
                            as={Select}
                            id="religion"
                            name="religion"
                            options={RELIGION_OPTIONS}
                            placeholder="Select religion"
                            error={touched.religion && errors.religion}
                          />
                          <ErrorMessage name="religion" component="div" className="mt-1 text-sm text-red-600" />
                        </div>

                        {/* LRN */}
                        <div>
                          <label htmlFor="lrn" className="block text-sm font-medium text-gray-700">
                            LRN (Learner Reference Number) *
                          </label>
                          <Field
                            as={Input}
                            id="lrn"
                            name="lrn"
                            type="text"
                            placeholder="Enter 12-digit LRN"
                            maxLength={12}
                            error={touched.lrn && errors.lrn}
                          />
                          <ErrorMessage name="lrn" component="div" className="mt-1 text-sm text-red-600" />
                        </div>
                      </div>
                    </div>

                                         {/* Footer */}
                     <div className="mt-6 flex justify-end space-x-3">
                       <Button
                         type="button"
                         variant="outline"
                         color="secondary"
                         onClick={handleClose}
                         disabled={loading}
                       >
                         Cancel
                       </Button>
                       <Button
                         type="submit"
                         variant="solid"
                         color="primary"
                         loading={loading || isSubmitting}
                         disabled={loading || isSubmitting}
                       >
                         {isEditing ? 'Update Student' : 'Create Student'}
                       </Button>
                     </div>
                  </Form>
                )}
              </Formik>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
} 