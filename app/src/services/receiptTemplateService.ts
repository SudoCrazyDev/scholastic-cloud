import { api } from '../lib/api'
import type { ApiResponse, ReceiptTemplate, CreateReceiptTemplateData } from '../types'

class ReceiptTemplateService {
  private baseUrl = '/receipt-templates'

  async getTemplates() {
    const response = await api.get<ApiResponse<ReceiptTemplate[]>>(this.baseUrl)
    return response.data
  }

  async getTemplate(id: string) {
    const response = await api.get<ApiResponse<ReceiptTemplate>>(`${this.baseUrl}/${id}`)
    return response.data
  }

  async createTemplate(data: CreateReceiptTemplateData) {
    const response = await api.post<ApiResponse<ReceiptTemplate>>(this.baseUrl, data)
    return response.data
  }

  async updateTemplate(id: string, data: Partial<CreateReceiptTemplateData>) {
    const response = await api.put<ApiResponse<ReceiptTemplate>>(`${this.baseUrl}/${id}`, data)
    return response.data
  }

  async deleteTemplate(id: string) {
    await api.delete(`${this.baseUrl}/${id}`)
  }
}

export const receiptTemplateService = new ReceiptTemplateService()
