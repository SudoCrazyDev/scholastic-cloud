import React, { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Info, Search, ShieldCheck } from 'lucide-react'
import { Switch } from '../../components/switch'
import {
  featureAccessService,
  type FeatureAccessPayload,
  type InstitutionFeatureRow,
  type PlatformFeature,
} from '../../services/featureAccessService'

const featureAccessKey = ['feature-access'] as const

/**
 * Which institutions have which features.
 *
 * Platform administration, and the one screen that decides something *for* a
 * school rather than by it. That distinction is the whole point: a role decides
 * who inside a school may open a screen, and a school's own administrator sets
 * those. This decides whether the school has the thing at all, and no role in
 * the school — including its administrator — can reach it.
 *
 * A matrix rather than a page per institution, because the question people
 * actually arrive with is "who has chat?", not "what does this one school have".
 */
const FeatureAccess: React.FC = () => {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: featureAccessKey,
    queryFn: async () => (await featureAccessService.getAll()).data,
  })

  /*
   * One switch at a time, and the row is written straight into the cache on the
   * way back rather than refetching the matrix. Switching a school on and
   * watching the whole table blink would make it hard to be sure which row was
   * changed.
   */
  const toggle = useMutation({
    mutationFn: ({
      institutionId,
      feature,
      enabled,
    }: {
      institutionId: string
      feature: string
      enabled: boolean
    }) => featureAccessService.setEnabled(institutionId, feature, enabled),
    onSuccess: response => {
      const changed = response.data
      queryClient.setQueryData<FeatureAccessPayload>(featureAccessKey, existing =>
        existing
          ? {
              ...existing,
              institutions: existing.institutions.map(institution =>
                institution.id === changed.institution_id
                  ? {
                      ...institution,
                      features: {
                        ...institution.features,
                        [changed.feature]: {
                          ...institution.features[changed.feature],
                          enabled: changed.enabled,
                          decided: true,
                        },
                      },
                    }
                  : institution,
              ),
            }
          : existing,
      )
    },
  })

  const features = useMemo<PlatformFeature[]>(() => data?.features ?? [], [data])

  const institutions = useMemo<InstitutionFeatureRow[]>(() => {
    const rows = data?.institutions ?? []
    const term = search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter(institution => institution.title.toLowerCase().includes(term))
  }, [data, search])

  /** Which of these switches is mid-flight, so only that one goes quiet. */
  const pendingKey = toggle.isPending
    ? `${toggle.variables?.institutionId}:${toggle.variables?.feature}`
    : null

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-zinc-900">Feature Access</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">
            Which features each institution has. This is not a role: a feature switched off here is
            closed to everyone at that school, including its own administrator, and only this screen
            can turn it back on.
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

      {features.length > 0 && (
        <div className="space-y-2">
          {features.map(feature => (
            <div
              key={feature.key}
              className="flex gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3"
            >
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
              <div className="min-w-0 text-sm">
                <p className="font-medium text-zinc-900">
                  {feature.label}
                  {!feature.default_enabled && (
                    <span className="ml-2 rounded-full bg-zinc-200 px-2 py-0.5 text-[11px] font-normal text-zinc-600">
                      off for new institutions
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-zinc-600">{feature.description}</p>
                {feature.notes && (
                  <p className="mt-1 flex items-start gap-1.5 text-xs text-zinc-500">
                    <Info className="mt-0.5 h-3 w-3 shrink-0" />
                    {feature.notes}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {toggle.isError && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          That change did not save. The institution still has whatever it had before — check your
          connection and try again.
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left">
                <th scope="col" className="px-4 py-3 font-medium text-zinc-700">
                  Institution
                </th>
                {features.map(feature => (
                  <th
                    key={feature.key}
                    scope="col"
                    className="w-40 px-4 py-3 font-medium text-zinc-700"
                  >
                    {feature.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={features.length + 1} className="px-4 py-8 text-center text-zinc-500">
                    Loading institutions…
                  </td>
                </tr>
              )}

              {isError && (
                <tr>
                  <td colSpan={features.length + 1} className="px-4 py-8 text-center text-zinc-500">
                    Could not load institutions.
                  </td>
                </tr>
              )}

              {!isLoading && !isError && institutions.length === 0 && (
                <tr>
                  <td colSpan={features.length + 1} className="px-4 py-8 text-center text-zinc-500">
                    {search ? `No institution matches “${search}”.` : 'No institutions yet.'}
                  </td>
                </tr>
              )}

              {institutions.map(institution => (
                <tr key={institution.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-zinc-900">{institution.title}</td>

                  {features.map(feature => {
                    const state = institution.features[feature.key]
                    const busy = pendingKey === `${institution.id}:${feature.key}`

                    return (
                      <td key={feature.key} className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Switch
                            checked={state?.enabled ?? false}
                            disabled={busy}
                            onChange={enabled =>
                              toggle.mutate({
                                institutionId: institution.id,
                                feature: feature.key,
                                enabled,
                              })
                            }
                            aria-label={`${feature.label} for ${institution.title}`}
                          />
                          <span
                            className={clsx(
                              'text-xs',
                              busy
                                ? 'text-zinc-400'
                                : state?.enabled
                                  ? 'text-zinc-700'
                                  : 'text-zinc-400',
                            )}
                          >
                            {busy ? 'Saving…' : state?.enabled ? 'On' : 'Off'}
                            {/*
                              Nobody has decided about this school — the
                              feature's default is answering. Distinct from
                              someone having deliberately switched it off, and
                              worth saying so before a rollout.
                            */}
                            {!busy && !state?.decided && (
                              <span className="ml-1 text-zinc-400">· default</span>
                            )}
                          </span>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-zinc-500">
        A change takes effect the next time that school&rsquo;s users load the app. Anyone with the
        screen already open keeps it until they refresh — the API refuses the calls behind it
        immediately either way.
      </p>
    </div>
  )
}

export default FeatureAccess
