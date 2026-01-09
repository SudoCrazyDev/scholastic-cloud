import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { useAuth } from '../../hooks/useAuth'
import { useRoleAccess } from '../../hooks/useRoleAccess'
import { institutionService } from '../../services/institutionService'
import { Input } from '../../components/input'
import { Button } from '../../components/button'
import { Textarea } from '../../components/textarea'
import { Alert } from '../../components/alert'
import { Building2 } from 'lucide-react'
import { TrashIcon } from '@heroicons/react/24/outline'
import type { UpdateInstitutionData } from '../../types'

const Settings: React.FC = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { hasAccess } = useRoleAccess(['principal', 'institution-administrator'])
  const [formData, setFormData] = useState({
    title: '',
    abbr: '',
    address: '',
    division: '',
    region: '',
    gov_id: '',
    logo: null as File | null,
  })
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [errors, setErrors] = useState<{ [key: string]: string }>({})
  const [formError, setFormError] = useState<string | null>(null)

  // Get user's institution ID
  const institutionId = user?.user_institutions?.[0]?.institution_id

  // Fetch institution data
  const {
    data: institutionResponse,
    isLoading: loading,
    error,
  } = useQuery({
    queryKey: ['institution', institutionId],
    queryFn: () => institutionService.getInstitution(institutionId!),
    enabled: !!institutionId && hasAccess,
  })

  const institution = institutionResponse?.data

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: UpdateInstitutionData) =>
      institutionService.updateInstitution(institutionId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['institution', institutionId] })
      setFormError(null)
      toast.success('Institution updated successfully!')
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.message || 'Failed to update institution'
      setFormError(errorMessage)
      toast.error(errorMessage)
    },
  })

  // Redirect if user doesn't have access
  useEffect(() => {
    if (!hasAccess) {
      navigate('/dashboard')
    }
  }, [hasAccess, navigate])

  // Populate form when institution is loaded
  useEffect(() => {
    if (institution) {
      setFormData({
        title: institution.title,
        abbr: institution.abbr,
        address: institution.address || '',
        division: institution.division || '',
        region: institution.region || '',
        gov_id: institution.gov_id || '',
        logo: null,
      })
      setLogoPreview(institution.logo || null)
    }
  }, [institution])

  const handleFieldChange = (field: string, value: string | File | null) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
    if (formError) {
      setFormError(null)
    }
  }

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setErrors(prev => ({ ...prev, logo: 'Please select an image file' }))
        return
      }
      // Validate file size (2MB max)
      if (file.size > 2 * 1024 * 1024) {
        setErrors(prev => ({ ...prev, logo: 'File size must be less than 2MB' }))
        return
      }
      handleFieldChange('logo', file)
      // Create preview
      const reader = new FileReader()
      reader.onloadend = () => {
        setLogoPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
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

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    setFormError(null)
    // Prepare data for mutation - include logo only if it's a File
    const submitData: UpdateInstitutionData = {
      title: formData.title,
      abbr: formData.abbr,
      address: formData.address,
      division: formData.division,
      region: formData.region,
      gov_id: formData.gov_id,
    }
    if (formData.logo instanceof File) {
      submitData.logo = formData.logo
    }
    updateMutation.mutate(submitData)
  }

  if (!hasAccess) {
    return null
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <span className="ml-3 text-gray-600">Loading institution settings...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Institution</h3>
          <p className="text-gray-500">{(error as Error)?.message || 'Failed to load institution data'}</p>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
            <Building2 className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Institution Settings</h1>
            <p className="text-sm text-gray-600">
              Manage your institution information and details
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      {institution && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {formError && (
              <Alert
                type="error"
                message={formError}
                onClose={() => setFormError(null)}
                show={true}
              />
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
                  disabled={updateMutation.isPending}
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
                disabled={updateMutation.isPending}
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
                disabled={updateMutation.isPending}
              />

              {/* Division Field */}
              <Input
                label="Division"
                type="text"
                value={formData.division}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange('division', e.target.value)}
                placeholder="Enter division"
                error={errors.division}
                disabled={updateMutation.isPending}
              />

              {/* Region Field */}
              <Input
                label="Region"
                type="text"
                value={formData.region}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange('region', e.target.value)}
                placeholder="Enter region"
                error={errors.region}
                disabled={updateMutation.isPending}
              />

              {/* Logo File Upload Field */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Logo
                </label>
                <div className="space-y-3">
                  {logoPreview && (
                    <div className="relative inline-block">
                      <img
                        src={logoPreview}
                        alt="Logo preview"
                        className="h-20 w-20 object-contain border border-gray-300 rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setLogoPreview(null)
                          handleFieldChange('logo', null)
                        }}
                        className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors duration-200 shadow-md"
                        disabled={updateMutation.isPending}
                        title="Remove logo"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  <div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoChange}
                      disabled={updateMutation.isPending}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 file:cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    {errors.logo && (
                      <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                        <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        {errors.logo}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Address Field */}
              <div>
                <div className="w-full">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Address
                  </label>
                  <Textarea
                    value={formData.address}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleFieldChange('address', e.target.value)}
                    placeholder="Enter institution address"
                    disabled={updateMutation.isPending}
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
                type="submit"
                disabled={updateMutation.isPending}
                color="primary"
              >
                {updateMutation.isPending ? 'Saving...' : 'Update Institution'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </motion.div>
  )
}

export default Settings
