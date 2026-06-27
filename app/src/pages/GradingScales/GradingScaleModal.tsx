import React, { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '../../components/button'
import { Input } from '../../components/input'
import type { GradingScale, CreateGradingScaleData, GradingScaleBandInput } from '../../types'

interface GradingScaleModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: CreateGradingScaleData) => void
  gradingScale: GradingScale | null
  loading?: boolean
}

interface BandRow {
  label: string
  min_score: string
  max_score: string
}

const emptyRow = (): BandRow => ({ label: '', min_score: '', max_score: '' })

export function GradingScaleModal({
  isOpen,
  onClose,
  onSubmit,
  gradingScale,
  loading = false,
}: GradingScaleModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [rows, setRows] = useState<BandRow[]>([emptyRow()])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setError(null)
    if (gradingScale) {
      setName(gradingScale.name)
      setDescription(gradingScale.description ?? '')
      setRows(
        gradingScale.bands.length > 0
          ? gradingScale.bands.map((b) => ({
              label: b.label,
              min_score: String(b.min_score),
              max_score: String(b.max_score),
            }))
          : [emptyRow()],
      )
    } else {
      setName('')
      setDescription('')
      setRows([emptyRow()])
    }
  }, [isOpen, gradingScale])

  const updateRow = (index: number, patch: Partial<BandRow>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const addRow = () => setRows((prev) => [...prev, emptyRow()])
  const removeRow = (index: number) =>
    setRows((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Scale name is required.')
      return
    }

    const bands: GradingScaleBandInput[] = []
    for (const [i, r] of rows.entries()) {
      if (!r.label.trim() && r.min_score === '' && r.max_score === '') continue
      if (!r.label.trim()) {
        setError(`Row ${i + 1}: label is required.`)
        return
      }
      const min = Number(r.min_score)
      const max = Number(r.max_score)
      if (r.min_score === '' || Number.isNaN(min) || min < 0 || min > 100) {
        setError(`Row ${i + 1}: min must be between 0 and 100.`)
        return
      }
      if (r.max_score === '' || Number.isNaN(max) || max < 0 || max > 100) {
        setError(`Row ${i + 1}: max must be between 0 and 100.`)
        return
      }
      if (max < min) {
        setError(`Row ${i + 1}: max must be greater than or equal to min.`)
        return
      }
      bands.push({ label: r.label.trim(), min_score: min, max_score: max })
    }

    if (bands.length === 0) {
      setError('Add at least one grade band.')
      return
    }

    onSubmit({ name: name.trim(), description: description.trim() || null, bands })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {gradingScale ? 'Edit Grading Scale' : 'Add Grading Scale'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Scale name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Letter Grade (A–F), Marking (E/S/P)"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description (optional)
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short note about when to use this scale"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Grade bands</label>
              <Button type="button" variant="outline" size="sm" onClick={addRow} className="flex items-center gap-1">
                <Plus className="w-4 h-4" />
                Add band
              </Button>
            </div>
            <p className="text-xs text-gray-500 mb-2">
              Each band maps a numeric range to a label. A computed grade falling within [min, max] shows its label.
            </p>

            <div className="grid grid-cols-[1fr_5rem_5rem_2rem] gap-2 text-xs font-medium text-gray-500 px-1 mb-1">
              <span>Label</span>
              <span>Min</span>
              <span>Max</span>
              <span />
            </div>

            <div className="space-y-2">
              {rows.map((row, index) => (
                <div key={index} className="grid grid-cols-[1fr_5rem_5rem_2rem] gap-2 items-center">
                  <Input
                    value={row.label}
                    onChange={(e) => updateRow(index, { label: e.target.value })}
                    placeholder="A"
                  />
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={row.min_score}
                    onChange={(e) => updateRow(index, { min_score: e.target.value })}
                    placeholder="90"
                  />
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={row.max_score}
                    onChange={(e) => updateRow(index, { max_score: e.target.value })}
                    placeholder="100"
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    disabled={rows.length === 1}
                    className="text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Remove band"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? 'Saving...' : gradingScale ? 'Update' : 'Add'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
