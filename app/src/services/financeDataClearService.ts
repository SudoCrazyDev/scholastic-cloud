import { api } from '../lib/api'
import type {
  ApiResponse,
  FinanceDataClearCatalog,
  FinanceDataClearLogEntry,
  FinanceDataClearPreview,
  FinanceDataClearResult,
} from '../types'

/**
 * Clearing a year's Finance data.
 *
 * Every call needs the `finance.clear-data` ability, which is separate from
 * `finance.manage` — the API refuses regardless of what the client renders.
 *
 * `preview` is a POST because it carries an array of group keys, not because it
 * changes anything.
 */
class FinanceDataClearService {
  private baseUrl = '/finance/data-clear'

  /** The clearable groups, plus the areas that are never touched. */
  async getGroups() {
    const response = await api.get<ApiResponse<FinanceDataClearCatalog>>(`${this.baseUrl}/groups`)
    return response.data
  }

  /** Row counts for a proposed clear, and anything blocking it. */
  async preview(params: { academic_year: string; groups: string[] }) {
    const response = await api.post<ApiResponse<FinanceDataClearPreview>>(
      `${this.baseUrl}/preview`,
      params
    )
    return response.data
  }

  /**
   * Perform the clear. `confirmation` must equal `academic_year` — the API
   * checks it too, so skipping the dialog does not skip the intent.
   */
  async clear(params: { academic_year: string; groups: string[]; confirmation: string }) {
    const response = await api.post<ApiResponse<FinanceDataClearResult>>(this.baseUrl, params)
    return response.data
  }

  async getHistory() {
    const response = await api.get<ApiResponse<FinanceDataClearLogEntry[]>>(`${this.baseUrl}/history`)
    return response.data
  }
}

export const financeDataClearService = new FinanceDataClearService()
