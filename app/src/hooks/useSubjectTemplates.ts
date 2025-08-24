import { useState, useEffect, useCallback } from 'react'
import { subjectTemplateService } from '../services/subjectTemplateService'
import type { SubjectTemplate, CreateSubjectTemplateData, UpdateSubjectTemplateData } from '../types'

export function useSubjectTemplates(params?: { grade_level?: string; search?: string }) {
  const [templates, setTemplates] = useState<SubjectTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await subjectTemplateService.getAll(params)
      if (response.success) {
        setTemplates(response.data)
      } else {
        setError(response.message || 'Failed to fetch templates')
      }
    } catch (err) {
      setError('Failed to fetch templates')
      console.error('Error fetching templates:', err)
    } finally {
      setLoading(false)
    }
  }, [params?.grade_level, params?.search, refreshKey])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  const triggerRefresh = () => {
    setRefreshKey(prev => prev + 1)
  }

  const createTemplate = async (data: CreateSubjectTemplateData) => {
    setError(null)
    try {
      const response = await subjectTemplateService.create(data)
      if (response.success) {
        triggerRefresh() // Force refresh
        return response.data
      } else {
        setError(response.message || 'Failed to create template')
        throw new Error(response.message || 'Failed to create template')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create template'
      setError(errorMessage)
      throw err
    }
  }

  const updateTemplate = async (id: string, data: UpdateSubjectTemplateData) => {
    setError(null)
    try {
      const response = await subjectTemplateService.update(id, data)
      if (response.success) {
        triggerRefresh() // Force refresh
        return response.data
      } else {
        setError(response.message || 'Failed to update template')
        throw new Error(response.message || 'Failed to update template')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update template'
      setError(errorMessage)
      throw err
    }
  }

  const deleteTemplate = async (id: string) => {
    setError(null)
    try {
      const response = await subjectTemplateService.delete(id)
      if (response.success) {
        triggerRefresh() // Force refresh
      } else {
        setError(response.message || 'Failed to delete template')
        throw new Error(response.message || 'Failed to delete template')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete template'
      setError(errorMessage)
      throw err
    }
  }

  const applyTemplateToSection = async (templateId: string, classSectionId: string) => {
    setError(null)
    try {
      const response = await subjectTemplateService.applyToSection(templateId, classSectionId)
      if (response.success) {
        return response.data
      } else {
        setError(response.message || 'Failed to apply template')
        throw new Error(response.message || 'Failed to apply template')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to apply template'
      setError(errorMessage)
      throw err
    }
  }

  return {
    templates,
    loading,
    error,
    fetchTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    applyTemplateToSection
  }
}