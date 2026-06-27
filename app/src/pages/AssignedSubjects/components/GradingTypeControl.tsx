import React, { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { CalculatorIcon, TagIcon } from '@heroicons/react/24/outline'
import { Select } from '../../../components/select'
import { useGradingScales } from '../../../hooks/useGradingScales'
import { subjectService } from '../../../services/subjectService'
import type { GradingType } from '../../../types'

interface GradingTypeControlProps {
  subjectId: string
  gradingType?: GradingType
  gradingScaleId?: string | null
}

export const GradingTypeControl: React.FC<GradingTypeControlProps> = ({
  subjectId,
  gradingType,
  gradingScaleId,
}) => {
  const queryClient = useQueryClient()
  const { gradingScales } = useGradingScales()

  const [type, setType] = useState<GradingType>(gradingType === 'non_numerical' ? 'non_numerical' : 'numerical')
  const [scaleId, setScaleId] = useState<string>(gradingScaleId || '')
  const [saving, setSaving] = useState(false)

  // Keep local state in sync when the subject reloads.
  useEffect(() => {
    setType(gradingType === 'non_numerical' ? 'non_numerical' : 'numerical')
    setScaleId(gradingScaleId || '')
  }, [gradingType, gradingScaleId])

  const save = async (nextType: GradingType, nextScaleId: string | null) => {
    setSaving(true)
    try {
      await subjectService.updateSubject(subjectId, {
        grading_type: nextType,
        grading_scale_id: nextType === 'non_numerical' ? nextScaleId : null,
      })
      await queryClient.invalidateQueries({ queryKey: ['subject-detail', subjectId] })
      queryClient.invalidateQueries({ queryKey: ['subjects'] })
      toast.success('Grading type updated')
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to update grading type'
      toast.error(message)
      // Revert local state on failure.
      setType(gradingType === 'non_numerical' ? 'non_numerical' : 'numerical')
      setScaleId(gradingScaleId || '')
    } finally {
      setSaving(false)
    }
  }

  const handleSelectType = (nextType: GradingType) => {
    if (nextType === type) return
    setType(nextType)
    if (nextType === 'numerical') {
      void save('numerical', null)
    } else if (scaleId) {
      // Already have a scale → apply immediately.
      void save('non_numerical', scaleId)
    }
    // Non-numerical without a scale yet: wait for the user to pick one below.
  }

  const handleSelectScale = (nextScaleId: string) => {
    setScaleId(nextScaleId)
    if (nextScaleId) void save('non_numerical', nextScaleId)
  }

  const segmentBase =
    'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors disabled:opacity-50'

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="inline-flex rounded-lg bg-gray-100 p-1">
        <button
          type="button"
          disabled={saving}
          onClick={() => handleSelectType('numerical')}
          className={`${segmentBase} ${
            type === 'numerical' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <CalculatorIcon className="w-4 h-4" />
          Numerical
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => handleSelectType('non_numerical')}
          className={`${segmentBase} ${
            type === 'non_numerical' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <TagIcon className="w-4 h-4" />
          Non-Numerical
        </button>
      </div>

      {type === 'non_numerical' &&
        (gradingScales.length === 0 ? (
          <span className="text-xs text-amber-600">
            No grading scales yet — create one under Grading Scales first.
          </span>
        ) : (
          <div className="min-w-[180px]">
            <Select
              value={scaleId}
              onChange={(e) => handleSelectScale(e.target.value)}
              disabled={saving}
              placeholder="Choose a grading scale..."
              options={gradingScales.map((scale) => ({ value: scale.id, label: scale.name }))}
            />
          </div>
        ))}
    </div>
  )
}
