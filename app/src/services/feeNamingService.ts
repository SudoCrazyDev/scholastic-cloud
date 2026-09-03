import { api } from '../lib/api'
import type {
  FeeNamingPlan,
  FeeNamingRun,
  FeeNamingScope,
} from '../types'

/**
 * Naming the fees on collections posted as "General / Other".
 *
 * The preview writes nothing; the run recomputes its own plan rather than being handed
 * the one the screen is showing, so a payment posted while somebody reads the preview
 * cannot turn it into a stale instruction.
 */
class FeeNamingService {
  async preview(params: { academic_year?: string | null; scope: FeeNamingScope }) {
    const response = await api.post<{ success: boolean; data: FeeNamingPlan }>(
      '/finance/fee-naming/preview',
      { academic_year: params.academic_year || undefined, scope: params.scope }
    )
    return response.data
  }

  async run(params: { academic_year?: string | null; scope: FeeNamingScope }) {
    const response = await api.post<{
      success: boolean
      message?: string
      data: FeeNamingRun
    }>('/finance/fee-naming', {
      academic_year: params.academic_year || undefined,
      scope: params.scope,
    })
    return response.data
  }

  async runs() {
    const response = await api.get<{ success: boolean; data: FeeNamingRun[] }>(
      '/finance/fee-naming/runs'
    )
    return response.data
  }

  async revert(id: string) {
    const response = await api.post<{
      success: boolean
      message?: string
      data: FeeNamingRun
    }>(`/finance/fee-naming/runs/${id}/revert`)
    return response.data
  }
}

export const feeNamingService = new FeeNamingService()
