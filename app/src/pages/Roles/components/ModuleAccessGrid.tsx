import React, { useMemo } from 'react'
import { Checkbox } from '../../../components/checkbox'
import type { ModuleCatalogGroup } from '../../../types'

interface ModuleAccessGridProps {
  groups: ModuleCatalogGroup[]
  /** Currently ticked permission strings. */
  value: string[]
  onChange: (permissions: string[]) => void
  disabled?: boolean
}

/**
 * The role builder's grid: one row per module, with View and Manage, plus any
 * special abilities that module carries (approving voids, releasing payslips).
 *
 * Two rules are enforced here so a role can never be saved in a state the API
 * would silently repair:
 *  - Manage implies View. Ticking Manage ticks View; unticking View clears the
 *    whole row.
 *  - A special ability implies View, for the same reason.
 */
export const ModuleAccessGrid: React.FC<ModuleAccessGridProps> = ({
  groups,
  value,
  onChange,
  disabled = false,
}) => {
  const selected = useMemo(() => new Set(value), [value])

  const apply = (next: Set<string>) => onChange(Array.from(next))

  const toggleView = (moduleKey: string, checked: boolean) => {
    const next = new Set(selected)

    if (checked) {
      next.add(`${moduleKey}.view`)
    } else {
      // Dropping read access drops everything else in the row with it —
      // "can approve voids but cannot open Finance" is not a real role.
      Array.from(next)
        .filter((p) => p.startsWith(`${moduleKey}.`))
        .forEach((p) => next.delete(p))
    }

    apply(next)
  }

  const toggleManage = (moduleKey: string, checked: boolean) => {
    const next = new Set(selected)

    if (checked) {
      next.add(`${moduleKey}.manage`)
      next.add(`${moduleKey}.view`)
    } else {
      next.delete(`${moduleKey}.manage`)
    }

    apply(next)
  }

  const toggleSpecial = (moduleKey: string, permission: string, checked: boolean) => {
    const next = new Set(selected)

    if (checked) {
      next.add(permission)
      next.add(`${moduleKey}.view`)
    } else {
      next.delete(permission)
    }

    apply(next)
  }

  const toggleGroup = (group: ModuleCatalogGroup, checked: boolean) => {
    const next = new Set(selected)

    group.modules.forEach((module) => {
      if (checked) {
        next.add(`${module.key}.view`)
        next.add(`${module.key}.manage`)
      } else {
        Array.from(next)
          .filter((p) => p.startsWith(`${module.key}.`))
          .forEach((p) => next.delete(p))
      }
    })

    apply(next)
  }

  const groupState = (group: ModuleCatalogGroup) => {
    const total = group.modules.length
    const granted = group.modules.filter((m) => selected.has(`${m.key}.view`)).length

    return { granted, total, all: granted === total && total > 0, some: granted > 0 && granted < total }
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const state = groupState(group)

        return (
          <section
            key={group.key}
            className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700"
          >
            <header className="flex items-center justify-between gap-4 border-b border-gray-200 bg-gray-50 px-4 py-2.5 dark:border-gray-700 dark:bg-gray-800/60">
              <div className="flex min-w-0 items-baseline gap-2">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {group.label}
                </h4>
                <span
                  className={
                    state.granted > 0
                      ? 'text-xs text-primary-600 dark:text-primary-400'
                      : 'text-xs text-gray-500 dark:text-gray-400'
                  }
                >
                  {state.granted} of {state.total}
                </span>
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => toggleGroup(group, !state.all)}
                className="whitespace-nowrap text-xs font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50 dark:text-primary-400 dark:hover:text-primary-300"
              >
                {state.all ? 'Clear all' : 'Select all'}
              </button>
            </header>

            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {group.modules.map((module) => {
                const canView = selected.has(`${module.key}.view`)
                const canManage = selected.has(`${module.key}.manage`)
                const grantedSpecials = module.special.filter((a) =>
                  selected.has(a.permission)
                ).length

                return (
                  <div
                    key={module.key}
                    className={`px-4 py-3 transition-colors ${
                      canView ? 'bg-primary-50/40 dark:bg-primary-500/5' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {module.label}
                          </p>
                          {/*
                            Approvals live below the row and only unfold once
                            the module is granted, which made them easy to tick
                            View + Manage and never notice — the reason a
                            finance role could end up unable to void anything.
                            Say up front that the module carries them.
                          */}
                          {module.special.length > 0 && (
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                grantedSpecials > 0
                                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-400/10 dark:text-amber-400'
                              }`}
                              title="Extra abilities that are not included in Manage"
                            >
                              {grantedSpecials > 0
                                ? `${grantedSpecials}/${module.special.length} extra`
                                : `${module.special.length} extra ${module.special.length === 1 ? 'ability' : 'abilities'}`}
                            </span>
                          )}
                        </div>
                        {module.description && (
                          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            {module.description}
                          </p>
                        )}
                        {module.special.length > 0 && !canView && (
                          <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-500">
                            Grant View to choose them
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-5">
                        <label
                          className={`flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 ${
                            disabled ? '' : 'cursor-pointer'
                          }`}
                        >
                          <Checkbox
                            checked={canView}
                            disabled={disabled}
                            onChange={(checked: boolean) => toggleView(module.key, checked)}
                          />
                          View
                        </label>
                        <label
                          className={`flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 ${
                            disabled ? '' : 'cursor-pointer'
                          }`}
                        >
                          <Checkbox
                            checked={canManage}
                            disabled={disabled}
                            onChange={(checked: boolean) => toggleManage(module.key, checked)}
                          />
                          Manage
                        </label>
                      </div>
                    </div>

                    {module.special.length > 0 && canView && (
                      <div className="mt-3 space-y-2 border-l-2 border-primary-200 pl-3 dark:border-primary-500/30">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Extra abilities — not included in Manage
                        </p>
                        {module.special.map((ability) => (
                          <label
                            key={ability.permission}
                            className={`flex items-start gap-2 ${disabled ? '' : 'cursor-pointer'}`}
                          >
                            <Checkbox
                              checked={selected.has(ability.permission)}
                              disabled={disabled}
                              onChange={(checked: boolean) =>
                                toggleSpecial(module.key, ability.permission, checked)
                              }
                            />
                            <span className="min-w-0">
                              <span className="block text-xs font-medium text-gray-800 dark:text-gray-200">
                                {ability.label}
                              </span>
                              {ability.description && (
                                <span className="block text-xs text-gray-500 dark:text-gray-400">
                                  {ability.description}
                                </span>
                              )}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

export default ModuleAccessGrid
