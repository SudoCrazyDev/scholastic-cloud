import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ExternalLink, Info, KeyRound, Loader2, Search, Users, X } from 'lucide-react'
import { Dialog, DialogActions, DialogBody, DialogTitle } from '../../../components/dialog'
import { Button } from '../../../components/button'
import { Input } from '../../../components/input'
import { Select } from '../../../components/select'
import { useTalaAccess, useTalaAccessMutation, useTalaKeyMutations } from '../../../hooks/useTala'
import { usePermissions } from '../../../hooks/usePermissions'
import { institutionService } from '../../../services/institutionService'
import type { TalaAccessRow, TalaConfig, TalaProviderKey } from '../../../services/talaService'

interface TalaSettingsDialogProps {
  open: boolean
  config: TalaConfig
  onClose: () => void
}

type Tab = 'key' | 'access'

/**
 * Tala's administration, both halves of it: the key the school chats through,
 * and which teachers may chat.
 *
 * Everything in here belongs to `tala.configure`. Teachers have no settings at
 * all any more — they open Tala and type — so this dialog is only ever reached
 * by an administrator, and the parent hides the button that opens it.
 */
export const TalaSettingsDialog: React.FC<TalaSettingsDialogProps> = ({ open, config, onClose }) => {
  const [tab, setTab] = useState<Tab>('key')

  return (
    <Dialog open={open} onClose={onClose} size="2xl">
      <DialogTitle>Tala settings</DialogTitle>

      {!config.can_configure_institution ? (
        <>
          <DialogBody>
            <p className="text-sm text-zinc-600">
              Tala is set up by your school administrator. There is nothing for you to configure —
              open a conversation and start typing.
            </p>
          </DialogBody>
          <DialogActions>
            <Button onClick={onClose}>Close</Button>
          </DialogActions>
        </>
      ) : (
        <>
          <DialogBody className="space-y-5">
            <div className="flex gap-1 rounded-lg bg-zinc-100 p-1">
              {(
                [
                  { key: 'key' as const, label: 'School key' },
                  { key: 'access' as const, label: 'Who can use Tala' },
                ]
              ).map(entry => (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => setTab(entry.key)}
                  className={
                    tab === entry.key
                      ? 'flex-1 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 shadow-sm'
                      : 'flex-1 rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:text-zinc-900'
                  }
                >
                  {entry.label}
                </button>
              ))}
            </div>

            {tab === 'key' ? <KeyPanel config={config} onClose={onClose} /> : <AccessPanel />}
          </DialogBody>

          {tab === 'access' && (
            <DialogActions>
              <Button variant="outline" color="secondary" onClick={onClose}>
                Done
              </Button>
            </DialogActions>
          )}
        </>
      )}
    </Dialog>
  )
}

