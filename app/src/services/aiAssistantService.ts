import { api } from '../lib/api'

export interface AiAssistRequest {
  prompt: string
  tone?: string
  context?: string
}

export interface AiAssistResponse {
  text: string
  provider?: string
  model?: string
}

class AiAssistantService {
  async assist(data: AiAssistRequest): Promise<AiAssistResponse> {
    const response = await api.post<AiAssistResponse>('/ai/assist', data)
    return response.data
  }
}

export const aiAssistantService = new AiAssistantService()

