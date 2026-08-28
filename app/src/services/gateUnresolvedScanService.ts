import { api } from '../lib/api'
import type { ApiResponse, GateUnresolvedScan } from '../types'

/**
 * Cards that tapped at a gate and could not be placed.
 *
 * Read by the Gate Entries page. A row leaves this list on its own as soon as
 * the card resolves — registering the tag is the fix the list exists to prompt —
 * so dismissing is only for the other endings: a visitor's card, a misread, a
 * tag that was never going to be registered.
 */
class GateUnresolvedScanService {
  private baseUrl = '/gate/unresolved-scans'

  async getScans(gateType?: 'enter' | 'exit') {
    const query = gateType ? `?gate_type=${gateType}` : ''
    const response = await api.get<ApiResponse<GateUnresolvedScan[]>>(`${this.baseUrl}${query}`)
    return response.data
  }

  async dismiss(id: string) {
    const response = await api.delete<{ success: boolean }>(`${this.baseUrl}/${id}`)
    return response.data
  }
}

export const gateUnresolvedScanService = new GateUnresolvedScanService()
