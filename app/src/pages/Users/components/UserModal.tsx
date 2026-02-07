import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { Input } from '../../../components/input'
import { Button } from '../../../components/button'
import { Select } from '../../../components/select'
import { Alert } from '../../../components/alert'
import type { User, Role, Institution, CreateUserData } from '../../../types'

interface UserModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: CreateUserData) => Promise<void>
  user?: User | null
  roles: Role[]
  institutions: Institution[]
  loading?: boolean
  error?: string | null
  success?: string | null
}

export function UserModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  user, 
  roles,
  institutions,
  loading = false,
  error = null,
  success = null
}: UserModalProps) {
  const [formData, setFormData] = useState({
    first_name: '',
    middle_name: '',
    last_name: '',
    ext_name: '',
    gender: '',
    birthdate: '',
    email: '',
    role_id: '',
    institution_ids: [] as string[],
  })
  const [errors, setErrors] = useState<{ [key: string]: string }>({})
  const [showAlert, setShowAlert] = useState(false)
  const [alertMessage, setAlertMessage] = useState('')
  const [alertType, setAlertType] = useState<'success' | 'error'>('success')

  const isEditing = !!user

  // Reset form when modal opens/closes or user changes
  useEffect(() => {
    if (isOpen) {
      if (user) {
        // Role: from user.role or first user_institution's role_id
        const roleId =
          user.role?.id ||
          (user.user_institutions?.[0]?.role_id ?? '')

        // Institutions: from user_institutions, default first to match API order
        const institutionIds = user.user_institutions?.length
          ? [...user.user_institutions]
              .sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0))
              .map((ui) => ui.institution_id)
          : []

        setFormData({
          first_name: user.first_name,
          middle_name: user.middle_name || '',
          last_name: user.last_name,
          ext_name: user.ext_name || '',
          gender: user.gender,
          birthdate: user.birthdate.split('T')[0], // Convert to date input format
          email: user.email,
          role_id: roleId,
          institution_ids: institutionIds,
        })
      } else {
        setFormData({
          first_name: '',
          middle_name: '',
          last_name: '',
          ext_name: '',
          gender: '',
          birthdate: '',
          email: '',
          role_id: '',
          institution_ids: [],
        })
      }
      setErrors({})
      setShowAlert(false)
    }
  }, [isOpen, user])

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

  const handleFieldChange = (field: string, value: string | string[]) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
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

    // Gender validation
    if (!formData.gender) {
      newErrors.gender = 'Gender is required'
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
      
      if (age < 13 || age > 120) {
        newErrors.birthdate = 'Age must be between 13 and 120 years'
      }
    }

    // Email validation
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!isValidEmail(formData.email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    // Role validation (optional for editing)
    if (formData.role_id) {
      // Convert both to strings for comparison to handle type mismatches
      const selectedRoleId = String(formData.role_id)
      const foundRole = roles.find(role => String(role.id) === selectedRoleId)
      
      if (!foundRole) {
        newErrors.role_id = 'Please select a valid role'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const isValidEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) {
      return
    }
    
    try {
      const submitData = {
        ...formData,
        role_id: formData.role_id || undefined,
        institution_ids: formData.institution_ids.length > 0 ? formData.institution_ids : undefined,
        // For new users, we'll need to generate a password on the backend
        password: isEditing ? undefined : 'temp_password_will_be_generated'
      }

      await onSubmit(submitData as CreateUserData)
      
      // Show success message
      setAlertMessage(isEditing ? 'User updated successfully!' : 'User created successfully! Password will be auto-generated.')
      setAlertType('success')
      setShowAlert(true)
      
      // Close modal after a short delay to show success message
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch (err) {
      // Error handling is done by the parent component
      setAlertMessage('An error occurred. Please try again.')
      setAlertType('error')
      setShowAlert(true)
    }
  }

  const handleClose = () => {
    if (!loading) {
      onClose()
    }
  }

  const selectedInstitutions = institutions.filter(inst => 
    formData.institution_ids.includes(inst.id)
  )

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
            onClick={handleClose}
          />

          {/* Modal */}
          <div className="flex min-h-full items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-2xl bg-white rounded-lg shadow-xl max-h-[90vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  {isEditing ? 'Edit User' : 'Create New User'}
                </h3>
                <button
                  onClick={handleClose}
                  disabled={loading}
                  className="text-gray-400 hover:text-gray-600 transition-colors duration-200 disabled:opacity-50"
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                {/* Alert for success/error messages */}
                {showAlert && (
                  <Alert
                    type={alertType}
                    message={alertMessage}
                    onClose={() => setShowAlert(false)}
                    show={showAlert}
                  />
                )}

                {/* Personal Information */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-gray-900">Personal Information</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        disabled={loading}
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
                        disabled={loading}
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
                        disabled={loading}
                      />
                    </div>

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
                        disabled={loading}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Gender *
                      </label>
                      <Select
                        value={formData.gender}
                        onChange={(e) => handleFieldChange('gender', e.target.value)}
                        disabled={loading}
                        placeholder="Select gender"
                        options={[
                          { value: "male", label: "Male" },
                          { value: "female", label: "Female" },
                          { value: "other", label: "Other" }
                        ]}
                      />
                      {errors.gender && (
                        <p className="mt-1 text-sm text-red-600">{errors.gender}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Birthdate *
                      </label>
                      <Input
                        type="date"
                        value={formData.birthdate}
                        onChange={(e) => handleFieldChange('birthdate', e.target.value)}
                        error={errors.birthdate}
                        disabled={loading}
                      />
                    </div>
                  </div>
                </div>

                {/* Account Information */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-gray-900">Account Information</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email Address *
                      </label>
                      <Input
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleFieldChange('email', e.target.value)}
                        error={errors.email}
                        placeholder="Enter email address"
                        disabled={loading}
                      />
                    </div>
                  </div>
                  
                  {!isEditing && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <p className="text-sm text-blue-600">
                        Password will be auto-generated and sent to the user's email address.
                      </p>
                    </div>
                  )}
                </div>

                {/* Role and Institutions */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-gray-900">Role & Institutions</h4>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Role
                      </label>
                      <Select
                        value={formData.role_id}
                        onChange={(e) => handleFieldChange('role_id', e.target.value)}
                        disabled={loading}
                        placeholder="Select a role"
                        options={roles.map((role) => ({
                          value: role.id.toString(),
                          label: role.title
                        }))}
                      />
                      {errors.role_id && (
                        <p className="mt-1 text-sm text-red-600">{errors.role_id}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Institutions
                      </label>
                      <div className="space-y-2">
                        <Select
                          value=""
                          onChange={(e) => {
                            const institutionId = e.target.value
                            if (institutionId && !formData.institution_ids.includes(institutionId)) {
                              handleFieldChange('institution_ids', [...formData.institution_ids, institutionId])
                            }
                          }}
                          disabled={loading}
                          placeholder="Add an institution..."
                          options={institutions
                            .filter(inst => !formData.institution_ids.includes(inst.id))
                            .map((institution) => ({
                              value: institution.id,
                              label: institution.title
                            }))}
                        />
                        
                        {selectedInstitutions.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs text-gray-600">Selected institutions:</p>
                            <div className="flex flex-wrap gap-2">
                              {selectedInstitutions.map((institution) => (
                                <div
                                  key={institution.id}
                                  className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-sm"
                                >
                                  <span>{institution.title}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleFieldChange('institution_ids', formData.institution_ids.filter(id => id !== institution.id))}
                                    className="text-blue-600 hover:text-blue-800"
                                    disabled={loading}
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
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
                  >
                    {isEditing ? 'Update User' : 'Create User'}
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