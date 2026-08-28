import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { MessageSquare } from 'lucide-react'
import { smsService } from '../../../services/smsService'
import { Button } from '../../../components/button'
import { Input } from '../../../components/input'
import { Select } from '../../../components/select'
import { Switch } from '../../../components/switch'
import { Textarea } from '../../../components/textarea'
import type { GateSmsSetting, SmsGateway } from '../../../types'

interface GateSmsCardProps {
  gateType: 'enter' | 'exit'
}

/** Stand-in values so admins can see what a rendered message looks like. */
const SAMPLE: Record<string, string> = {
  '{student_name}': 'Juan Miguel Dela Cruz',
  '{first_name}': 'Juan',
  '{last_name}': 'Dela Cruz',
  '{lrn}': '136742110001',
  '{grade_level}': 'Grade 7',
  '{section}': 'Sampaguita',
  '{gate}': 'Main Gate',
  '{time}': '7:32 AM',
  '{date}': 'Jul 27, 2026',
  '{school}': 'MCA',
}

function renderPreview(template: string, variables: string[]) {
  return variables.reduce(
    (body, variable) => body.split(variable).join(SAMPLE[variable] ?? variable),
    template,
  )
}

/** Mirrors SmsService::countSegments on the API — GSM-7 vs UCS2 packing. */
function countSegments(body: string) {
  const unicode = /[^\x00-\x7F]/.test(body)
  const single = unicode ? 70 : 160
  const multi = unicode ? 67 : 153
  if (body.length === 0) return 0
  return body.length <= single ? 1 : Math.ceil(body.length / multi)
}

export default function GateSmsCard({ gateType }: GateSmsCardProps) {
  const queryClient = useQueryClient()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['gate-sms-settings'],
    queryFn: () => smsService.getGateSettings(),
  })
  const { data: gatewaysData } = useQuery({
    queryKey: ['sms-gateways'],
    queryFn: () => smsService.getGateways(),
  })

  const gateways: SmsGateway[] = gatewaysData?.data ?? []
  const variables = data?.meta?.variables ?? []
  const setting = data?.data?.find((s) => s.gate_type === gateType)

  const [form, setForm] = useState<Partial<GateSmsSetting>>({})

  useEffect(() => {
    if (setting) setForm(setting)
  }, [setting])

  const mutation = useMutation({
    mutationFn: () =>
      smsService.updateGateSetting(gateType, {
        is_enabled: !!form.is_enabled,
        sms_gateway_id: form.sms_gateway_id || null,
        message_template: form.message_template ?? '',
        cooldown_minutes: form.cooldown_minutes ?? 0,
        late_threshold_minutes: form.late_threshold_minutes ?? 15,
        timezone: form.timezone || 'Asia/Manila',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gate-sms-settings'] })
      toast.success('SMS notification saved')
    },
    onError: () => toast.error('Failed to save SMS notification'),
  })

  /** Insert a placeholder where the caret sits, so admins don't have to type braces. */
  const insertVariable = (variable: string) => {
    const el = textareaRef.current
    const template = form.message_template ?? ''
    if (!el) {
      setForm((f) => ({ ...f, message_template: template + variable }))
      return
    }
    const start = el.selectionStart ?? template.length
    const end = el.selectionEnd ?? template.length
    const next = template.slice(0, start) + variable + template.slice(end)
    setForm((f) => ({ ...f, message_template: next }))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + variable.length, start + variable.length)
    })
  }

  const gatewayOptions = [
    { value: '', label: 'Use the institution default gateway' },
    ...gateways.map((g) => ({
      value: g.id,
      label: g.location ? `${g.name} — ${g.location}` : g.name,
    })),
  ]

  const label = gateType === 'enter' ? 'entrance' : 'exit'
  const template = form.message_template ?? ''
  const preview = renderPreview(template, variables)
  const segments = countSegments(preview)

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm ring-1 ring-gray-200 p-4 mb-6 text-sm text-gray-400">
        Loading SMS notification settings…
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-sm ring-1 ring-gray-200 p-4 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
            <MessageSquare className="w-4 h-4 text-indigo-600" />
            SMS notification on {label} scan
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Texts the mobile number on the student's <span className="font-medium">Family &amp; Background</span>{' '}
            record each time they scan at this gate. Students without a number are skipped.
          </p>
        </div>
        <Switch
          checked={!!form.is_enabled}
          onChange={(checked: boolean) => setForm((f) => ({ ...f, is_enabled: checked }))}
          color="indigo"
        />
      </div>

      <div className={form.is_enabled ? 'mt-5 space-y-4' : 'mt-5 space-y-4 opacity-50 pointer-events-none'}>
        <div>
          <label className="text-sm font-medium text-gray-700">Sending gateway</label>
          <p className="text-xs text-gray-400 mb-1">Which paired kiosk/SIM sends these messages.</p>
          <Select
            value={form.sms_gateway_id ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, sms_gateway_id: e.target.value || null }))}
            options={gatewayOptions}
          />
          {gateways.length === 0 && (
            <p className="text-xs text-amber-700 mt-1">
              No SMS gateways are registered yet — add one under SMS Gateway → Gateways.
            </p>
          )}
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Message</label>
          <p className="text-xs text-gray-400 mb-1">Click a variable to insert it at the cursor.</p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {variables.map((variable) => (
              <button
                key={variable}
                type="button"
                onClick={() => insertVariable(variable)}
                className="rounded-md border border-gray-300 bg-gray-50 px-2 py-0.5 font-mono text-xs text-gray-700 hover:bg-gray-100 transition-colors"
              >
                {variable}
              </button>
            ))}
          </div>
          <Textarea
            ref={textareaRef}
            rows={3}
            value={template}
            onChange={(e) => setForm((f) => ({ ...f, message_template: e.target.value }))}
            placeholder={`Good day! {student_name} has ${gateType === 'exit' ? 'EXITED' : 'ENTERED'} {school} at {time} on {date}.`}
          />
          <div className="mt-2 rounded-md bg-gray-50 border border-gray-200 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wider text-gray-400 mb-1">Preview</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{preview || '—'}</p>
            <p className="text-xs text-gray-400 mt-1">
              {preview.length} chars · {segments} segment{segments === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Cooldown (minutes)</label>
            <p className="text-xs text-gray-400 mb-1">
              Skip a repeat text if the same student re-scans this gate within the window. 0 = always send.
            </p>
            <Input
              type="number"
              min={0}
              max={1440}
              value={form.cooldown_minutes ?? 0}
              onChange={(e) => setForm((f) => ({ ...f, cooldown_minutes: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Late cut-off (minutes)</label>
            <p className="text-xs text-gray-400 mb-1">
              Drop the text if the scan reaches the server more than this long after the tap — a
              kiosk that was offline can upload a whole morning at once, and "your child has
              entered" sent hours late is worse than not sent. The scan is still recorded. 0 = always
              send.
            </p>
            <Input
              type="number"
              min={0}
              max={1440}
              value={form.late_threshold_minutes ?? 15}
              onChange={(e) => setForm((f) => ({ ...f, late_threshold_minutes: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Timezone</label>
            <p className="text-xs text-gray-400 mb-1">Used to render <code>{'{time}'}</code> and <code>{'{date}'}</code>.</p>
            <Input
              value={form.timezone ?? 'Asia/Manila'}
              onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
              placeholder="Asia/Manila"
            />
          </div>
        </div>
      </div>

      <div className="pt-4">
        <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Saving…' : 'Save SMS notification'}
        </Button>
      </div>
    </div>
  )
}
