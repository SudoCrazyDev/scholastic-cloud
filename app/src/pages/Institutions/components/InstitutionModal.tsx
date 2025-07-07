import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { Input } from '../../../components/input'
import { Button } from '../../../components/button'
import { Select } from '../../../components/select'
import { Textarea } from '../../../components/textarea'
import type { Institution, Subscription, CreateInstitutionData } from '../../../types'

interface InstitutionModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: CreateInstitutionData) => Promise<void>
  institution?: Institution | null
  subscriptions: Subscription[]
  loading?: boolean
  error?: string | null
}

export function InstitutionModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  institution, 
  subscriptions,
  loading = false,
  error = null 
}: InstitutionModalProps) {
  const [formData, setFormData] = useState({
    title: '',
    abbr: '',
    address: '',
    division: '',
    region: '',
    gov_id: '',
    logo: '',
    subscription_id: '',
  })
  const [errors, setErrors] = useState<{ [key: string]: string }>({})

  const isEditing = !!institution

  // Reset form when modal opens/closes or institution changes
  useEffect(() => {
    if (isOpen) {
      if (institution) {
        setFormData({
          title: institution.title,
          abbr: institution.abbr,
          address: institution.address || '',
          division: institution.division || '',
          region: institution.region || '',
          gov_id: institution.gov_id || '',
          logo: institution.logo || '',
          subscription_id: '', // We'll need to fetch this separately
        })
      } else {
        setFormData({
          title: '',
          abbr: '',
          address: '',
          division: '',
          region: '',
          gov_id: '',
          logo: '',
          subscription_id: '',
        })
      }
      setErrors({})
    }
  }, [isOpen, institution])

  const handleFieldChange = (field: string, value: string) => {
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

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required'
    } else if (formData.title.length < 2) {
      newErrors.title = 'Title must be at least 2 characters'
    } else if (formData.title.length > 200) {
      newErrors.title = 'Title must be less than 200 characters'
    }

    if (!formData.abbr.trim()) {
      newErrors.abbr = 'Abbreviation is required'
    } else if (formData.abbr.length < 2) {
      newErrors.abbr = 'Abbreviation must be at least 2 characters'
    } else if (formData.abbr.length > 20) {
      newErrors.abbr = 'Abbreviation must be less than 20 characters'
    }

    if (formData.address && formData.address.length > 500) {
      newErrors.address = 'Address must be less than 500 characters'
    }

    if (formData.division && formData.division.length > 100) {
      newErrors.division = 'Division must be less than 100 characters'
    }

    if (formData.region && formData.region.length > 100) {
      newErrors.region = 'Region must be less than 100 characters'
    }

    if (formData.gov_id && formData.gov_id.length > 50) {
      newErrors.gov_id = 'Government ID must be less than 50 characters'
    }

    if (formData.logo && !isValidUrl(formData.logo)) {
      newErrors.logo = 'Please enter a valid URL'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const isValidUrl = (string: string) => {
    try {
      new URL(string)
      return true
    } catch (_) {
      return false
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    try {
      await onSubmit(formData)
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
                  {isEditing ? 'Edit Institution' : 'Create New Institution'}
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Title Field */}
                  <div className="md:col-span-2">
                    <Input
                      label="Institution Title"
                      type="text"
                      value={formData.title}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange('title', e.target.value)}
                      placeholder="Enter institution title"
                      error={errors.title}
                      disabled={loading}
                      required
                    />
                  </div>

                  {/* Abbreviation Field */}
                  <Input
                    label="Abbreviation"
                    type="text"
                    value={formData.abbr}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange('abbr', e.target.value)}
                    placeholder="e.g., UCB, MIT"
                    error={errors.abbr}
                    disabled={loading}
                    required
                  />

                  {/* Government ID Field */}
                  <Input
                    label="Government ID"
                    type="text"
                    value={formData.gov_id}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange('gov_id', e.target.value)}
                    placeholder="Enter government ID"
                    error={errors.gov_id}
                    disabled={loading}
                  />

                  {/* Division Field */}
                  <Input
                    label="Division"
                    type="text"
                    value={formData.division}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange('division', e.target.value)}
                    placeholder="Enter division"
                    error={errors.division}
                    disabled={loading}
                  />

                  {/* Region Field */}
                  <Input
                    label="Region"
                    type="text"
                    value={formData.region}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange('region', e.target.value)}
                    placeholder="Enter region"
                    error={errors.region}
                    disabled={loading}
                  />

                  {/* Logo URL Field */}
                  <Input
                    label="Logo URL"
                    type="url"
                    value={formData.logo}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange('logo', e.target.value)}
                    placeholder="https://example.com/logo.png"
                    error={errors.logo}
                    disabled={loading}
                    helperText="Optional: URL to institution logo"
                  />

                  {/* Subscription Field */}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Subscription
                    </label>
                    <Select
                      value={formData.subscription_id}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleFieldChange('subscription_id', e.target.value)}
                      disabled={loading}
                      className="w-full"
                    >
                      <option value="">Select a subscription (optional)</option>
                      {subscriptions.map((subscription) => (
                        <option key={subscription.id} value={subscription.id}>
                          {subscription.title} - ${subscription.price}
                        </option>
                      ))}
                    </Select>
                    <p className="mt-1 text-xs text-gray-500">
                      Optional: Assign a subscription to this institution
                    </p>
                  </div>

                  {/* Address Field */}
                  <div className="md:col-span-2">
                    <div className="w-full">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Address
                      </label>
                      <Textarea
                        value={formData.address}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleFieldChange('address', e.target.value)}
                        placeholder="Enter institution address"
                        disabled={loading}
                        rows={3}
                        className={errors.address ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''}
                      />
                      {errors.address && (
                        <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          {errors.address}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
                  <Button
                    type="button"
                    onClick={handleClose}
                    disabled={loading}
                    variant="outline"
                    color="secondary"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading}
                    color="primary"
                  >
                    {loading ? 'Saving...' : (isEditing ? 'Update Institution' : 'Create Institution')}
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