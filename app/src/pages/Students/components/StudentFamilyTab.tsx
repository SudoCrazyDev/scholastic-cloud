import { useState } from 'react'
import { PencilIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { Input } from '../../../components/input'
import { Button } from '../../../components/button'
import { toast } from 'react-hot-toast'
import { studentService } from '../../../services/studentService'
import type { Student, StudentProfile, StudentGuardian, StudentEmergencyContact } from '../../../types'

interface StudentFamilyTabProps {
  student: Student
  onUpdated: (student: Student) => void
}

const emptyProfile = (): StudentProfile => ({
  complete_address: '', mobile_number: '', place_of_birth: '', mother_tongue: '',
  last_school_attended: '', school_year: '', school_address: '',
  brothers_count: null, sisters_count: null,
})

const emptyGuardian = (relation: StudentGuardian['relation']): StudentGuardian => ({
  relation, name: '', age: null, occupation: '',
})

const emptyContact = (): StudentEmergencyContact => ({
  name: '', address: '', relationship: '', age: null, contact_number: '',
})

const numOrNull = (v: string): number | null => (v.trim() === '' ? null : Number(v))

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-500 mb-1">{label}</label>
      <p className="text-gray-900">{value === null || value === undefined || value === '' ? 'N/A' : value}</p>
    </div>
  )
}

export function StudentFamilyTab({ student, onUpdated }: StudentFamilyTabProps) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const [profile, setProfile] = useState<StudentProfile>(student.profile ?? emptyProfile())
  const [father, setFather] = useState<StudentGuardian>(
    student.guardians?.find(g => g.relation === 'father') ?? emptyGuardian('father')
  )
  const [mother, setMother] = useState<StudentGuardian>(
    student.guardians?.find(g => g.relation === 'mother') ?? emptyGuardian('mother')
  )
  const [contact, setContact] = useState<StudentEmergencyContact>(
    student.emergency_contacts?.[0] ?? emptyContact()
  )

  const startEdit = () => {
    setProfile(student.profile ?? emptyProfile())
    setFather(student.guardians?.find(g => g.relation === 'father') ?? emptyGuardian('father'))
    setMother(student.guardians?.find(g => g.relation === 'mother') ?? emptyGuardian('mother'))
    setContact(student.emergency_contacts?.[0] ?? emptyContact())
    setEditing(true)
  }

  const hasGuardianData = (g: StudentGuardian) => g.name || g.age != null || g.occupation
  const hasContactData = (c: StudentEmergencyContact) => c.name || c.contact_number || c.address || c.relationship || c.age != null

  const handleSave = async () => {
    setSaving(true)
    try {
      const guardians: StudentGuardian[] = [father, mother].filter(hasGuardianData)
      const emergency_contacts: StudentEmergencyContact[] = hasContactData(contact) ? [contact] : []
      const response = await studentService.updateAdmissionRecord(student.id, {
        profile, guardians, emergency_contacts,
      })
      if (response.success) {
        onUpdated(response.data)
        setEditing(false)
        toast.success('Family & background updated')
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const savedProfile = student.profile
  const savedFather = student.guardians?.find(g => g.relation === 'father')
  const savedMother = student.guardians?.find(g => g.relation === 'mother')
  const savedContact = student.emergency_contacts?.[0]

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

      {/* Background / extended personal */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Background</h3>
        {editing ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Complete Address" value={profile.complete_address ?? ''} onChange={e => setProfile({ ...profile, complete_address: e.target.value })} />
            <Input label="Mobile Number" value={profile.mobile_number ?? ''} onChange={e => setProfile({ ...profile, mobile_number: e.target.value })} />
            <Input label="Place of Birth" value={profile.place_of_birth ?? ''} onChange={e => setProfile({ ...profile, place_of_birth: e.target.value })} />
            <Input label="Mother Tongue" value={profile.mother_tongue ?? ''} onChange={e => setProfile({ ...profile, mother_tongue: e.target.value })} />
            <Input label="Last School Attended" value={profile.last_school_attended ?? ''} onChange={e => setProfile({ ...profile, last_school_attended: e.target.value })} />
            <Input label="School Year" value={profile.school_year ?? ''} onChange={e => setProfile({ ...profile, school_year: e.target.value })} />
            <Input label="School Address" value={profile.school_address ?? ''} onChange={e => setProfile({ ...profile, school_address: e.target.value })} />
            <Input label="Brothers" type="number" min={0} value={profile.brothers_count ?? ''} onChange={e => setProfile({ ...profile, brothers_count: numOrNull(e.target.value) })} />
            <Input label="Sisters" type="number" min={0} value={profile.sisters_count ?? ''} onChange={e => setProfile({ ...profile, sisters_count: numOrNull(e.target.value) })} />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Field label="Complete Address" value={savedProfile?.complete_address} />
            <Field label="Mobile Number" value={savedProfile?.mobile_number} />
            <Field label="Place of Birth" value={savedProfile?.place_of_birth} />
            <Field label="Mother Tongue" value={savedProfile?.mother_tongue} />
            <Field label="Last School Attended" value={savedProfile?.last_school_attended} />
            <Field label="School Year" value={savedProfile?.school_year} />
            <Field label="School Address" value={savedProfile?.school_address} />
            <Field label="Brothers" value={savedProfile?.brothers_count} />
            <Field label="Sisters" value={savedProfile?.sisters_count} />
          </div>
        )}
      </div>

      {/* Parents / guardians */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Family Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {([['Father', father, setFather, savedFather], ['Mother', mother, setMother, savedMother]] as const).map(
            ([title, g, setG, savedG]) => (
              <div key={title}>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">{title}</h4>
                {editing ? (
                  <div className="space-y-3">
                    <Input label="Name" value={g.name ?? ''} onChange={e => setG({ ...g, name: e.target.value })} />
                    <Input label="Age" type="number" min={0} value={g.age ?? ''} onChange={e => setG({ ...g, age: numOrNull(e.target.value) })} />
                    <Input label="Occupation" value={g.occupation ?? ''} onChange={e => setG({ ...g, occupation: e.target.value })} />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Field label="Name" value={savedG?.name} />
                    <Field label="Age" value={savedG?.age} />
                    <Field label="Occupation" value={savedG?.occupation} />
                  </div>
                )}
              </div>
            )
          )}
        </div>
      </div>

      {/* Emergency contact */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Emergency Contact</h3>
        {editing ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Name" value={contact.name ?? ''} onChange={e => setContact({ ...contact, name: e.target.value })} />
            <Input label="Relationship" value={contact.relationship ?? ''} onChange={e => setContact({ ...contact, relationship: e.target.value })} />
            <Input label="Contact Number" value={contact.contact_number ?? ''} onChange={e => setContact({ ...contact, contact_number: e.target.value })} />
            <Input label="Age" type="number" min={0} value={contact.age ?? ''} onChange={e => setContact({ ...contact, age: numOrNull(e.target.value) })} />
            <Input label="Address" value={contact.address ?? ''} onChange={e => setContact({ ...contact, address: e.target.value })} />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Field label="Name" value={savedContact?.name} />
            <Field label="Relationship" value={savedContact?.relationship} />
            <Field label="Contact Number" value={savedContact?.contact_number} />
            <Field label="Age" value={savedContact?.age} />
            <Field label="Address" value={savedContact?.address} />
          </div>
        )}
      </div>
    </div>
  )
}
