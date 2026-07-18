import { api } from '../lib/api'
import type {
  ApiResponse,
  SiblingGroup,
  SiblingGroupMember,
  StudentDiscount,
  CreateSiblingGroupData,
  UpdateSiblingMemberData,
  ApplySiblingDiscountData,
} from '../types'

class SiblingGroupService {
  private baseUrl = '/sibling-groups'

  async getGroups(params: { academic_year?: string; search?: string } = {}) {
    const queryParams = new URLSearchParams()
    if (params.academic_year) queryParams.append('academic_year', params.academic_year)
    if (params.search) queryParams.append('search', params.search)

    const query = queryParams.toString()
    const url = query ? `${this.baseUrl}?${query}` : this.baseUrl
    const response = await api.get<ApiResponse<SiblingGroup[]>>(url)
    return response.data
  }

  async getGroupForStudent(studentId: string) {
    const response = await api.get<ApiResponse<SiblingGroup | null>>(`/students/${studentId}/sibling-group`)
    return response.data
  }

  async createGroup(data: CreateSiblingGroupData) {
    const response = await api.post<ApiResponse<SiblingGroup>>(this.baseUrl, data)
    return response.data
  }

  async deleteGroup(id: string) {
    const response = await api.delete<ApiResponse<null>>(`${this.baseUrl}/${id}`)
    return response.data
  }

  async addMember(groupId: string, studentId: string) {
    const response = await api.post<ApiResponse<SiblingGroupMember>>(`${this.baseUrl}/${groupId}/members`, {
      student_id: studentId,
    })
    return response.data
  }

  async updateMember(groupId: string, memberId: string, data: UpdateSiblingMemberData) {
    const response = await api.put<ApiResponse<SiblingGroupMember>>(
      `${this.baseUrl}/${groupId}/members/${memberId}`,
      data
    )
    return response.data
  }

  async removeMember(groupId: string, memberId: string) {
    const response = await api.delete<ApiResponse<{ remaining_members: number }>>(
      `${this.baseUrl}/${groupId}/members/${memberId}`
    )
    return response.data
  }

  async applyDiscount(groupId: string, memberId: string, data: ApplySiblingDiscountData) {
    const response = await api.post<ApiResponse<StudentDiscount>>(
      `${this.baseUrl}/${groupId}/members/${memberId}/apply-discount`,
      data
    )
    return response.data
  }
}

export const siblingGroupService = new SiblingGroupService()
