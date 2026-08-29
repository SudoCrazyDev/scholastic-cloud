import { api } from '../lib/api'
import type { ApiResponse } from '../types'

/** One credential a provider needs, as declared in the platform's catalog. */
export interface PaymentCredentialField {
  key: string
  label: string
  hint: string | null
  required: boolean
}

export interface PaymentProviderOption {
  key: string
  label: string
}

export interface PaymentProviderProduct {
  key: string
  label: string
  description: string | null
}

/**
 * A provider the platform knows how to talk to. The form is rendered from
 * this rather than hard-coded, so a provider added on the server appears here
 * without a frontend change.
 */
export interface PaymentProvider {
  key: string
  label: string
  description: string
  /** False for a catalog entry whose driver has not been written yet. */
  available: boolean
  modes: PaymentProviderOption[]
  products: PaymentProviderProduct[]
  default_product: string | null
  currencies: string[]
  credentials: PaymentCredentialField[]
}

/**
 * What the screen is allowed to know about one school's merchant account.
 * The keys themselves are never sent — only whether each is set, and its last
 * four characters.
 */
export interface InstitutionGateway {
  id: string
  institution_id: string
  provider: string
  provider_label: string
  mode: string
  product: string | null
  currency: string
  is_active: boolean
  /** Every required key present and a driver available for the provider. */
  ready: boolean
  /** Why it is not ready, in sentences meant to be shown as-is. */
  problems: string[]
  keys: Record<string, { set: boolean; masked: string | null }>
  /** The URL to paste into the provider's dashboard. */
  webhook_url: string
  last_used_at: string | null
  updated_at: string | null
}

export interface InstitutionGatewayRow {
  id: string
  title: string
  gateways: InstitutionGateway[]
}

export interface PaymentGatewayPayload {
  providers: PaymentProvider[]
  institutions: InstitutionGatewayRow[]
}

export interface SaveGatewayInput {
  mode: string
  product?: string
  currency?: string
  is_active: boolean
  /**
   * Only the keys actually being changed need a value. A blank is "leave what
   * is stored" — the screen has never been given the stored keys and cannot
   * echo them back.
   */
  credentials: Record<string, string>
}

export interface SaveGatewayResult {
  data: InstitutionGateway
  /** Required keys still missing, keyed by field. The row saved regardless. */
  outstanding: Record<string, string[]>
}

class PaymentGatewayService {
  private baseUrl = '/institution-payment-gateways'

  /** The whole matrix in one request — tens of schools, not thousands. */
  async getAll() {
    const response = await api.get<ApiResponse<PaymentGatewayPayload>>(this.baseUrl)
    return response.data
  }

  async save(institutionId: string, provider: string, input: SaveGatewayInput) {
    const response = await api.put<ApiResponse<InstitutionGateway> & SaveGatewayResult>(
      `${this.baseUrl}/${institutionId}/${provider}`,
      input,
    )
    return response.data
  }

  async remove(institutionId: string, provider: string) {
    const response = await api.delete<ApiResponse<null>>(`${this.baseUrl}/${institutionId}/${provider}`)
    return response.data
  }
}

export const paymentGatewayService = new PaymentGatewayService()
