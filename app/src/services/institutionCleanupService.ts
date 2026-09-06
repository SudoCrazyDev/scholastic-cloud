import { api } from '../lib/api'
import type {
  ApiResponse,
  InstitutionCleanupCatalog,
  InstitutionCleanupLogEntry,
  InstitutionCleanupPreview,
  InstitutionCleanupResult,
} from '../types'

/**
 * Emptying one institution back to its students and staff.
 *
 * Platform administration. Every call needs the `institution-cleanup` module,
 * which is `system_only`, *and* the caller must be the super-administrator —
 * the API checks the role slug on all four endpoints regardless of what this
 * client renders or what permissions a role happens to hold.
 *
 * The institution is in the path rather than resolved from the signed-in user,
 * because a super-administrator has no meaningful institution of their own and
 * a defaulted target is the worst available way to run this against the wrong
 * school.
 *
 * `preview` is a POST because it carries an array of group keys, not because it
 * changes anything.
 */
class InstitutionCleanupService {
  private baseUrl = '/institution-cleanup'

  /** The groups, what is never touched, and the institutions to choose from. */
  async getGroups() {
    const response = await api.get<ApiResponse<InstitutionCleanupCatalog>>(`${this.baseUrl}/groups`)
    return response.data
  }

  /** Row counts for a proposed clean-up, and anything blocking it. */
  async preview(institutionId: string, groups: string[]) {
    const response = await api.post<ApiResponse<InstitutionCleanupPreview>>(
      `${this.baseUrl}/${institutionId}/preview`,
      { groups }
    )
    return response.data
  }

  /**
   * Perform the clean-up. `confirmation` must equal the institution's own title
   * — the API checks it too, so skipping the dialog does not skip the intent.
   */
  async clear(params: { institutionId: string; groups: string[]; confirmation: string }) {
    const response = await api.post<ApiResponse<InstitutionCleanupResult>>(
      `${this.baseUrl}/${params.institutionId}`,
      { groups: params.groups, confirmation: params.confirmation }
    )
    return response.data
  }

  /** Past clean-ups across every institution, newest first. */
  async getHistory() {
    const response = await api.get<ApiResponse<InstitutionCleanupLogEntry[]>>(
      `${this.baseUrl}/history`
    )
    return response.data
  }
}

export const institutionCleanupService = new InstitutionCleanupService()
