import React, { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { Button } from '../../../components/button'
import { Input } from '../../../components/input'
import { payrollService } from '../../../services/payrollService'
import type { PayrollSettings } from '../../../types'
import { errorMessage, numberOrZero, peso } from './helpers'

const SettingsTab: React.FC = () => {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<{ late: string; undertime: string; overtime: string } | null>(null)

  const settingsQuery = useQuery({
    queryKey: ['payroll-settings'],
    queryFn: () => payrollService.getSettings(),
  })

  const settings = settingsQuery.data?.data

  useEffect(() => {
    if (settings) {
      setForm({
        late: String(settings.late_penalty_per_minute),
        undertime: String(settings.undertime_penalty_per_minute),
        overtime: String(settings.overtime_rate_per_minute),
      })
    }
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: (payload: PayrollSettings) => payrollService.saveSettings(payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['payroll-settings'] })
      toast.success(res.message || 'Payroll settings saved.')
    },
    onError: (err: unknown) => {
      toast.error(errorMessage(err, 'Failed to save payroll settings.'))
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    saveMutation.mutate({
      late_penalty_per_minute: numberOrZero(form.late),
      undertime_penalty_per_minute: numberOrZero(form.undertime),
      overtime_rate_per_minute: numberOrZero(form.overtime),
    })
  }

  if (settingsQuery.isLoading || !form) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-gray-400 shadow-sm">
        Loading settings…
      </div>
    )
  }

  const penaltiesOff = numberOrZero(form.late) <= 0 && numberOrZero(form.undertime) <= 0

  return (
    <div className="max-w-xl">
      <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900">Penalties & Overtime</h3>
          <p className="mt-1 text-sm text-gray-500">
            Penalties are deducted per minute from the day's pay. Lateness is counted only beyond
            the grace period set on the staff schedule; undertime is counted from a punch-out
            before the scheduled end time. Overtime pays per approved minute past the end time.
          </p>
        </div>
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Late penalty (₱ per minute)
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.late}
                onChange={(e) => setForm((prev) => (prev ? { ...prev, late: e.target.value } : prev))}
                disabled={saveMutation.isPending}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Undertime penalty (₱ per minute)
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.undertime}
                onChange={(e) =>
                  setForm((prev) => (prev ? { ...prev, undertime: e.target.value } : prev))
                }
                disabled={saveMutation.isPending}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Overtime pay (₱ per minute)
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.overtime}
                onChange={(e) =>
                  setForm((prev) => (prev ? { ...prev, overtime: e.target.value } : prev))
                }
                disabled={saveMutation.isPending}
              />
            </div>
          </div>

          {penaltiesOff ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Both rates are 0 — penalties are disabled and days are paid by hours worked.
            </p>
          ) : (
            <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
              Example: arriving 10 minutes past the grace period costs{' '}
              {peso(numberOrZero(form.late) * 10)}; punching out 10 minutes early costs{' '}
              {peso(numberOrZero(form.undertime) * 10)}.
            </p>
          )}

          <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
            Overtime is never paid automatically: minutes punched out past the scheduled end are
            only <span className="font-medium">detected</span> on the payslip, and pay applies once
            a payroll manager approves the minutes on that day
            {numberOrZero(form.overtime) <= 0 && ' (rate is 0 — overtime is currently off)'}.
          </p>

          <p className="text-xs text-gray-400">
            Rates are copied onto each payslip when a payroll period is generated — changing them
            here does not affect payrolls that were already generated. Regenerate a draft period to
            apply the new rates.
          </p>

          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving…' : 'Save settings'}
          </Button>
        </div>
      </form>
    </div>
  )
}

export default SettingsTab
