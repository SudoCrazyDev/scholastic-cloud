import { useState } from 'react'
import { PencilIcon, CheckIcon, XMarkIcon, HeartIcon } from '@heroicons/react/24/outline'
import { Input } from '../../../components/input'
import { Button } from '../../../components/button'
import { Badge } from '../../../components/badge'
import { toast } from 'react-hot-toast'
import { studentService } from '../../../services/studentService'
import type { Student, StudentHealthRecord } from '../../../types'

interface StudentMedicalTabProps {
  student: Student
  onUpdated: (student: Student) => void
}

const emptyHealth = (): StudentHealthRecord => ({
  had_chicken_pox: false, had_chicken_pox_note: '',
  had_chicken_pox_vaccine: false, had_chicken_pox_vaccine_note: '',
  hospitalization_past_year: false, hospitalization_past_year_note: '',
  chronic_condition: false, chronic_condition_note: '',
  allergies: false, allergies_note: '',
  other_medical_problems: false, other_medical_problems_note: '',
})

// [answer field, note field, label, note prompt]
const ITEMS: [keyof StudentHealthRecord, keyof StudentHealthRecord, string, string][] = [
  ['had_chicken_pox', 'had_chicken_pox_note', 'Had chicken pox', 'When?'],
  ['had_chicken_pox_vaccine', 'had_chicken_pox_vaccine_note', 'Had chicken pox vaccine', 'When?'],
  ['hospitalization_past_year', 'hospitalization_past_year_note', 'Hospitalized in the past year', 'Details'],
  ['chronic_condition', 'chronic_condition_note', 'Has a chronic condition', 'Details'],
  ['allergies', 'allergies_note', 'Has allergies', 'Details'],
  ['other_medical_problems', 'other_medical_problems_note', 'Other medical problems', 'Details'],
]

export function StudentMedicalTab({ student, onUpdated }: StudentMedicalTabProps) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [health, setHealth] = useState<StudentHealthRecord>(student.health_record ?? emptyHealth())

  const startEdit = () => {
    setHealth(student.health_record ?? emptyHealth())
    setEditing(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const response = await studentService.updateAdmissionRecord(student.id, { health_record: health })
      if (response.success) {
        onUpdated(response.data)
        setEditing(false)
        toast.success('Medical record updated')
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const saved = student.health_record

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        {editing ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>
              <XMarkIcon className="w-4 h-4 mr-1" /> Cancel
            </Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={handleSave} disabled={saving}>
              <CheckIcon className="w-4 h-4 mr-1" /> {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        ) : (
          <Button className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={startEdit}>
            <PencilIcon className="w-4 h-4 mr-1" /> Edit
          </Button>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <HeartIcon className="w-5 h-5 text-rose-500" /> Health Information
        </h3>

        {!editing && !saved && (
          <p className="text-sm text-gray-500">No medical record yet. Click Edit to add one.</p>
        )}

        <div className="divide-y divide-gray-100">
          {ITEMS.map(([answerKey, noteKey, label, prompt]) => {
            const answer = editing ? (health[answerKey] as boolean) : !!saved?.[answerKey]
            const note = editing ? (health[noteKey] as string) : (saved?.[noteKey] as string | undefined)
            return (
              <div key={answerKey as string} className="py-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-900 font-medium">{label}</span>
                  {editing ? (
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        checked={answer}
                        onChange={e => setHealth({ ...health, [answerKey]: e.target.checked })}
                      />
                      <span className="text-sm text-gray-600">Yes</span>
                    </label>
                  ) : (
                    <Badge color={answer ? 'amber' : 'zinc'}>{answer ? 'Yes' : 'No'}</Badge>
                  )}
                </div>
                {answer && (
                  <div className="mt-2">
                    {editing ? (
                      <Input
                        label={prompt}
                        value={note ?? ''}
                        onChange={e => setHealth({ ...health, [noteKey]: e.target.value })}
                      />
                    ) : (
                      note ? <p className="text-sm text-gray-600"><span className="text-gray-400">{prompt}: </span>{note}</p> : null
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
