import { useState, useEffect } from 'react'
import { Dialog, DialogTitle, DialogBody, DialogActions } from '../../../components/dialog'
import { Button } from '../../../components/button'
import { Input } from '../../../components/input'
import { XMarkIcon, KeyIcon } from '@heroicons/react/24/outline'
import { studentService, type StudentAuthLog } from '../../../services/studentService'
import type { Student } from '../../../types'

function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let result = ''
  const random = typeof crypto !== 'undefined' && crypto.getRandomValues
    ? (n: number) => crypto.getRandomValues(new Uint8Array(n))
    : () => { throw new Error('No secure random') }
  const bytes = random(length)
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i]! % chars.length]
  }
  return result
}

function getFullName(student: Student) {
  const parts = [student.first_name, student.middle_name, student.last_name].filter(Boolean)
  return (parts.join(' ') + (student.ext_name ? ` ${student.ext_name}` : '')).trim()
}

function describeAction(log: StudentAuthLog): string {
  switch (log.action) {
    case 'created':
      return 'Created portal login'
    case 'changed_email':
      return log.old_email && log.new_email
        ? `Changed email from ${log.old_email} to ${log.new_email}`
        : 'Changed email'
    case 'reset_password':
    default:
      return 'Reset password'
  }
}

function formatDateTime(value: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
}

interface StudentPasswordResetModalProps {
  isOpen: boolean
  onClose: () => void
  student: Student | null
}

type AuthState = 'loading' | 'none' | 'exists'

export function StudentPasswordResetModal({
  isOpen,
  onClose,
  student,
}: StudentPasswordResetModalProps) {
  const [authState, setAuthState] = useState<AuthState>('loading')
  const [existingEmail, setExistingEmail] = useState<string>('')
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [logs, setLogs] = useState<StudentAuthLog[]>([])

  const loadLogs = (studentId: string) => {
    studentService
      .getStudentAuthLogs(studentId)
      .then((res) => setLogs(res.data ?? []))
      .catch(() => setLogs([]))
  }

  useEffect(() => {
    if (!isOpen || !student) return
    setGeneratedPassword(null)
    setEmail('')
    setEmailError('')
    setFetchError(null)
    setAuthState('loading')
    setExistingEmail('')
    setLogs([])

    let cancelled = false
    studentService
      .getStudentAuth(student.id)
      .then((res) => {
        if (cancelled) return
        setAuthState('exists')
        setExistingEmail(res.data?.email ?? '')
        setEmail(res.data?.email ?? '')
      })
      .catch((err: { response?: { status: number }; message?: string }) => {
        if (cancelled) return
        if (err.response?.status === 404) {
          setAuthState('none')
        } else {
          setFetchError(err.message ?? 'Failed to load student auth.')
        }
      })

    loadLogs(student.id)

    return () => {
      cancelled = true
    }
  }, [isOpen, student?.id])

  const handleGenerate = async () => {
    if (!student) return

    const trimmed = email.trim()
    if (!trimmed) {
      setEmailError('Email is required.')
      return
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(trimmed)) {
      setEmailError('Enter a valid email address.')
      return
    }
    setEmailError('')

    setSubmitting(true)
    const newPassword = generatePassword(12)

    try {
      await studentService.createOrUpdateStudentAuth(student.id, {
        email: trimmed,
        password: newPassword,
        is_new: true,
      })
      setGeneratedPassword(newPassword)
      setExistingEmail(trimmed)
      loadLogs(student.id)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message
        ?? (err as { message?: string })?.message
        ?? 'Failed to save credentials.'
      setFetchError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!submitting) {
      setGeneratedPassword(null)
      setAuthState('loading')
      setEmail('')
      setEmailError('')
      setFetchError(null)
      setLogs([])
      onClose()
    }
  }

  if (!student) return null

  const name = getFullName(student)
  const emailChanged = authState === 'exists' && email.trim() !== existingEmail
  const confirmLabel = authState === 'none'
    ? (submitting ? 'Generating...' : 'Generate')
    : (submitting ? 'Resetting...' : emailChanged ? 'Change email & reset' : 'Reset password')

  const history = logs.length > 0 && (
    <div className="mt-6 border-t border-gray-100 pt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
        Access history
      </p>
      <ul className="space-y-2 max-h-40 overflow-y-auto">
        {logs.map((log) => (
          <li key={log.id} className="text-sm text-gray-600">
            <span className="text-gray-900">{describeAction(log)}</span>
            <span className="text-gray-400">
              {' — '}
              {log.performed_by_name ?? 'Unknown user'}
              {log.created_at ? `, ${formatDateTime(log.created_at)}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )

  return (
    <Dialog open={isOpen} onClose={handleClose} size="md" light>
      <div className="flex items-center justify-between">
        <DialogTitle light className="flex items-center gap-2 text-gray-900">
          <KeyIcon className="w-5 h-5 text-indigo-600" />
          Reset student portal
        </DialogTitle>
        <button
          type="button"
          onClick={handleClose}
          disabled={submitting}
          className="rounded-md text-gray-400 hover:text-gray-600 focus:outline-none disabled:opacity-50"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>

      <DialogBody>
        {fetchError && (
          <div className="mb-4 p-3 rounded-md bg-red-50 text-red-700 text-sm">
            {fetchError}
          </div>
        )}

        {authState === 'loading' && (
          <div className="py-4 text-center text-gray-500">Checking student login...</div>
        )}

        {(authState === 'none' || authState === 'exists') && !generatedPassword && (
          <>
            <p className="text-sm text-gray-600 mb-4">
              {authState === 'none' ? (
                <>This student does not have portal login yet. Enter their email and generate a password.</>
              ) : (
                <>Reset portal access for <strong>{name}</strong>. You can update their email below; a new password will be generated. They will need the new password to sign in.</>
              )}
            </p>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@example.com"
                className="w-full"
                disabled={submitting}
              />
              {emailError && <p className="text-sm text-red-600">{emailError}</p>}
            </div>
            <DialogActions className="mt-6">
              <Button variant="outline" onClick={handleClose} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={handleGenerate} disabled={submitting}>
                {confirmLabel}
              </Button>
            </DialogActions>
            {history}
          </>
        )}

        {generatedPassword && (
          <>
            <p className="text-sm text-gray-600 mb-2">New password (show this to the student; it will not be shown again):</p>
            <div className="p-4 rounded-lg bg-gray-100 font-mono text-sm break-all select-all">
              {generatedPassword}
            </div>
            <DialogActions className="mt-6">
              <Button onClick={handleClose}>Done</Button>
            </DialogActions>
            {history}
          </>
        )}
      </DialogBody>
    </Dialog>
  )
}
