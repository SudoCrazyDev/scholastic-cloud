import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { Input } from '../../../components/input'
import { Button } from '../../../components/button'
import { Select } from '../../../components/select'
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
}

export function UserModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  user, 
  roles,
  institutions,
  loading = false,
  error = null 
}: UserModalProps) {
  const [formData, setFormData] = useState({
    first_name: '',
    middle_name: '',
    last_name: '',
    ext_name: '',
    gender: '',
    birthdate: '',
    email: '',
    password: '',
    role_id: '',
    institution_ids: [] as string[],
  })
  const [errors, setErrors] = useState<{ [key: string]: string }>({})

  const isEditing = !!user

  // Reset form when modal opens/closes or user changes
  useEffect(() => {
    if (isOpen) {
      if (user) {
        setFormData({
          first_name: user.first_name,
          middle_name: user.middle_name || '',
          last_name: user.last_name,
          ext_name: user.ext_name || '',
          gender: user.gender,
          birthdate: user.birthdate.split('T')[0], // Convert to date input format
          email: user.email,
          password: '', // Don't populate password for editing
          role_id: '', // We'll need to fetch this separately
          institution_ids: [], // We'll need to fetch this separately
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
          password: '',
          role_id: '',
          institution_ids: [],
        })
      }
      setErrors({})
    }
  }, [isOpen, user])

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

    if (!formData.first_name.trim()) {
      newErrors.first_name = 'First name is required'
    } else if (formData.first_name.length < 2) {
      newErrors.first_name = 'First name must be at least 2 characters'
    } else if (formData.first_name.length > 50) {
      newErrors.first_name = 'First name must be less than 50 characters'
    }

    if (formData.middle_name && formData.middle_name.length > 50) {
      newErrors.middle_name = 'Middle name must be less than 50 characters'
    }

    if (!formData.last_name.trim()) {
      newErrors.last_name = 'Last name is required'
    } else if (formData.last_name.length < 2) {
      newErrors.last_name = 'Last name must be at least 2 characters'
    } else if (formData.last_name.length > 50) {
      newErrors.last_name = 'Last name must be less than 50 characters'
    }

    if (formData.ext_name && formData.ext_name.length > 20) {
      newErrors.ext_name = 'Extension name must be less than 20 characters'
    }

    if (!formData.gender) {
      newErrors.gender = 'Gender is required'
    }

    if (!formData.birthdate) {
      newErrors.birthdate = 'Birthdate is required'
    } else {
      const birthDate = new Date(formData.birthdate)
      const today = new Date()
      const age = today.getFullYear() - birthDate.getFullYear()
      if (age < 13 || age > 120) {
        newErrors.birthdate = 'Age must be between 13 and 120 years'
      }
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!isValidEmail(formData.email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    if (!isEditing && !formData.password) {
      newErrors.password = 'Password is required'
    } else if (formData.password && formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters'
    }

    if (formData.role_id && !roles.find(role => role.id === formData.role_id)) {
      newErrors.role_id = 'Please select a valid role'
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
        password: formData.password || undefined, // Don't send empty password for updates
        role_id: formData.role_id || undefined,
        institution_ids: formData.institution_ids.length > 0 ? formData.institution_ids : undefined,
      }
      
      await onSubmit(submitData as CreateUserData)
      onClose()
    } catch (err) {
      // Error handling is done by the parent component
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
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
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

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Gender *
                      </label>
                      <Select
                        value={formData.gender}
                        onChange={(e) => handleFieldChange('gender', e.target.value)}
                      >
                        <option value="">Select gender</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </Select>
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
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Password {!isEditing && '*'}
                      </label>
                      <Input
                        type="password"
                        value={formData.password}
                        onChange={(e) => handleFieldChange('password', e.target.value)}
                        error={errors.password}
                        placeholder={isEditing ? "Leave blank to keep current" : "Enter password"}
                      />
                    </div>
                  </div>
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
                      >
                        <option value="">Select a role</option>
                        {roles.map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.title}
                          </option>
                        ))}
                      </Select>
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
                        >
                          <option value="">Add an institution...</option>
                          {institutions
                            .filter(inst => !formData.institution_ids.includes(inst.id))
                            .map((institution) => (
                              <option key={institution.id} value={institution.id}>
                                {institution.title}
                              </option>
                            ))}
                        </Select>
                        
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