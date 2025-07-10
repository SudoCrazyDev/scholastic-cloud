import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XMarkIcon, CameraIcon, PhotoIcon } from '@heroicons/react/24/outline'
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
  { value: 'ISLAM', label: 'Islam' },
  { value: 'CATHOLIC', label: 'Catholic' },
  { value: 'IGLESIA NI CRISTO', label: 'Iglesia Ni Cristo' },
  { value: 'BAPTISTS', label: 'Baptists' },
  { value: 'OTHERS', label: 'Others' },
]

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
]

export function StudentModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  student, 
  loading = false,
  error = null,
  success = null
}: StudentModalProps) {
  const [formData, setFormData] = useState({
    first_name: '',
    middle_name: '',
    last_name: '',
    ext_name: '',
    birthdate: '',
    gender: '',
    religion: '',
    lrn: '',
  })
  const [profileImage, setProfileImage] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [errors, setErrors] = useState<{ [key: string]: string }>({})
  const [showAlert, setShowAlert] = useState(false)
  const [alertMessage, setAlertMessage] = useState('')
  const [alertType, setAlertType] = useState<'success' | 'error'>('success')

  const isEditing = !!student

  // Reset form when modal opens/closes or student changes
  useEffect(() => {
    if (isOpen) {
      if (student) {
        setFormData({
          first_name: student.first_name,
          middle_name: student.middle_name || '',
          last_name: student.last_name,
          ext_name: student.ext_name || '',
          birthdate: student.birthdate.split('T')[0], // Convert to date input format
          gender: student.gender,
          religion: student.religion,
          lrn: student.lrn,
        })
        setProfileImage(student.profile_picture || null)
      } else {
        setFormData({
          first_name: '',
          middle_name: '',
          last_name: '',
          ext_name: '',
          birthdate: '',
          gender: '',
          religion: '',
          lrn: '',
        })
        setProfileImage(null)
      }
      setErrors({})
      setShowAlert(false)
    }
  }, [isOpen, student])

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

  const handleFieldChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

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

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {}

    // First Name validation
    if (!formData.first_name.trim()) {
      newErrors.first_name = 'First name is required'
    } else if (formData.first_name.length < 2) {
      newErrors.first_name = 'First name must be at least 2 characters'
    } else if (formData.first_name.length > 50) {
      newErrors.first_name = 'First name must be less than 50 characters'
    } else if (!/^[a-zA-Z\s]+$/.test(formData.first_name)) {
      newErrors.first_name = 'First name can only contain letters and spaces'
    }

    // Middle Name validation
    if (formData.middle_name && formData.middle_name.length > 50) {
      newErrors.middle_name = 'Middle name must be less than 50 characters'
    } else if (formData.middle_name && !/^[a-zA-Z\s]+$/.test(formData.middle_name)) {
      newErrors.middle_name = 'Middle name can only contain letters and spaces'
    }

    // Last Name validation
    if (!formData.last_name.trim()) {
      newErrors.last_name = 'Last name is required'
    } else if (formData.last_name.length < 2) {
      newErrors.last_name = 'Last name must be at least 2 characters'
    } else if (formData.last_name.length > 50) {
      newErrors.last_name = 'Last name must be less than 50 characters'
    } else if (!/^[a-zA-Z\s]+$/.test(formData.last_name)) {
      newErrors.last_name = 'Last name can only contain letters and spaces'
    }

    // Extension Name validation
    if (formData.ext_name && formData.ext_name.length > 20) {
      newErrors.ext_name = 'Extension name must be less than 20 characters'
    } else if (formData.ext_name && !/^[a-zA-Z\s.,]+$/.test(formData.ext_name)) {
      newErrors.ext_name = 'Extension name can only contain letters, spaces, dots, and commas'
    }

    // Birthdate validation
    if (!formData.birthdate) {
      newErrors.birthdate = 'Birthdate is required'
    } else {
      const birthDate = new Date(formData.birthdate)
      const today = new Date()
      let age = today.getFullYear() - birthDate.getFullYear()
      const monthDiff = today.getMonth() - birthDate.getMonth()
      
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--
      }
      
      if (age < 3 || age > 120) {
        newErrors.birthdate = 'Age must be between 3 and 120 years'
      }
    }

    // Gender validation
    if (!formData.gender) {
      newErrors.gender = 'Gender is required'
    }

    // Religion validation
    if (!formData.religion) {
      newErrors.religion = 'Religion is required'
    }

    // LRN validation
    if (!formData.lrn.trim()) {
      newErrors.lrn = 'LRN is required'
    } else if (formData.lrn.length !== 12) {
      newErrors.lrn = 'LRN must be exactly 12 digits'
    } else if (!/^\d{12}$/.test(formData.lrn)) {
      newErrors.lrn = 'LRN must contain only numbers'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    try {
      const submitData: CreateStudentData = {
        ...formData,
        gender: formData.gender as 'male' | 'female' | 'other',
        religion: formData.religion as 'ISLAM' | 'CATHOLIC' | 'IGLESIA NI CRISTO' | 'BAPTISTS' | 'OTHERS',
        profile_picture: profileImage || undefined,
      }
      await onSubmit(submitData)
      // Form will be reset by the parent component on success
    } catch (error) {
      // Error handling is done by the parent component
    }
  }

  const handleClose = () => {
    setShowAlert(false)
    onClose()
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
              transition={{ duration: 0.2 }}
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
              <div className="bg-white px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {isEditing ? 'Edit Student' : 'Add New Student'}
                  </h3>
                  <button
                    onClick={handleClose}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <XMarkIcon className="w-6 h-6" />
                  </button>
                </div>
              </div>

                             {/* Alert */}
               {showAlert && (
                 <div className="px-6 pt-4">
                   <Alert
                     type={alertType}
                     title={alertType === 'error' ? 'Error' : 'Success'}
                     message={alertMessage}
                     onClose={() => setShowAlert(false)}
                   />
                 </div>
               )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="px-6 py-4">
                <div className="space-y-6">
                  {/* Profile Picture */}
                  <div className="flex flex-col items-center">
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Profile Picture
                    </label>
                    <div className="relative">
                      <div className="w-32 h-32 rounded-full overflow-hidden bg-gray-100 border-4 border-gray-200 flex items-center justify-center">
                        {profileImage ? (
                          <img
                            src={profileImage}
                            alt="Profile preview"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-gray-400">
                            <PhotoIcon className="w-12 h-12 mb-2" />
                            <span className="text-xs">No photo</span>
                          </div>
                        )}
                        
                        {/* Upload overlay */}
                        {isUploading && (
                          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-full">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                          </div>
                        )}
                      </div>
                      
                      {/* Action buttons */}
                      <div className="flex justify-center mt-3 space-x-2">
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload}
                            className="hidden"
                            disabled={isUploading}
                          />
                          <div className="flex items-center px-3 py-1 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-xs">
                            <CameraIcon className="w-3 h-3 mr-1" />
                            {profileImage ? 'Change' : 'Upload'}
                          </div>
                        </label>
                        
                        {profileImage && (
                          <button
                            type="button"
                            onClick={handleRemoveImage}
                            disabled={isUploading}
                            className="flex items-center px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-xs disabled:opacity-50"
                          >
                            <XMarkIcon className="w-3 h-3 mr-1" />
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Name Fields */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        First Name *
                      </label>
                      <Input
                        type="text"
                        value={formData.first_name}
                        onChange={(e) => handleFieldChange('first_name', e.target.value)}
                        error={errors.first_name}
                        placeholder="Enter first name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Middle Name
                      </label>
                      <Input
                        type="text"
                        value={formData.middle_name}
                        onChange={(e) => handleFieldChange('middle_name', e.target.value)}
                        error={errors.middle_name}
                        placeholder="Enter middle name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Last Name *
                      </label>
                      <Input
                        type="text"
                        value={formData.last_name}
                        onChange={(e) => handleFieldChange('last_name', e.target.value)}
                        error={errors.last_name}
                        placeholder="Enter last name"
                      />
                    </div>
                  </div>

                  {/* Extension Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Extension Name
                    </label>
                    <Input
                      type="text"
                      value={formData.ext_name}
                      onChange={(e) => handleFieldChange('ext_name', e.target.value)}
                      error={errors.ext_name}
                      placeholder="e.g., Jr., Sr., III"
                    />
                  </div>

                  {/* Birthdate and Gender */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Birthdate *
                      </label>
                      <Input
                        type="date"
                        value={formData.birthdate}
                        onChange={(e) => handleFieldChange('birthdate', e.target.value)}
                        error={errors.birthdate}
                      />
                    </div>
                                         <div>
                       <label className="block text-sm font-medium text-gray-700 mb-1">
                         Gender *
                       </label>
                       <select
                         value={formData.gender}
                         onChange={(e) => handleFieldChange('gender', e.target.value)}
                         className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                           errors.gender ? 'border-red-500' : 'border-gray-300'
                         }`}
                       >
                         <option value="">Select gender</option>
                         {GENDER_OPTIONS.map((option) => (
                           <option key={option.value} value={option.value}>
                             {option.label}
                           </option>
                         ))}
                       </select>
                       {errors.gender && (
                         <p className="mt-1 text-sm text-red-600">{errors.gender}</p>
                       )}
                     </div>
                  </div>

                  {/* Religion and LRN */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                         <div>
                       <label className="block text-sm font-medium text-gray-700 mb-1">
                         Religion *
                       </label>
                       <select
                         value={formData.religion}
                         onChange={(e) => handleFieldChange('religion', e.target.value)}
                         className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                           errors.religion ? 'border-red-500' : 'border-gray-300'
                         }`}
                       >
                         <option value="">Select religion</option>
                         {RELIGION_OPTIONS.map((option) => (
                           <option key={option.value} value={option.value}>
                             {option.label}
                           </option>
                         ))}
                       </select>
                       {errors.religion && (
                         <p className="mt-1 text-sm text-red-600">{errors.religion}</p>
                       )}
                     </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        LRN (Learner Reference Number) *
                      </label>
                      <Input
                        type="text"
                        value={formData.lrn}
                        onChange={(e) => handleFieldChange('lrn', e.target.value)}
                        error={errors.lrn}
                        placeholder="Enter 12-digit LRN"
                        maxLength={12}
                      />
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-200">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    loading={loading}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    {isEditing ? 'Update Student' : 'Create Student'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
} 