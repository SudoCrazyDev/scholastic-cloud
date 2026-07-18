import React, { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { Link } from 'react-router-dom'
import { CheckCircleIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import { Button } from '../../components/button'
import { Input } from '../../components/input'
import { Select } from '../../components/select'
import { siblingGroupService } from '../../services/siblingGroupService'
import { studentService } from '../../services/studentService'
import { useAuth } from '../../hooks/useAuth'
import { useDebounce } from '../../hooks/useDebounce'
import type { SiblingGroup, SiblingGroupMember, Student } from '../../types'

const MANAGE_ROLES = ['finance', 'institution-administrator', 'principal', 'super-administrator']

const errorMessage = (error: unknown, fallback: string) => {
  if (error instanceof AxiosError) {
    const message = (error.response?.data as { message?: string } | undefined)?.message
    if (message) return message
  }
  return fallback
}

const studentFullName = (student?: Student | null) =>
  student ? [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(' ') : 'Unknown student'

const formatDiscount = (type?: string | null, value?: number | string | null) => {
  if (!type || value === null || value === undefined || value === '') return null
  return type === 'percentage'
    ? `${Number(value)}%`
    : new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Number(value))
}

interface StudentSearchPickerProps {
  placeholder: string
  excludedIds: string[]
  onPick: (student: Student) => void
  disabled?: boolean
}

const StudentSearchPicker: React.FC<StudentSearchPickerProps> = ({ placeholder, excludedIds, onPick, disabled }) => {
  const [term, setTerm] = useState('')
  const debouncedTerm = useDebounce(term)

  const searchQuery = useQuery({
    queryKey: ['students-sibling-search', debouncedTerm],
    queryFn: () => studentService.searchStudentsForAssignment({ search: debouncedTerm, per_page: 20 }),
    enabled: debouncedTerm.length >= 2,
  })

  const results = (searchQuery.data?.data || []).filter((student) => !excludedIds.includes(student.id))

  return (
    <div className="relative">
      <Input
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
      {debouncedTerm.length >= 2 && (
        <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {searchQuery.isLoading ? (
            <p className="px-4 py-3 text-sm text-gray-500">Searching…</p>
          ) : results.length ? (
            results.map((student) => (
              <button
                key={student.id}
                type="button"
                className="w-full px-4 py-2 text-left text-sm hover:bg-indigo-50"
                onClick={() => {
                  onPick(student)
                  setTerm('')
                }}
              >
                <span className="font-medium text-gray-900">{studentFullName(student)}</span>
                {student.lrn && <span className="ml-2 text-gray-500">LRN {student.lrn}</span>}
              </button>
            ))
          ) : (
            <p className="px-4 py-3 text-sm text-gray-500">No matching students.</p>
          )}
        </div>
      )}
    </div>
  )
}

interface MemberRowProps {
  group: SiblingGroup
  member: SiblingGroupMember
  academicYear: string
  canManage: boolean
}

const MemberRow: React.FC<MemberRowProps> = ({ group, member, academicYear, canManage }) => {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draftType, setDraftType] = useState<'fixed' | 'percentage'>(member.discount_type || 'fixed')
  const [draftValue, setDraftValue] = useState(
    member.discount_value !== null && member.discount_value !== undefined ? String(member.discount_value) : ''
  )

  const appliedDiscount = (group.discounts || []).find((discount) => discount.student_id === member.student_id)
  const intendedLabel = formatDiscount(member.discount_type, member.discount_value)

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['sibling-groups'] })
    queryClient.invalidateQueries({ queryKey: ['student-ledger'] })
    queryClient.invalidateQueries({ queryKey: ['student-noa'] })
  }

  const updateMutation = useMutation({
    mutationFn: () =>
      siblingGroupService.updateMember(group.id, member.id, {
        discount_type: draftValue === '' ? null : draftType,
        discount_value: draftValue === '' ? null : Number(draftValue),
      }),
    onSuccess: () => {
      invalidate()
      setEditing(false)
      toast.success('Sibling discount updated.')
    },
    onError: (error: unknown) => {
      toast.error(errorMessage(error, 'Failed to update sibling discount.'))
    },
  })

  const applyMutation = useMutation({
    mutationFn: () => siblingGroupService.applyDiscount(group.id, member.id, { academic_year: academicYear }),
    onSuccess: () => {
      invalidate()
      toast.success('Sibling discount applied.')
    },
    onError: (error: unknown) => {
      toast.error(errorMessage(error, 'Failed to apply sibling discount.'))
    },
  })

  const removeMutation = useMutation({
    mutationFn: () => siblingGroupService.removeMember(group.id, member.id),
    onSuccess: () => {
      invalidate()
      toast.success('Sibling removed from the group.')
    },
    onError: (error: unknown) => {
      toast.error(errorMessage(error, 'Failed to remove sibling.'))
    },
  })

  const handleSave = () => {
    if (draftValue !== '') {
      const value = Number(draftValue)
      if (!value || value <= 0) {
        toast.error('Discount value must be greater than zero.')
        return
      }
      if (draftType === 'percentage' && value > 100) {
        toast.error('Percentage discount cannot exceed 100%.')
        return
      }
    }
    updateMutation.mutate()
  }

  const handleRemove = () => {
    if (window.confirm(`Remove ${studentFullName(member.student)} from this sibling group?`)) {
      removeMutation.mutate()
    }
  }

  return (
    <tr>
      <td className="px-4 py-3">
        <Link to={`/students/${member.student_id}`} className="font-medium text-indigo-600 hover:text-indigo-800">
          {studentFullName(member.student)}
        </Link>
        {member.student?.lrn && <div className="text-sm text-gray-500">LRN {member.student.lrn}</div>}
      </td>
      <td className="px-4 py-3">
        {editing ? (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={draftType}
              onChange={(event) => setDraftType(event.target.value as 'fixed' | 'percentage')}
              options={[
                { value: 'fixed', label: 'Fixed Amount' },
                { value: 'percentage', label: 'Percentage' },
              ]}
              disabled={updateMutation.isPending}
            />
            <Input
              type="number"
              min="0"
              step="0.01"
              value={draftValue}
              onChange={(event) => setDraftValue(event.target.value)}
              placeholder="No discount"
              className="w-28"
              disabled={updateMutation.isPending}
            />
            <Button size="sm" loading={updateMutation.isPending} onClick={handleSave}>
              Save
            </Button>
            <Button size="sm" variant="outline" disabled={updateMutation.isPending} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className={intendedLabel ? 'font-medium text-gray-900 tabular-nums' : 'text-gray-400'}>
              {intendedLabel || 'No discount set'}
            </span>
            {canManage && (
              <button
                type="button"
                className="text-sm text-indigo-600 hover:text-indigo-800"
                onClick={() => {
                  setDraftType(member.discount_type || 'fixed')
                  setDraftValue(
                    member.discount_value !== null && member.discount_value !== undefined
                      ? String(member.discount_value)
                      : ''
                  )
                  setEditing(true)
                }}
              >
                Edit
              </button>
            )}
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        {appliedDiscount ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-sm font-medium text-green-700">
            <CheckCircleIcon className="w-4 h-4" />
            Applied {formatDiscount(appliedDiscount.discount_type, appliedDiscount.value)}
          </span>
        ) : (
          <span className="text-sm text-gray-400">Not applied</span>
        )}
      </td>
      {canManage && (
        <td className="px-4 py-3">
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              disabled={Boolean(appliedDiscount) || !intendedLabel || applyMutation.isPending}
              loading={applyMutation.isPending}
              onClick={() => applyMutation.mutate()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-gray-300"
            >
              Apply
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={removeMutation.isPending}
              onClick={handleRemove}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              <XMarkIcon className="w-4 h-4" />
            </Button>
          </div>
        </td>
      )}
    </tr>
  )
}

const SiblingDiscountsView: React.FC = () => {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const roleSlug: string | undefined = user?.role?.slug
  const canManage = Boolean(roleSlug && MANAGE_ROLES.includes(roleSlug))

  const currentYear = new Date().getFullYear()
  const [academicYear, setAcademicYear] = useState(`${currentYear}-${currentYear + 1}`)
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearch = useDebounce(searchTerm)

  const [newGroupName, setNewGroupName] = useState('')
  const [pickedStudents, setPickedStudents] = useState<Student[]>([])
  const [addingToGroupId, setAddingToGroupId] = useState<string | null>(null)

  const academicYearOptions = useMemo(() => {
    const years = []
    for (let offset = 0; offset < 6; offset += 1) {
      const start = currentYear - offset
      const yearLabel = `${start}-${start + 1}`
      years.push({ value: yearLabel, label: yearLabel })
    }
    return years
  }, [currentYear])

  const groupsQuery = useQuery({
    queryKey: ['sibling-groups', academicYear, debouncedSearch],
    queryFn: () =>
      siblingGroupService.getGroups({
        academic_year: academicYear,
        search: debouncedSearch || undefined,
      }),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      siblingGroupService.createGroup({
        name: newGroupName.trim() || undefined,
        student_ids: pickedStudents.map((student) => student.id),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sibling-groups'] })
      setNewGroupName('')
      setPickedStudents([])
      toast.success('Sibling group created.')
    },
    onError: (error: unknown) => {
      toast.error(errorMessage(error, 'Failed to create sibling group.'))
    },
  })

  const addMemberMutation = useMutation({
    mutationFn: (payload: { groupId: string; studentId: string }) =>
      siblingGroupService.addMember(payload.groupId, payload.studentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sibling-groups'] })
      toast.success('Sibling added to the group.')
    },
    onError: (error: unknown) => {
      toast.error(errorMessage(error, 'Failed to add sibling.'))
    },
  })

  const deleteGroupMutation = useMutation({
    mutationFn: (groupId: string) => siblingGroupService.deleteGroup(groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sibling-groups'] })
      toast.success('Sibling group deleted.')
    },
    onError: (error: unknown) => {
      toast.error(errorMessage(error, 'Failed to delete sibling group.'))
    },
  })

  const groups = useMemo(() => groupsQuery.data?.data || [], [groupsQuery.data])
  const allMemberIds = useMemo(
    () => groups.flatMap((group) => (group.members || []).map((member) => member.student_id)),
    [groups]
  )

  const handleDeleteGroup = (group: SiblingGroup) => {
    const label = group.name || 'this sibling group'
    if (
      window.confirm(
        `Delete ${label}? Members are unlinked, but discounts already applied to their accounts are kept.`
      )
    ) {
      deleteGroupMutation.mutate(group.id)
    }
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Create Sibling Group</h2>
          <p className="text-sm text-gray-500 mb-4">
            Link two or more students as siblings, then set each sibling's own discount below.
          </p>
          <div className="space-y-4">
            <Input
              label="Family / Group Name (optional)"
              value={newGroupName}
              onChange={(event) => setNewGroupName(event.target.value)}
              placeholder="e.g. Dela Cruz Family"
              disabled={createMutation.isPending}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Students</label>
              <StudentSearchPicker
                placeholder="Search students by name or LRN…"
                excludedIds={[...allMemberIds, ...pickedStudents.map((student) => student.id)]}
                onPick={(student) => setPickedStudents((prev) => [...prev, student])}
                disabled={createMutation.isPending}
              />
              {pickedStudents.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {pickedStudents.map((student) => (
                    <span
                      key={student.id}
                      className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-sm text-indigo-700"
                    >
                      {studentFullName(student)}
                      <button
                        type="button"
                        onClick={() =>
                          setPickedStudents((prev) => prev.filter((picked) => picked.id !== student.id))
                        }
                      >
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <Button
              loading={createMutation.isPending}
              disabled={pickedStudents.length < 2 || createMutation.isPending}
              onClick={() => createMutation.mutate()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-gray-300"
            >
              Create Group ({pickedStudents.length} selected, minimum 2)
            </Button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-1">Sibling Groups</h2>
            <p className="text-sm text-gray-500">
              Each sibling has their own discount. Applying posts it to the student's ledger for the selected year;
              use the ledger's void flow to reverse an applied discount.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by family or student…"
            />
            <Select
              value={academicYear}
              onChange={(event) => setAcademicYear(event.target.value)}
              options={academicYearOptions}
            />
          </div>
        </div>

        {groupsQuery.isLoading ? (
          <p className="text-gray-500">Loading sibling groups…</p>
        ) : groups.length ? (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.id} className="rounded-lg border border-gray-200">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3 rounded-t-lg">
                  <div>
                    <span className="font-medium text-gray-900">{group.name || 'Sibling group'}</span>
                    <span className="ml-2 text-sm text-gray-500">
                      {(group.members || []).length} sibling{(group.members || []).length === 1 ? 's' : ''}
                    </span>
                    {(group.members || []).length === 1 && (
                      <span className="ml-2 text-sm text-amber-600">
                        Only one member left — add a sibling or delete the group.
                      </span>
                    )}
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAddingToGroupId((prev) => (prev === group.id ? null : group.id))}
                      >
                        {addingToGroupId === group.id ? 'Close' : 'Add Sibling'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={deleteGroupMutation.isPending}
                        onClick={() => handleDeleteGroup(group)}
                        className="text-red-600 border-red-200 hover:bg-red-50"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
                {canManage && addingToGroupId === group.id && (
                  <div className="border-b border-gray-200 px-4 py-3">
                    <StudentSearchPicker
                      placeholder="Search a student to add to this group…"
                      excludedIds={allMemberIds}
                      onPick={(student) => addMemberMutation.mutate({ groupId: group.id, studentId: student.id })}
                      disabled={addMemberMutation.isPending}
                    />
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Sibling Discount
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          {academicYear} Status
                        </th>
                        {canManage && (
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                            Actions
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {(group.members || []).map((member) => (
                        <MemberRow
                          key={member.id}
                          group={group}
                          member={member}
                          academicYear={academicYear}
                          canManage={canManage}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-gray-500">
            {debouncedSearch ? 'No sibling groups match your search.' : 'No sibling groups created yet.'}
          </p>
        )}
      </div>
    </div>
  )
}

export default SiblingDiscountsView
