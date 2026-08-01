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
          <section key={group.key} className="rounded-lg border border-gray-200">
            <header className="flex items-center justify-between gap-4 border-b border-gray-200 bg-gray-50 px-4 py-2.5">
              <div className="flex items-baseline gap-2 min-w-0">
                <h4 className="text-sm font-semibold text-gray-900">{group.label}</h4>
                <span className="text-xs text-gray-500">
                  {state.granted} of {state.total}
                </span>
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => toggleGroup(group, !state.all)}
                className="text-xs font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50 whitespace-nowrap"
              >
                {state.all ? 'Clear all' : 'Select all'}
              </button>
            </header>

            <div className="divide-y divide-gray-100">
              {group.modules.map((module) => {
                const canView = selected.has(`${module.key}.view`)
                const canManage = selected.has(`${module.key}.manage`)

                return (
                  <div key={module.key} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">{module.label}</p>
                        {module.description && (
                          <p className="mt-0.5 text-xs text-gray-500">{module.description}</p>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-5">
                        <label className="flex items-center gap-2 text-xs text-gray-700">
                          <Checkbox
                            checked={canView}
                            disabled={disabled}
                            onChange={(checked: boolean) => toggleView(module.key, checked)}
                          />
                          View
                        </label>
                        <label className="flex items-center gap-2 text-xs text-gray-700">
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
                      <div className="mt-3 space-y-2 border-l-2 border-gray-100 pl-3">
                        {module.special.map((ability) => (
                          <label key={ability.permission} className="flex items-start gap-2">
                            <Checkbox
                              checked={selected.has(ability.permission)}
                              disabled={disabled}
                              onChange={(checked: boolean) =>
                                toggleSpecial(module.key, ability.permission, checked)
                              }
                            />
                            <span className="min-w-0">
                              <span className="block text-xs font-medium text-gray-800">
                                {ability.label}
                              </span>
                              {ability.description && (
                                <span className="block text-xs text-gray-500">
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
