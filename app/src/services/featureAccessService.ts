import { api } from '../lib/api'
import type { ApiResponse } from '../types'

/** One switchable feature in the platform catalog. */
export interface PlatformFeature {
  key: string
  label: string
  description: string
  default_enabled: boolean
  notes: string | null
}

export interface InstitutionFeatureState {
  enabled: boolean
  /**
   * False when nobody has decided about this school and the feature's own
   * default is answering. Worth showing: "nobody has looked at this yet" and
   * "someone turned it off" are different situations.
   */
  decided: boolean
  updated_at: string | null
}

export interface InstitutionFeatureRow {
  id: string
  title: string
  features: Record<string, InstitutionFeatureState>
}

export interface FeatureAccessPayload {
  features: PlatformFeature[]
  institutions: InstitutionFeatureRow[]
}

class FeatureAccessService {
  /** The whole matrix in one request — there are tens of schools, not thousands. */
  async getAll() {
    const response = await api.get<ApiResponse<FeatureAccessPayload>>('/institution-features')
    return response.data
  }

  async setEnabled(institutionId: string, feature: string, enabled: boolean) {
    const response = await api.put<
      ApiResponse<{ institution_id: string; feature: string; enabled: boolean; decided: boolean }>
    >(`/institution-features/${institutionId}/${feature}`, { enabled })
    return response.data
  }
}

export const featureAccessService = new FeatureAccessService()
