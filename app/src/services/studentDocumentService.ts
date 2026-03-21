import { api } from '../lib/api'
import type { StudentDocument } from '../types'

class StudentDocumentService {
  private baseUrl(studentId: string) {
    return `/students/${studentId}/documents`
  }

  async getDocuments(studentId: string) {
    const response = await api.get<{ success: boolean; data: StudentDocument[] }>(
      this.baseUrl(studentId)
    )
    return response.data
  }

  async uploadDocument(studentId: string, documentType: string, file: File) {
    const formData = new FormData()
    formData.append('document_type', documentType)
    formData.append('file', file, file.name)

    const response = await api.post<{ success: boolean; data: StudentDocument }>(
      this.baseUrl(studentId),
      formData
    )
    return response.data
  }

  async deleteDocument(studentId: string, documentId: string) {
    const response = await api.delete<{ success: boolean; message: string }>(
      `${this.baseUrl(studentId)}/${documentId}`
    )
    return response.data
  }

  async crossCheck(studentId: string, documentId: string) {
    const response = await api.post<{
      success: boolean
      data: { type: 'image' | 'pdf'; text: string; totalPages?: number }
      error?: string
    }>(`${this.baseUrl(studentId)}/${documentId}/cross-check`)
    return response.data
  }
}

export const studentDocumentService = new StudentDocumentService()
