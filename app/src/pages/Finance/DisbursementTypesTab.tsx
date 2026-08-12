import React from 'react'
import { Tags, Wallet } from 'lucide-react'
import { DisbursementTypeListCard } from './DisbursementTypeListCard'
import type { Disbursement } from '../../types'
import type { useDisbursements } from '../../hooks/useDisbursements'

type Dm = ReturnType<typeof useDisbursements>

/** Count and total the disbursements pointing at each lookup row. */
function usageBy(
  disbursements: Disbursement[],
  key: 'disbursement_type_id' | 'disbursement_component_type_id'
): Record<string, { count: number; total: number }> {
  const map: Record<string, { count: number; total: number }> = {}
  for (const d of disbursements) {
    const id = d[key]
    if (!id) continue
    const entry = map[id] ?? { count: 0, total: 0 }
    entry.count += 1
    entry.total += Number(d.amount) || 0
    map[id] = entry
  }
  return map
}

export function DisbursementTypesTab({ dm }: { dm: Dm }) {
  const {
    types,
    componentTypes,
    disbursements,
    createType,
    deleteType,
    typeMutationLoading,
    createComponentType,
    deleteComponentType,
    componentTypeMutationLoading,
  } = dm

  const typeUsage = React.useMemo(() => usageBy(disbursements, 'disbursement_type_id'), [disbursements])
  const componentUsage = React.useMemo(
    () => usageBy(disbursements, 'disbursement_component_type_id'),
    [disbursements]
  )

  return (
    <div className="space-y-6">
      <DisbursementTypeListCard
        icon={Tags}
        title="Disbursement Types"
        description="Create the categories used when recording disbursements. Deleting a type keeps existing records — they simply show no type."
        placeholder="e.g. Utilities, Supplies, Salaries"
        columnLabel="Type"
        emptyText="No types yet. Add one above."
        rows={types.map((t) => ({ id: t.id, name: t.name }))}
        usage={typeUsage}
        mutationLoading={typeMutationLoading}
        onAdd={createType}
        onDelete={deleteType}
        deleteTitle="Delete Type"
        deleteMessage={(name) =>
          `Delete the type "${name}"? Existing disbursements using it will keep their records but show no type.`
        }
      />

      <DisbursementTypeListCard
        icon={Wallet}
        title="Disbursement Component Types"
        description="How the money leaves the school. New disbursements start on the default, Cash Dispense — add your own for anything else, such as Check or Bank Transfer."
        placeholder="e.g. Check, Bank Transfer, Petty Cash"
        columnLabel="Component Type"
        emptyText="No component types yet. Add one above."
        rows={componentTypes.map((t) => ({ id: t.id, name: t.name, locked: t.is_default }))}
        usage={componentUsage}
        mutationLoading={componentTypeMutationLoading}
        onAdd={createComponentType}
        onDelete={deleteComponentType}
        deleteTitle="Delete Component Type"
        deleteMessage={(name) =>
          `Delete the component type "${name}"? Existing disbursements using it will keep their records but show no component type.`
        }
      />
    </div>
  )
}
