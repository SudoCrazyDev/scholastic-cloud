import React, { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { AlertTriangle, Check, Copy, KeyRound, Search, ShieldCheck } from 'lucide-react'
import { Button } from '../../components/button'
import { Select } from '../../components/select'
import { Switch } from '../../components/switch'
import {
  paymentGatewayService,
  type InstitutionGateway,
  type InstitutionGatewayRow,
  type PaymentProvider,
} from '../../services/paymentGatewayService'

const paymentGatewayKey = ['payment-gateways'] as const

/**
 * Which merchant account each school takes online payments through.
 *
 * Platform administration, alongside Feature Access and for the same reason:
 * the module behind it is system_only, so a school can neither set nor read
 * its own keys. That is not the platform keeping something from the school —
 * the money still lands in the school's own bank account. It is that a
 * mistyped live secret key is an outage during enrolment, and the person who
 * onboarded the merchant account with the provider is the one who should be
 * pasting its keys.
 *
 * Keys are write-only here. They go to the server and never come back; every
 * input below starts empty even for a school that is fully set up, and a blank
 * means "leave what is stored".
 */
const PaymentGateways: React.FC = () => {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<{ institutionId: string; provider: string } | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: paymentGatewayKey,
    queryFn: async () => (await paymentGatewayService.getAll()).data,
  })

  const providers = useMemo<PaymentProvider[]>(() => data?.providers ?? [], [data])

  const institutions = useMemo<InstitutionGatewayRow[]>(() => {
    const rows = data?.institutions ?? []
    const term = search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter(institution => institution.title.toLowerCase().includes(term))
  }, [data, search])

  const refresh = () => queryClient.invalidateQueries({ queryKey: paymentGatewayKey })

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-zinc-900">Payment Gateways</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">
            Which merchant account each institution takes online payments through. Set here rather
            than by the school: the money lands in the school&rsquo;s own bank account, but the keys
            are pasted by whoever onboarded the account with the provider.
          </p>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-zinc-400" />
          <input
            type="search"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Find an institution…"
            aria-label="Find an institution"
            className="w-64 rounded-lg border border-zinc-300 py-2 pr-3 pl-9 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
          />
        </div>
      </header>

      {providers.length > 0 && (
        <div className="space-y-2">
          {providers.map(provider => (
            <div
              key={provider.key}
              className="flex gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3"
            >
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
              <div className="min-w-0 text-sm">
                <p className="font-medium text-zinc-900">
                  {provider.label}
                  {!provider.available && (
                    <span className="ml-2 rounded-full bg-zinc-200 px-2 py-0.5 text-[11px] font-normal text-zinc-600">
                      not yet supported
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-zinc-600">{provider.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {isLoading && (
          <p className="rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center text-zinc-500">
            Loading institutions…
          </p>
        )}

        {isError && (
          <p className="rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center text-zinc-500">
            Could not load institutions.
          </p>
        )}

        {!isLoading && !isError && institutions.length === 0 && (
          <p className="rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center text-zinc-500">
            {search ? `No institution matches “${search}”.` : 'No institutions yet.'}
          </p>
        )}

        {institutions.map(institution => (
          <InstitutionCard
            key={institution.id}
            institution={institution}
            providers={providers}
            editing={editing}
            onEdit={setEditing}
            onSaved={refresh}
          />
        ))}
      </div>

      <p className="text-xs text-zinc-500">
        Stored keys are encrypted and never sent back to this screen. Rotating the
        application&rsquo;s encryption key makes every one of them unreadable — a school in that
        state stops taking online payments and its keys have to be entered again.
      </p>
    </div>
  )
}

interface InstitutionCardProps {
  institution: InstitutionGatewayRow
  providers: PaymentProvider[]
  editing: { institutionId: string; provider: string } | null
  onEdit: (target: { institutionId: string; provider: string } | null) => void
  onSaved: () => void
}

const InstitutionCard: React.FC<InstitutionCardProps> = ({
  institution,
  providers,
  editing,
  onEdit,
  onSaved,
}) => {
  const live = institution.gateways.find(gateway => gateway.is_active)
  const isEditing = editing?.institutionId === institution.id
  const editingProvider = isEditing ? editing.provider : null

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="font-medium text-zinc-900">{institution.title}</p>
          <p className="mt-0.5 text-sm text-zinc-600">
            {live ? (
              <>
                <span className="text-zinc-900">{live.provider_label}</span>
                <span className="text-zinc-400"> · </span>
                <span className={live.mode === 'live' ? 'text-emerald-700' : 'text-amber-700'}>
                  {live.mode === 'live' ? 'Live' : 'Sandbox'}
                </span>
                {!live.ready && (
                  <>
                    <span className="text-zinc-400"> · </span>
                    <span className="text-red-700">needs attention</span>
                  </>
                )}
              </>
            ) : (
              <span className="text-zinc-500">Not taking online payments</span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {providers.map(provider => (
            <Button
              key={provider.key}
              type="button"
              variant={editingProvider === provider.key ? 'solid' : 'outline'}
              size="sm"
              disabled={!provider.available}
              onClick={() =>
                onEdit(
                  editingProvider === provider.key
                    ? null
                    : { institutionId: institution.id, provider: provider.key },
                )
              }
            >
              <KeyRound className="mr-1.5 h-3.5 w-3.5" />
              {institution.gateways.some(gateway => gateway.provider === provider.key)
                ? `Edit ${provider.label}`
                : `Set up ${provider.label}`}
            </Button>
          ))}
        </div>
      </div>

      {live && !live.ready && live.problems.length > 0 && (
        <div className="flex gap-2 border-t border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <ul className="space-y-0.5">
            {live.problems.map(problem => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}

      {editingProvider && (
        <GatewayForm
          institutionId={institution.id}
          provider={providers.find(candidate => candidate.key === editingProvider)!}
          gateway={institution.gateways.find(gateway => gateway.provider === editingProvider) ?? null}
          onDone={() => {
            onEdit(null)
            onSaved()
          }}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}

interface GatewayFormProps {
  institutionId: string
  provider: PaymentProvider
  gateway: InstitutionGateway | null
  onDone: () => void
  onSaved: () => void
}

const GatewayForm: React.FC<GatewayFormProps> = ({
  institutionId,
  provider,
  gateway,
  onDone,
  onSaved,
}) => {
  const [mode, setMode] = useState(gateway?.mode ?? provider.modes[0]?.key ?? 'sandbox')
  const [product, setProduct] = useState(
    gateway?.product ?? provider.default_product ?? provider.products[0]?.key ?? '',
  )
  const [isActive, setIsActive] = useState(gateway?.is_active ?? false)
  const [credentials, setCredentials] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState(false)

  const save = useMutation({
    mutationFn: () =>
      paymentGatewayService.save(institutionId, provider.key, {
        mode,
        ...(provider.products.length > 0 ? { product } : {}),
        is_active: isActive,
        credentials,
      }),
    onSuccess: () => {
      onSaved()
      onDone()
    },
  })

  const remove = useMutation({
    mutationFn: () => paymentGatewayService.remove(institutionId, provider.key),
    onSuccess: () => {
      onSaved()
      onDone()
    },
  })

  /*
   * Errors come back keyed by credential field, the same shape as validation
   * errors, so a missing key is shown beside the input it belongs to.
   */
  const fieldErrors = (save.error as { response?: { data?: { errors?: Record<string, string[]> } } })
    ?.response?.data?.errors

  const copyWebhookUrl = async () => {
    if (!gateway) return
    await navigator.clipboard.writeText(gateway.webhook_url)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <form
      className="space-y-4 border-t border-zinc-200 bg-zinc-50 px-4 py-4"
      onSubmit={event => {
        event.preventDefault()
        save.mutate()
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-zinc-700">Mode</span>
          <Select
            className="mt-1"
            value={mode}
            onChange={event => setMode(event.target.value)}
            options={provider.modes.map(option => ({ value: option.key, label: option.label }))}
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Sandbox and live are different hosts, and a key issued for one is refused by the other.
          </span>
        </label>

        {provider.products.length > 0 && (
          <label className="block text-sm">
            <span className="font-medium text-zinc-700">Product</span>
            <Select
              className="mt-1"
              value={product}
              onChange={event => setProduct(event.target.value)}
              options={provider.products.map(option => ({
                value: option.key,
                label: option.label,
              }))}
            />
            <span className="mt-1 block text-xs text-zinc-500">
              {provider.products.find(option => option.key === product)?.description ??
                'Whichever this school was issued keys for.'}
            </span>
          </label>
        )}
      </div>

      <div className="space-y-3">
        {provider.credentials.map(field => {
          const stored = gateway?.keys?.[field.key]
          const errors = fieldErrors?.[field.key]

          return (
            <label key={field.key} className="block text-sm">
              <span className="font-medium text-zinc-700">{field.label}</span>
              <input
                type="password"
                autoComplete="new-password"
                value={credentials[field.key] ?? ''}
                onChange={event =>
                  setCredentials(current => ({ ...current, [field.key]: event.target.value }))
                }
                placeholder={
                  stored?.set
                    ? `On file — ends ${stored.masked ?? '••••'}. Leave blank to keep it.`
                    : 'Not set'
                }
                className={clsx(
                  'mt-1 w-full rounded-lg border px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none',
                  errors ? 'border-red-300 focus:border-red-400' : 'border-zinc-300 focus:border-zinc-400',
                )}
              />
              {field.hint && <span className="mt-1 block text-xs text-zinc-500">{field.hint}</span>}
              {errors?.map(error => (
                <span key={error} className="mt-1 block text-xs text-red-700">
                  {error}
                </span>
              ))}
            </label>
          )
        })}
      </div>

      {gateway && (
        <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5">
          <p className="text-xs font-medium text-zinc-700">Webhook URL</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Paste this into the provider&rsquo;s dashboard. It is how payments get recorded when the
            payer closes the tab before returning.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-800">
              {gateway.webhook_url}
            </code>
            <Button type="button" variant="outline" size="sm" onClick={copyWebhookUrl}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Switch checked={isActive} onChange={setIsActive} aria-label="Take payments through this account" />
          <span className="text-sm text-zinc-700">
            {isActive ? 'Taking payments through this account' : 'Not in use'}
          </span>
        </div>

        <div className="flex gap-2">
          {gateway && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              {remove.isPending ? 'Removing…' : 'Remove'}
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {save.isError && !fieldErrors && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          That did not save. The school still has whatever it had before.
        </p>
      )}

      <p className="text-xs text-zinc-500">
        A school takes payments through one account at a time. Switching this on stands down
        whatever it was using before.
      </p>
    </form>
  )
}

export default PaymentGateways
