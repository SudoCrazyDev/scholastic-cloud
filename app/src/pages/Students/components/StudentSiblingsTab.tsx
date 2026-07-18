import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { Link } from 'react-router-dom'
import { UserGroupIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import { Button } from '../../../components/button'
import { Input } from '../../../components/input'
import { siblingGroupService } from '../../../services/siblingGroupService'
import { studentService } from '../../../services/studentService'
import { useRoleAccess } from '../../../hooks/useRoleAccess'
import { useDebounce } from '../../../hooks/useDebounce'
import type { Student } from '../../../types'

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

interface StudentSiblingsTabProps {
  studentId: string
}

export const StudentSiblingsTab: React.FC<StudentSiblingsTabProps> = ({ studentId }) => {
  const queryClient = useQueryClient()
  const { hasAccess: canManage } = useRoleAccess(MANAGE_ROLES)

  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearch = useDebounce(searchTerm)
  const [pickedStudents, setPickedStudents] = useState<Student[]>([])

  const groupQuery = useQuery({
    queryKey: ['sibling-group', studentId],
    queryFn: () => siblingGroupService.getGroupForStudent(studentId),
  })

  const group = groupQuery.data?.data || null
  const members = group?.members || []
  const memberIds = members.map((member) => member.student_id)

  const searchQuery = useQuery({
    queryKey: ['students-sibling-search', debouncedSearch],
    queryFn: () => studentService.searchStudentsForAssignment({ search: debouncedSearch, per_page: 20 }),
    enabled: canManage && debouncedSearch.length >= 2,
  })

  const searchResults = (searchQuery.data?.data || []).filter(
    (result) =>
      result.id !== studentId &&
      !memberIds.includes(result.id) &&
      !pickedStudents.some((picked) => picked.id === result.id)
  )

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['sibling-group', studentId] })
    queryClient.invalidateQueries({ queryKey: ['sibling-groups'] })
  }

  const createGroupMutation = useMutation({
    mutationFn: () =>
      siblingGroupService.createGroup({
        student_ids: [studentId, ...pickedStudents.map((student) => student.id)],
      }),
    onSuccess: () => {
      invalidate()
      setPickedStudents([])
      setSearchTerm('')
      toast.success('Siblings linked successfully.')
    },
    onError: (error: unknown) => {
      toast.error(errorMessage(error, 'Failed to link siblings.'))
    },
  })

  const addMemberMutation = useMutation({
    mutationFn: (newStudentId: string) => siblingGroupService.addMember(group!.id, newStudentId),
    onSuccess: () => {
      invalidate()
      setSearchTerm('')
      toast.success('Sibling added.')
    },
    onError: (error: unknown) => {
      toast.error(errorMessage(error, 'Failed to add sibling.'))
    },
  })

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) => siblingGroupService.removeMember(group!.id, memberId),
    onSuccess: () => {
      invalidate()
      toast.success('Sibling unlinked.')
    },
    onError: (error: unknown) => {
      toast.error(errorMessage(error, 'Failed to unlink sibling.'))
    },
  })

  if (groupQuery.isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <p className="text-gray-500">Loading siblings…</p>
      </div>
    )
  }

  const searchBox = (
    <div className="relative max-w-md">
      <Input
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.target.value)}
        placeholder="Search students by name or LRN…"
      />
      {debouncedSearch.length >= 2 && (
        <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {searchQuery.isLoading ? (
            <p className="px-4 py-3 text-sm text-gray-500">Searching…</p>
          ) : searchResults.length ? (
            searchResults.map((result) => (
              <button
                key={result.id}
                type="button"
                className="w-full px-4 py-2 text-left text-sm hover:bg-indigo-50"
                onClick={() => {
                  if (group) {
                    addMemberMutation.mutate(result.id)
                  } else {
                    setPickedStudents((prev) => [...prev, result])
                    setSearchTerm('')
                  }
                }}
              >
                <span className="font-medium text-gray-900">{studentFullName(result)}</span>
                {result.lrn && <span className="ml-2 text-gray-500">LRN {result.lrn}</span>}
              </button>
            ))
          ) : (
            <p className="px-4 py-3 text-sm text-gray-500">No matching students.</p>
          )}
        </div>
      )}
    </div>
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Siblings</h3>
        <p className="text-sm text-gray-500">
          Sibling discounts are managed and applied per academic year in Finance → Setup → Sibling Discounts.
        </p>
      </div>

      {group ? (
        <div className="space-y-4">
          {group.name && (
            <p className="text-sm text-gray-600">
              Sibling group: <span className="font-medium text-gray-900">{group.name}</span>
            </p>
          )}
          <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200">
            {members.map((member) => {
              const isSelf = member.student_id === studentId
              const discountLabel = formatDiscount(member.discount_type, member.discount_value)
              return (
                <li key={member.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    {isSelf ? (
                      <span className="font-medium text-gray-900">{studentFullName(member.student)} (this student)</span>
                    ) : (
                      <Link
                        to={`/students/${member.student_id}`}
                        className="font-medium text-indigo-600 hover:text-indigo-800"
                      >
                        {studentFullName(member.student)}
                      </Link>
                    )}
                    <div className="text-sm text-gray-500">
                      {member.student?.lrn ? `LRN ${member.student.lrn}` : ''}
                      {discountLabel ? `${member.student?.lrn ? ' · ' : ''}Sibling discount: ${discountLabel}` : ''}
                    </div>
                  </div>
                  {canManage && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={removeMemberMutation.isPending}
                      onClick={() => {
                        if (window.confirm(`Unlink ${studentFullName(member.student)} from this sibling group?`)) {
                          removeMemberMutation.mutate(member.id)
                        }
                      }}
                      className="text-red-600 border-red-200 hover:bg-red-50"
                    >
                      Unlink
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
          {canManage && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Add a sibling</label>
              {searchBox}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-gray-300 px-4 py-6 text-gray-500">
            <UserGroupIcon className="w-6 h-6" />
            <span>This student is not linked to any siblings yet.</span>
          </div>
          {canManage && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">Link siblings</label>
              {searchBox}
              {pickedStudents.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {pickedStudents.map((picked) => (
                    <span
                      key={picked.id}
                      className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-sm text-indigo-700"
                    >
                      {studentFullName(picked)}
                      <button
                        type="button"
                        onClick={() => setPickedStudents((prev) => prev.filter((p) => p.id !== picked.id))}
                      >
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <Button
                loading={createGroupMutation.isPending}
                disabled={pickedStudents.length < 1 || createGroupMutation.isPending}
                onClick={() => createGroupMutation.mutate()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-gray-300"
              >
                Link {pickedStudents.length || ''} Sibling{pickedStudents.length === 1 ? '' : 's'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
