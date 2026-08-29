import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { MessageSquare, Send, Inbox, RotateCcw, Ban, X, Search, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'
import { smsService } from '../../services/smsService'
import { Button } from '../../components/button'
import { Input } from '../../components/input'
import { Select } from '../../components/select'
import type { SmsGateway, SmsMessage, SmsMessageStatus } from '../../types'

const STATUS_STYLES: Record<SmsMessageStatus, string> = {
  queued: 'bg-gray-100 text-gray-600',
  sending: 'bg-blue-100 text-blue-700',
  sent: 'bg-indigo-100 text-indigo-700',
  delivered: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  received: 'bg-emerald-100 text-emerald-700',
  canceled: 'bg-gray-100 text-gray-400 line-through',
}

const StatusPill: React.FC<{ status: SmsMessageStatus }> = ({ status }) => (
  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[status]}`}>
    {status}
  </span>
)

// Estimate GSM segments the same way the backend does (display hint only).
function estimateSegments(body: string): { chars: number; segments: number; unicode: boolean } {
  // GSM-7 only covers basic latin; any codepoint > 127 forces UCS2 (fewer chars/segment).
  const unicode = body.split('').some((c) => c.charCodeAt(0) > 127)
  const chars = body.length
  const single = unicode ? 70 : 160
  const multi = unicode ? 67 : 153
  const segments = chars === 0 ? 0 : chars <= single ? 1 : Math.ceil(chars / multi)
  return { chars, segments, unicode }
}

const ComposeModal: React.FC<{ gateways: SmsGateway[]; onClose: () => void }> = ({ gateways, onClose }) => {
  const queryClient = useQueryClient()
  const [numbersRaw, setNumbersRaw] = useState('')
  const [body, setBody] = useState('')
  const [gatewayId, setGatewayId] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')

  const numbers = useMemo(
    () => numbersRaw.split(/[\n,;]+/).map((n) => n.trim()).filter(Boolean),
    [numbersRaw],
  )
  const seg = estimateSegments(body)

  const gatewayOptions = [
    { value: '', label: 'Auto — any online gateway' },
    ...gateways.map((g) => ({ value: g.id, label: `${g.name}${g.status === 'online' ? '' : ` (${g.status})`}` })),
  ]

  const mutation = useMutation({
    mutationFn: () =>
      smsService.queueMessage({
        numbers,
        body,
        gateway_id: gatewayId || undefined,
        scheduled_at: scheduledAt || undefined,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['sms-messages'] })
      toast.success(res.message ?? `${res.data?.queued ?? 0} message(s) queued`)
      onClose()
    },
    onError: () => toast.error('Failed to queue messages'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Compose SMS</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X className="w-5 h-5" /></button>
        </div>

        <label className="text-xs font-medium text-gray-600">Recipients</label>
        <textarea
          value={numbersRaw}
          onChange={(e) => setNumbersRaw(e.target.value)}
          rows={3}
          placeholder="Comma, semicolon or newline separated numbers, e.g. 09171234567, +639181112222"
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />
        <p className="text-xs text-gray-400 mt-1">{numbers.length} recipient(s)</p>

        <label className="text-xs font-medium text-gray-600 mt-3 block">Message</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder="Type your message…"
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />
        <p className="text-xs text-gray-400 mt-1">
          {seg.chars} chars · {seg.segments} segment(s){seg.unicode ? ' · Unicode' : ''}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="text-xs font-medium text-gray-600">Gateway</label>
            <Select value={gatewayId} onChange={(e) => setGatewayId(e.target.value)} options={gatewayOptions} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Schedule (optional)</label>
            <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={numbers.length === 0 || !body.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Queuing…' : `Send to ${numbers.length || 0}`}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

const Messages: React.FC = () => {
  const queryClient = useQueryClient()
  const [direction, setDirection] = useState<'outbound' | 'inbound'>('outbound')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showCompose, setShowCompose] = useState(false)

  // Any filter change re-slices the result set, so page 3 of the old one is meaningless.
  useEffect(() => { setPage(1) }, [direction, status, search])

  const { data: gatewaysData } = useQuery({ queryKey: ['sms-gateways'], queryFn: () => smsService.getGateways() })
  const gateways: SmsGateway[] = gatewaysData?.data ?? []

  const { data, isLoading } = useQuery({
    queryKey: ['sms-messages', direction, status, search, page],
    queryFn: () => smsService.getMessages({ direction, status: status || undefined, search: search || undefined, page }),
    refetchInterval: 15_000,
  })

  const messages: SmsMessage[] = data?.data ?? []
  const meta = data?.meta
  const lastPage = meta?.last_page ?? 1
  const total = meta?.total ?? 0
  // Institution-wide, so the banner keeps telling the truth even while a filter is on.
  const queuedTotal = meta?.queued_total ?? 0

  const retryMutation = useMutation({
    mutationFn: (id: string) => smsService.retryMessage(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['sms-messages'] }); toast.success('Re-queued') },
    onError: () => toast.error('Retry failed'),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => smsService.cancelMessage(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['sms-messages'] }); toast.success('Canceled') },
    onError: () => toast.error('Cancel failed'),
  })

  const cancelQueuedMutation = useMutation({
    mutationFn: () => smsService.cancelQueuedMessages(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['sms-messages'] })
      toast.success(res.message ?? `${res.data?.canceled ?? 0} message(s) canceled`)
    },
    onError: () => toast.error('Could not cancel the queue'),
  })

  const confirmCancelQueued = () => {
    const ok = confirm(
      `Cancel all ${queuedTotal} queued message(s)?\n\n` +
        'This applies to every queued outbound message for this institution — not just the ones ' +
        'matching your current filters. Messages already sending are left alone.\n\n' +
        'Canceled messages cannot be resent.',
    )
    if (ok) cancelQueuedMutation.mutate()
  }

  const statusOptions =
    direction === 'outbound'
      ? [
          { value: '', label: 'All statuses' },
          { value: 'queued', label: 'Queued' },
          { value: 'sending', label: 'Sending' },
          { value: 'sent', label: 'Sent' },
          { value: 'delivered', label: 'Delivered' },
          { value: 'failed', label: 'Failed' },
          { value: 'canceled', label: 'Canceled' },
        ]
      : [
          { value: '', label: 'All statuses' },
          { value: 'received', label: 'Received' },
        ]

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-indigo-600" /> SMS Messages
          </h1>
          <p className="text-sm text-gray-500 mt-1">Outbound queue with delivery status, and received replies.</p>
        </div>
        <Button onClick={() => setShowCompose(true)}><Send className="w-4 h-4 mr-1" /> Compose</Button>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => { setDirection('outbound'); setStatus('') }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${direction === 'outbound' ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
        >
          <Send className="w-4 h-4" /> Outbound
        </button>
        <button
          onClick={() => { setDirection('inbound'); setStatus('') }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${direction === 'inbound' ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
        >
          <Inbox className="w-4 h-4" /> Inbound
        </button>

        <div className="ml-auto flex items-center gap-2">
          <div className="w-44"><Select value={status} onChange={(e) => setStatus(e.target.value)} options={statusOptions} /></div>
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search number" className="pl-8" />
          </div>
        </div>
      </div>

      {direction === 'outbound' && queuedTotal > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
          <div className="text-sm text-amber-900">
            <span className="font-semibold">{queuedTotal}</span> message{queuedTotal === 1 ? '' : 's'} waiting to be
            sent. Nothing leaves the queue until a paired kiosk claims it — check{' '}
            <a href="/sms/gateways" className="font-medium underline underline-offset-2">SMS Gateways</a> if this keeps growing.
          </div>
          <div className="ml-auto flex items-center gap-2">
            {status !== 'queued' && (
              <Button type="button" variant="outline" color="secondary" size="sm" onClick={() => setStatus('queued')}>
                Show queued
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              color="danger"
              size="sm"
              loading={cancelQueuedMutation.isPending}
              disabled={cancelQueuedMutation.isPending}
              leftIcon={<Ban className="w-4 h-4" />}
              onClick={confirmCancelQueued}
            >
              {cancelQueuedMutation.isPending ? 'Canceling…' : `Cancel all ${queuedTotal} queued`}
            </Button>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3">{direction === 'outbound' ? 'To' : 'From'}</th>
              <th className="text-left px-4 py-3">Message</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">{direction === 'outbound' ? 'Sent' : 'Received'}</th>
              {direction === 'outbound' && <th className="text-right px-4 py-3">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
            )}
            {!isLoading && messages.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No messages.</td></tr>
            )}
            {messages.map((m) => (
              <tr key={m.id} className="hover:bg-gray-50 align-top">
                <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                  {direction === 'outbound' ? m.to_number : m.from_number}
                </td>
                <td className="px-4 py-3 text-gray-600 max-w-md">
                  <div className="line-clamp-2">{m.body}</div>
                  {m.error && <div className="text-xs text-red-500 mt-1">{m.error}</div>}
                </td>
                <td className="px-4 py-3"><StatusPill status={m.status} /></td>
                <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                  {direction === 'outbound'
                    ? (m.delivered_at || m.sent_at ? new Date(m.delivered_at ?? m.sent_at!).toLocaleString() : '—')
                    : (m.received_at ? new Date(m.received_at).toLocaleString() : '—')}
                </td>
                {direction === 'outbound' && (
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {m.status === 'failed' && (
                        <button onClick={() => retryMutation.mutate(m.id)} className="p-1.5 rounded hover:bg-gray-100 text-indigo-600" title="Retry">
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                      {(m.status === 'queued' || m.status === 'sending') && (
                        <button onClick={() => cancelMutation.mutate(m.id)} className="p-1.5 rounded hover:bg-red-50 text-red-500" title="Cancel">
                          <Ban className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {total > 0 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-xs text-gray-500">
            <span>
              Showing {(page - 1) * (meta?.per_page ?? 50) + 1}–{(page - 1) * (meta?.per_page ?? 50) + messages.length} of{' '}
              {total}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent"
                title="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2">Page {page} of {lastPage}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                disabled={page >= lastPage}
                className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent"
                title="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {showCompose && <ComposeModal gateways={gateways} onClose={() => setShowCompose(false)} />}
    </div>
  )
}

export default Messages
