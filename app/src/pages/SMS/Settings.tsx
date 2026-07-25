import React, { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { Settings as SettingsIcon } from 'lucide-react'
import { smsService } from '../../services/smsService'
import { Button } from '../../components/button'
import { Input } from '../../components/input'
import { Select } from '../../components/select'
import type { SmsGateway, SmsSettings } from '../../types'

const SmsSettingsPage: React.FC = () => {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({ queryKey: ['sms-settings'], queryFn: () => smsService.getSettings() })
  const { data: gatewaysData } = useQuery({ queryKey: ['sms-gateways'], queryFn: () => smsService.getGateways() })
  const gateways: SmsGateway[] = gatewaysData?.data ?? []

  const [form, setForm] = useState<Partial<SmsSettings>>({})

  useEffect(() => {
    if (data?.data) setForm(data.data)
  }, [data])

  const mutation = useMutation({
    mutationFn: () =>
      smsService.updateSettings({
        default_gateway_id: form.default_gateway_id || null,
        rate_limit_per_minute: form.rate_limit_per_minute,
        send_window_start: form.send_window_start || null,
        send_window_end: form.send_window_end || null,
        opt_out_keywords: form.opt_out_keywords,
        sender_name: form.sender_name || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sms-settings'] })
      toast.success('Settings saved')
    },
    onError: () => toast.error('Failed to save settings'),
  })

  const gatewayOptions = [
    { value: '', label: 'None — any online gateway claims messages' },
    ...gateways.map((g) => ({ value: g.id, label: g.name })),
  ]

  if (isLoading) {
    return <div className="p-6 text-gray-400">Loading…</div>
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2 mb-1">
        <SettingsIcon className="w-6 h-6 text-indigo-600" /> SMS Settings
      </h1>
      <p className="text-sm text-gray-500 mb-6">Routing, throttling, sending hours and opt-out handling.</p>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-5">
        <div>
          <label className="text-sm font-medium text-gray-700">Default gateway</label>
          <p className="text-xs text-gray-400 mb-1">Where messages route when a sender doesn't pick one.</p>
          <Select
            value={form.default_gateway_id ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, default_gateway_id: e.target.value }))}
            options={gatewayOptions}
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Rate limit (messages/minute)</label>
          <p className="text-xs text-gray-400 mb-1">Protects the SIM/carrier from being flagged for spam.</p>
          <Input
            type="number"
            min={1}
            max={600}
            value={form.rate_limit_per_minute ?? 20}
            onChange={(e) => setForm((f) => ({ ...f, rate_limit_per_minute: Number(e.target.value) }))}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Send window start</label>
            <Input
              type="time"
              value={form.send_window_start ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, send_window_start: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Send window end</label>
            <Input
              type="time"
              value={form.send_window_end ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, send_window_end: e.target.value }))}
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Opt-out keywords</label>
          <p className="text-xs text-gray-400 mb-1">Comma-separated. A reply matching any of these adds the number to the opt-out list.</p>
          <Input
            value={form.opt_out_keywords ?? 'STOP'}
            onChange={(e) => setForm((f) => ({ ...f, opt_out_keywords: e.target.value }))}
            placeholder="STOP, UNSUBSCRIBE"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Sender name (optional)</label>
          <p className="text-xs text-gray-400 mb-1">Alphanumeric sender ID, if the SIM/carrier supports it.</p>
          <Input
            value={form.sender_name ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, sender_name: e.target.value }))}
            placeholder="SchoolName"
          />
        </div>

        <div className="pt-2">
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'Saving…' : 'Save settings'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default SmsSettingsPage
