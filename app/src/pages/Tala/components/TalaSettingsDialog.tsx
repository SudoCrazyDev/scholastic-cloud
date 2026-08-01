import React, { useMemo, useState } from 'react'
import { ExternalLink, Info, KeyRound, Trash2 } from 'lucide-react'
import { Dialog, DialogActions, DialogBody, DialogTitle } from '../../../components/dialog'
import { Button } from '../../../components/button'
import { Input } from '../../../components/input'
import { Select } from '../../../components/select'
import { useTalaKeyMutations } from '../../../hooks/useTala'
import type { TalaConfig, TalaProviderKey } from '../../../services/talaService'

interface TalaSettingsDialogProps {
  open: boolean
  config: TalaConfig
  onClose: () => void
}

type Scope = 'own' | 'institution'

/**
 * Where a school, or a teacher, points Tala at a provider.
 *
 * Two scopes in one dialog because the precedence between them is the thing
 * people get wrong: the school's key wins, and a teacher who has just typed
 * their own key in needs to be told that before they wonder why their model
 * choice is being ignored.
 */
export const TalaSettingsDialog: React.FC<TalaSettingsDialogProps> = ({ open, config, onClose }) => {
  const mutations = useTalaKeyMutations()

  const canConfigureSchool = config.can_configure_institution
  const [scope, setScope] = useState<Scope>(canConfigureSchool ? 'institution' : 'own')

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

  const saving = mutations.saveOwn.isPending || mutations.saveInstitution.isPending

  const reset = () => {
    setApiKey('')
    setModel('')
    setError(null)
  }

  const handleSave = async () => {
    if (apiKey.trim() === '') {
      setError('Paste the API key first.')
      return
    }

    setError(null)

    try {
      if (scope === 'institution') {
        await mutations.saveInstitution.mutateAsync({
          provider,
          api_key: apiKey.trim(),
          model: model || null,
          shared_with_staff: sharedWithStaff,
          monthly_message_limit: monthlyLimit === '' ? null : Number(monthlyLimit),
        })
      } else {
        await mutations.saveOwn.mutateAsync({
          provider,
          api_key: apiKey.trim(),
          model: model || null,
        })
      }

      reset()
      onClose()
    } catch (caught: any) {
      setError(caught?.response?.data?.message ?? 'That key could not be saved.')
    }
  }

  const handleRemove = async (target: Scope, targetProvider: TalaProviderKey) => {
    setError(null)

    try {
      if (target === 'institution') {
        await mutations.deleteInstitution.mutateAsync(targetProvider)
      } else {
        await mutations.deleteOwn.mutateAsync(targetProvider)
      }
    } catch (caught: any) {
      setError(caught?.response?.data?.message ?? 'That key could not be removed.')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} size="2xl">
      <DialogTitle>Tala settings</DialogTitle>

      <DialogBody className="space-y-5">
        {canConfigureSchool && (
          <div className="flex gap-1 rounded-lg bg-zinc-100 p-1">
            {(
              [
                { key: 'institution' as const, label: 'School key' },
                { key: 'own' as const, label: 'My key' },
              ]
            ).map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setScope(tab.key)
                  reset()
                }}
                className={
                  scope === tab.key
                    ? 'flex-1 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 shadow-sm'
                    : 'flex-1 rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:text-zinc-900'
                }
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        <PrecedenceNote scope={scope} config={config} />

        <ExistingKeys config={config} scope={scope} onRemove={handleRemove} />

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

          {scope === 'institution' && (
            <div className="space-y-4 rounded-lg bg-zinc-50 p-3">
              <label className="flex items-start gap-2.5 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={sharedWithStaff}
                  onChange={event => setSharedWithStaff(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-300"
                />
                <span>
                  Let staff use this key
                  <span className="block text-xs text-zinc-500">
                    Turn this off to keep the key on file without opening it up. Teachers with their
                    own key fall back to it.
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
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>
      </DialogBody>

      <DialogActions>
        <Button variant="outline" color="secondary" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} loading={saving} leftIcon={<KeyRound className="h-4 w-4" />}>
          Save key
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/** Says out loud which key is in charge, and why the other one is idle. */
const PrecedenceNote: React.FC<{ scope: Scope; config: TalaConfig }> = ({ scope, config }) => {
  const message =
    scope === 'own' && config.own_key_overridden
      ? 'Your school has supplied a key, so Tala is using that one. Yours stays saved and takes over if the school removes theirs or stops sharing it.'
      : scope === 'institution'
        ? 'The school key is used by every teacher who can open Tala, and it takes precedence over any key a teacher has added themselves.'
        : 'Your key is used only when the school has not supplied one. You are billed by the provider directly for anything you send.'

  return (
    <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

const ExistingKeys: React.FC<{
  config: TalaConfig
  scope: Scope
  onRemove: (scope: Scope, provider: TalaProviderKey) => void
}> = ({ config, scope, onRemove }) => {
  // The API never returns a stored key, so the school tab can only report that
  // one exists — the summaries themselves are on the teacher's own keys.
  if (scope === 'institution') {
    if (!config.institution_configured) {
      return <p className="text-sm text-zinc-500">No school key has been set yet.</p>
    }

    return (
      <div className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2.5 text-sm">
        <span className="text-zinc-700">
          A school key is set and {config.institution_shared ? 'shared with staff' : 'not shared with staff'}.
        </span>
      </div>
    )
  }

  if (config.own_keys.length === 0) {
    return <p className="text-sm text-zinc-500">You have not added a key of your own.</p>
  }

  return (
    <div className="space-y-2">
      {config.own_keys.map(credential => (
        <div
          key={credential.id}
          className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2.5"
        >
          <div className="min-w-0 text-sm">
            <p className="font-medium text-zinc-900">{credential.provider_label}</p>
            <p className="truncate text-xs text-zinc-500">
              {credential.masked_key} · {credential.model}
            </p>
          </div>

          <button
            type="button"
            onClick={() => onRemove('own', credential.provider)}
            aria-label={`Remove ${credential.provider_label} key`}
            className="rounded p-1.5 text-zinc-400 transition hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

export default TalaSettingsDialog
