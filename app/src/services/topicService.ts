import { api } from '../lib/api'
import type { Topic, ApiResponse } from '../types'

export interface CreateTopicData {
  subject_id: string
  title: string
  description?: string
  is_completed?: boolean
  quarter?: string
}

export interface UpdateTopicData {
  title?: string
  description?: string
  is_completed?: boolean
  quarter?: string
}

export interface ReorderTopicsData {
  subject_id: string
  topic_orders: Array<{
    id: string
    order: number
  }>
}

export interface BulkCreateTopicsData {
  subject_id: string
  quarter?: string
  topics: Array<{
    title: string
    description?: string
  }>
}

export const topicService = {
  /**
   * Get all topics for a subject
   */
  async getTopics(subjectId: string): Promise<Topic[]> {
    try {
      console.log('Fetching topics for subject:', subjectId)
      const response = await api.get<ApiResponse<Topic[]>>('/topics', {
        params: { subject_id: subjectId }
      })
      console.log('Topics response:', response.data)
      return response.data.data
    } catch (error) {
      console.error('Error fetching topics:', error)
      throw error
    }
  },

  /**
   * Get a single topic by ID
   */
  async getTopic(id: string): Promise<Topic> {
    try {
      const response = await api.get<ApiResponse<Topic>>(`/topics/${id}`)
      return response.data.data
    } catch (error) {
      console.error('Error fetching topic:', error)
      throw error
    }
  },

  /**
   * Create a new topic
   */
  async createTopic(data: CreateTopicData): Promise<Topic> {
    try {
      console.log('Creating topic with data:', data)
      const response = await api.post<ApiResponse<Topic>>('/topics', data)
      console.log('Create topic response:', response.data)
      return response.data.data
    } catch (error) {
      console.error('Error creating topic:', error)
      throw error
    }
  },

  /**
   * Bulk create topics (recommended for AI generation).
   */
  async bulkCreateTopics(data: BulkCreateTopicsData): Promise<Topic[]> {
    try {
      const response = await api.post<ApiResponse<Topic[]>>('/topics/bulk', data)
      return response.data.data
    } catch (error) {
      console.error('Error bulk creating topics:', error)
      throw error
    }
  },

  /**
   * Update an existing topic
   */
  async updateTopic(id: string, data: UpdateTopicData): Promise<Topic> {
    try {
      const response = await api.put<ApiResponse<Topic>>(`/topics/${id}`, data)
      return response.data.data
    } catch (error) {
      console.error('Error updating topic:', error)
      throw error
    }
  },

  /**
   * Delete a topic
   */
  async deleteTopic(id: string): Promise<void> {
    try {
      await api.delete<ApiResponse<void>>(`/topics/${id}`)
    } catch (error) {
      console.error('Error deleting topic:', error)
      throw error
    }
  },

  /**
   * Reorder topics for a subject
   */
  async reorderTopics(data: ReorderTopicsData): Promise<Topic[]> {
    try {
      const response = await api.post<ApiResponse<Topic[]>>('/topics/reorder', data)
      return response.data.data
    } catch (error) {
      console.error('Error reordering topics:', error)
      throw error
    }
  },

  /**
   * Toggle completion status of a topic
   */
  async toggleCompletion(id: string): Promise<Topic> {
    try {
      const response = await api.patch<ApiResponse<Topic>>(`/topics/${id}/toggle-completion`)
      return response.data.data
    } catch (error) {
      console.error('Error toggling topic completion:', error)
      throw error
    }
  }
}
