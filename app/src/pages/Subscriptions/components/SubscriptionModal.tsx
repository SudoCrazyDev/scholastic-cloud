import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { Input } from '../../../components/input'
import { Textarea } from '../../../components/textarea'
import { Button } from '../../../components/button'
import type { Subscription, CreateSubscriptionData } from '../../../types'

interface SubscriptionModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: CreateSubscriptionData) => Promise<void>
  subscription?: Subscription | null
  loading?: boolean
  error?: string | null
}

export function SubscriptionModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  subscription, 
  loading = false,
  error = null 
}: SubscriptionModalProps) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    price: '',
  })
  const [errors, setErrors] = useState<{ [key: string]: string }>({})

  const isEditing = !!subscription

  // Reset form when modal opens/closes or subscription changes
  useEffect(() => {
    if (isOpen) {
      if (subscription) {
        setFormData({
          title: subscription.title,
          description: subscription.description || '',
          price: subscription.price.toString(),
        })
      } else {
        setFormData({
          title: '',
          description: '',
          price: '',
        })
      }
      setErrors({})
    }
  }, [isOpen, subscription])

  const handleTitleChange = (value: string) => {
    setFormData(prev => ({ ...prev, title: value }))
    if (errors.title) {
      setErrors(prev => ({ ...prev, title: '' }))
    }
  }

  const handleDescriptionChange = (value: string) => {
    setFormData(prev => ({ ...prev, description: value }))
    if (errors.description) {
      setErrors(prev => ({ ...prev, description: '' }))
    }
  }

  const handlePriceChange = (value: string) => {
    // Only allow numbers and decimal points
    const numericValue = value.replace(/[^0-9.]/g, '')
    setFormData(prev => ({ ...prev, price: numericValue }))
    if (errors.price) {
      setErrors(prev => ({ ...prev, price: '' }))
    }
  }

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {}

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required'
    } else if (formData.title.length < 2) {
      newErrors.title = 'Title must be at least 2 characters'
    } else if (formData.title.length > 100) {
      newErrors.title = 'Title must be less than 100 characters'
    }

    if (formData.description && formData.description.length > 500) {
      newErrors.description = 'Description must be less than 500 characters'
    }

    if (!formData.price.trim()) {
      newErrors.price = 'Price is required'
    } else {
      const priceValue = parseFloat(formData.price)
      if (isNaN(priceValue)) {
        newErrors.price = 'Price must be a valid number'
      } else if (priceValue < 0) {
        newErrors.price = 'Price cannot be negative'
      } else if (priceValue > 999999.99) {
        newErrors.price = 'Price cannot exceed $999,999.99'
      }
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
      const submitData: CreateSubscriptionData = {
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        price: parseFloat(formData.price),
      }
      
      await onSubmit(submitData)
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
              className="relative w-full max-w-md bg-white rounded-lg shadow-xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  {isEditing ? 'Edit Subscription' : 'Create New Subscription'}
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

                {/* Title Field */}
                <Input
                  label="Title"
                  type="text"
                  value={formData.title}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleTitleChange(e.target.value)}
                  placeholder="Enter subscription title"
                  error={errors.title}
                  disabled={loading}
                  required
                />

                {/* Description Field */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Description
                  </label>
                  <Textarea
                    value={formData.description}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleDescriptionChange(e.target.value)}
                    placeholder="Enter subscription description (optional)"
                    disabled={loading}
                    rows={3}
                  />
                  {errors.description && (
                    <p className="text-sm text-red-600">{errors.description}</p>
                  )}
                </div>

                {/* Price Field */}
                <Input
                  label="Price"
                  type="text"
                  value={formData.price}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handlePriceChange(e.target.value)}
                  placeholder="0.00"
                  error={errors.price}
                  disabled={loading}
                  helperText="Enter price in dollars (e.g., 29.99)"
                  required
                />

                {/* Actions */}
                <div className="flex items-center justify-end space-x-3 pt-4">
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
                    loading={loading}
                    color="primary"
                  >
                    {isEditing ? 'Update Subscription' : 'Create Subscription'}
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