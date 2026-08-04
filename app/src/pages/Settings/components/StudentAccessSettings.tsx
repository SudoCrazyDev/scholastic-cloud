import React, { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { AlertTriangle, Lock } from 'lucide-react'
import { usePermissions } from '../../../hooks/usePermissions'
import { studentPortalAccessService } from '../../../services/studentPortalAccessService'
import { Button } from '../../../components/button'
import { Switch } from '../../../components/switch'
import { Textarea } from '../../../components/textarea'

/**
 * Temporarily close the student portal for the whole institution — exam week,
 * report cards being finalized, fees being settled. Staff logins are unaffected,
 * and student credentials are left alone: only the way in is shut.
 *
 * The switch saves as soon as it is flipped, because that is the action an admin
 * came here for. The notice students see is edited and saved separately.
 */
const StudentAccessSettings: React.FC = () => {
  const queryClient = useQueryClient()
  const { canManage } = usePermissions()
  // Reaching this page already needs `settings.view`; changing the switch needs
  // `settings.manage`, so a read-only role sees the state without the controls.
  const canChange = canManage('settings')

  const { data: settings, isLoading } = useQuery({
    queryKey: ['student-portal-access'],
    queryFn: () => studentPortalAccessService.getSettings(),
  })

  const [notice, setNotice] = useState('')

  // Seed the editable notice whenever the saved settings (re)load.
  useEffect(() => {
    if (settings) setNotice(settings.student_portal_disabled_message ?? '')
  }, [settings])

  const mutation = useMutation({
    mutationFn: (payload: { student_portal_enabled: boolean; student_portal_disabled_message: string | null }) =>
      studentPortalAccessService.updateSettings(payload),
    onSuccess: (result) => {
      queryClient.setQueryData(['student-portal-access'], {
        student_portal_enabled: result.data.student_portal_enabled,
        student_portal_disabled_message: result.data.student_portal_disabled_message,
        default_disabled_message: result.data.default_disabled_message,
      })
      toast.success(result.message)
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to update student access'
      toast.error(message)
    },
  })

  const enabled = settings?.student_portal_enabled ?? true
  const savedNotice = settings?.student_portal_disabled_message ?? ''
  const noticeDirty = notice.trim() !== savedNotice.trim()
  const defaultNotice = settings?.default_disabled_message ?? ''

  const save = (nextEnabled: boolean) =>
    mutation.mutate({
      student_portal_enabled: nextEnabled,
      student_portal_disabled_message: notice.trim() || null,
    })

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
          <Lock className="w-6 h-6 text-primary-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Student Access</h2>
          <p className="text-sm text-gray-500">
            Temporarily close the student portal for everyone. Staff logins are not affected.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
          <span className="ml-3 text-gray-500 text-sm">Loading student access…</span>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 border border-gray-200 rounded-lg p-4">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gray-900">
                Students can {enabled ? 'sign in' : 'not sign in'}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {enabled
                  ? 'Students can sign in to the portal and see their grades, ledger and assessments.'
                  : 'Students are turned away at the login screen. Their accounts and passwords are kept as they are.'}
              </p>
            </div>
            <Switch
              color="indigo"
              checked={enabled}
              disabled={!canChange || mutation.isPending}
              onChange={(v) => save(!!v)}
              aria-label="Allow students to sign in"
            />
          </div>

          {!enabled && (
            <div className="flex items-start gap-2 rounded-md bg-warning-50 border border-warning-200 p-3 text-xs text-warning-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                Student access is off. Anyone already signed in was signed out, and students will be turned away
                until you switch this back on.
              </span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message shown to students while access is off
            </label>
            <Textarea
              value={notice}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotice(e.target.value)}
              placeholder={defaultNotice}
              rows={2}
              maxLength={300}
              disabled={!canChange || mutation.isPending}
            />
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-gray-500">
                Optional. Leave blank to use: &ldquo;{defaultNotice}&rdquo;
              </p>
              {canChange && (
                <Button
                  type="button"
                  color="primary"
                  disabled={!noticeDirty || mutation.isPending}
                  onClick={() => save(enabled)}
                >
                  {mutation.isPending ? 'Saving…' : 'Save Message'}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default StudentAccessSettings