/** The API key the whole school talks through. */
const KeyPanel: React.FC<{ config: TalaConfig; onClose: () => void }> = ({ config, onClose }) => {
  const mutations = useTalaKeyMutations()

  const [provider, setProvider] = useState<TalaProviderKey>(
    config.active_provider ?? config.providers[0]?.key ?? 'anthropic'
  )
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [sharedWithStaff, setSharedWithStaff] = useState(true)
  const [monthlyLimit, setMonthlyLimit] = useState('')
  const [error, setError] = useState<string | null>(null)

  const selectedProvider = useMemo(
    () => config.providers.find(entry => entry.key === provider),
    [config.providers, provider]
  )

  const saving = mutations.saveInstitution.isPending

  const handleSave = async () => {
    if (apiKey.trim() === '') {
      setError('Paste the API key first.')
      return
    }

    setError(null)

    try {
      await mutations.saveInstitution.mutateAsync({
        provider,
        api_key: apiKey.trim(),
        model: model || null,
        shared_with_staff: sharedWithStaff,
        monthly_message_limit: monthlyLimit === '' ? null : Number(monthlyLimit),
      })

      setApiKey('')
      setModel('')
      onClose()
    } catch (caught: any) {
      setError(caught?.response?.data?.message ?? 'That key could not be saved.')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          This is the only key Tala uses. Every teacher you give access to chats through it, on the
          model chosen here, and the school is billed for it — teachers cannot add a key of their own.
        </span>
      </div>

      {config.institution_configured ? (
        <div className="rounded-lg border border-zinc-200 px-3 py-2.5 text-sm text-zinc-700">
          A school key is set and{' '}
          {config.institution_shared ? 'in use' : 'currently paused — Tala will not answer'}.
        </div>
      ) : (
        <p className="text-sm text-zinc-500">
          No school key has been set yet, so Tala cannot answer anyone.
        </p>
      )}

      <div className="space-y-4 border-t border-zinc-200 pt-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-700">Provider</label>
          <Select
            value={provider}
            onChange={event => {
              setProvider(event.target.value as TalaProviderKey)
              setModel('')
            }}
            options={config.providers.map(entry => ({ value: entry.key, label: entry.label }))}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-700">
            API key
            {selectedProvider?.key_hint && (
              <span className="ml-2 font-normal text-zinc-500">{selectedProvider.key_hint}</span>
            )}
          </label>
          <Input
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={event => setApiKey(event.target.value)}
            placeholder="Paste the key here"
          />
          {selectedProvider?.console_url && (
            <a
              href={selectedProvider.console_url}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800"
            >
              Get a key from {selectedProvider.label}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-700">Model</label>
          <Select
            value={model}
            onChange={event => setModel(event.target.value)}
            options={[
              { value: '', label: `Default (${selectedProvider?.default_model ?? '—'})` },
              ...(selectedProvider?.models ?? []).map(entry => ({
                value: entry.key,
                label: entry.label,
              })),
            ]}
          />
          {model && (
            <p className="mt-1.5 text-xs text-zinc-500">
              {selectedProvider?.models.find(entry => entry.key === model)?.description}
            </p>
          )}
        </div>

        <div className="space-y-4 rounded-lg bg-zinc-50 p-3">
          <label className="flex items-start gap-2.5 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={sharedWithStaff}
              onChange={event => setSharedWithStaff(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-zinc-300"
            />
            <span>
              Tala is switched on
              <span className="block text-xs text-zinc-500">
                Turn this off to pause Tala for the whole school without deleting the key. Access
                you have given individual teachers is remembered.
              </span>
            </span>
          </label>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700">
              Monthly messages per teacher
            </label>
            <Input
              type="number"
              min={1}
              value={monthlyLimit}
              onChange={event => setMonthlyLimit(event.target.value)}
              placeholder="Leave blank for no limit"
            />
            <p className="mt-1.5 text-xs text-zinc-500">
              Counted per teacher, resetting at the start of each month (Philippine time).
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={handleSave} loading={saving} leftIcon={<KeyRound className="h-4 w-4" />}>
            Save key
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * The teacher-by-teacher grant.
 *
 * Selection and bulk actions rather than one row at a time, because a school
 * arriving here for the first time has nobody granted — access starts empty —
 * and "give it to these fourteen people" should not be fourteen requests.
 */
const AccessPanel: React.FC = () => {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  /*
   * A super-administrator belongs to no particular school and works across
   * tenants, so "this institution" is not a question the server can answer for
   * them — it falls back to their own membership, which is some other school.
   * That granted Tala into the wrong institution once. They now choose, and
   * nothing loads until they have.
   */
  const { fullAccess } = usePermissions()
  const [institutionId, setInstitutionId] = useState<string | null>(null)
  const institutions = useInstitutionOptions(fullAccess)

  const scoped = !fullAccess || institutionId !== null

  const access = useTalaAccess(scoped, search, institutionId)
  const mutation = useTalaAccessMutation()

  const rows = access.data?.rows ?? []

  const toggle = (id: string) =>
    setSelected(current => {
      const next = new Set(current)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const apply = async (userIds: string[], granted: boolean) => {
    if (userIds.length === 0) return

    setError(null)
    setNotice(null)

    try {
      // The same institution the list was read from, never the caller's default:
      // reading one school and writing to another is the bug this avoids.
      setNotice(
        await mutation.mutateAsync({
          userIds,
          granted,
          institutionId: access.data?.institution_id ?? institutionId,
        })
      )
      setSelected(new Set())
    } catch (caught: any) {
      setError(caught?.response?.data?.message ?? 'That could not be saved.')
    }
  }

  const allShownSelected = rows.length > 0 && rows.every(row => selected.has(row.id))

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Only the teachers you pick here can open Tala. Everyone else will not see it in their
          sidebar at all.
        </span>
      </div>

      {fullAccess && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-700">School</label>
          <Select
            value={institutionId ?? ''}
            onChange={event => {
              setInstitutionId(event.target.value || null)
              setSelected(new Set())
              setNotice(null)
            }}
            options={[
              { value: '', label: 'Choose a school…' },
              ...institutions.map(entry => ({ value: entry.id, label: entry.title })),
            ]}
          />
          <p className="mt-1.5 text-xs text-zinc-500">
            You administer every school, so Tala cannot guess which one you mean.
          </p>
        </div>
      )}

      {!fullAccess && access.data?.institution_name && (
        <p className="text-xs text-zinc-500">
          Staff of <span className="font-medium text-zinc-700">{access.data.institution_name}</span>.
        </p>
      )}

      {!scoped && (
        <p className="py-6 text-sm text-zinc-500">Pick a school to see its staff.</p>
      )}

      {scoped && (
        <>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search staff by name or email"
            className="pl-9"
          />
        </div>

        <span className="shrink-0 text-xs text-zinc-500">
          <Users className="mr-1 inline h-3.5 w-3.5" />
          {access.data ? `${access.data.granted_count} of ${access.data.staff_count}` : '—'}
        </span>
      </div>

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 pb-3">
          <button
            type="button"
            onClick={() =>
              setSelected(allShownSelected ? new Set() : new Set(rows.map(row => row.id)))
            }
            className="text-xs font-medium text-zinc-600 hover:text-zinc-900"
          >
            {allShownSelected ? 'Clear selection' : `Select all ${rows.length}`}
          </button>

          {selected.size > 0 && (
            <>
              <span className="text-xs text-zinc-400">{selected.size} selected</span>
              <Button
                size="sm"
                onClick={() => apply([...selected], true)}
                loading={mutation.isPending}
                leftIcon={<Check className="h-3.5 w-3.5" />}
              >
                Give access
              </Button>
              <Button
                size="sm"
                variant="outline"
                color="secondary"
                onClick={() => apply([...selected], false)}
                loading={mutation.isPending}
                leftIcon={<X className="h-3.5 w-3.5" />}
              >
                Remove access
              </Button>
            </>
          )}
        </div>
      )}

      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="max-h-80 space-y-1 overflow-y-auto">
        {access.isLoading && (
          <p className="flex items-center gap-2 py-6 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading staff…
          </p>
        )}

        {!access.isLoading && rows.length === 0 && (
          <p className="py-6 text-sm text-zinc-500">
            {search ? 'Nobody matches that search.' : 'No staff found for this school.'}
          </p>
        )}

        {rows.map(row => (
          <StaffRow
            key={row.id}
            row={row}
            selected={selected.has(row.id)}
            busy={mutation.isPending}
            onSelect={() => toggle(row.id)}
            onToggleAccess={() => apply([row.id], !row.granted)}
          />
        ))}
      </div>
        </>
      )}
    </div>
  )
}

/**
 * Schools a super-administrator may administer Tala for.
 *
 * Only fetched for someone who actually needs to choose — an ordinary
 * administrator has exactly one school and the server resolves it from their
 * membership, so asking them to pick would be a question with one answer.
 */
function useInstitutionOptions(enabled: boolean): Array<{ id: string; title: string }> {
  const { data } = useQuery({
    queryKey: ['tala', 'access', 'institutions'],
    queryFn: () => institutionService.getInstitutions({ limit: 200 }),
    enabled,
    refetchOnWindowFocus: false,
  })

  const list = (data as any)?.data ?? data ?? []

  return Array.isArray(list)
    ? list.map((entry: any) => ({ id: entry.id, title: entry.title ?? entry.name ?? entry.id }))
    : []
}

const StaffRow: React.FC<{
  row: TalaAccessRow
  selected: boolean
  busy: boolean
  onSelect: () => void
  onToggleAccess: () => void
}> = ({ row, selected, busy, onSelect, onToggleAccess }) => (
  <div className="flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2">
    <input
      type="checkbox"
      checked={selected}
      onChange={onSelect}
      aria-label={`Select ${row.name}`}
      className="h-4 w-4 shrink-0 rounded border-zinc-300"
    />

    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium text-zinc-900">{row.name}</p>
      <p className="truncate text-xs text-zinc-500">
        {[row.role, row.email].filter(Boolean).join(' · ')}
      </p>
    </div>

    {row.granted && (
      <span className="hidden shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 sm:inline">
        Has access
      </span>
    )}

    <Button
      size="sm"
      variant={row.granted ? 'outline' : 'solid'}
      color={row.granted ? 'secondary' : 'primary'}
      disabled={busy}
      onClick={onToggleAccess}
    >
      {row.granted ? 'Remove' : 'Give access'}
    </Button>
  </div>
)
