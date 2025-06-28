import UserInstitution from '#models/user_institution'
import User from '#models/user'
import Institution from '#models/institution'

export interface AssignUserToInstitutionData {
  user_id: string
  institution_id: string
  is_default?: boolean
}

export interface UpdateUserInstitutionData {
  is_default?: boolean
}

export default class UserInstitutionService {
  /**
   * Get all institutions for a user
   */
  async getUserInstitutions(userId: string): Promise<UserInstitution[]> {
    return await UserInstitution.query()
      .where('user_id', userId)
      .orderBy('is_default', 'desc')
      .orderBy('created_at', 'desc')
  }

  /**
   * Get user's default institution
   */
  async getUserDefaultInstitution(userId: string): Promise<UserInstitution | null> {
    return await UserInstitution.query()
      .where('user_id', userId)
      .where('is_default', true)
      .first()
  }

  /**
   * Assign a user to an institution
   */
  async assignUserToInstitution(data: AssignUserToInstitutionData): Promise<UserInstitution> {
    // Check if user is already assigned to this institution
    const existingAssignment = await UserInstitution.query()
      .where('user_id', data.user_id)
      .where('institution_id', data.institution_id)
      .first()

    if (existingAssignment) {
      // Update existing assignment
      existingAssignment.merge({
        is_default: data.is_default || false,
      })
      await existingAssignment.save()
      return existingAssignment
    } else {
      // Create new assignment
      return await UserInstitution.create({
        user_id: data.user_id,
        institution_id: data.institution_id,
        is_default: data.is_default || false,
      })
    }
  }

  /**
   * Update user institution assignment
   */
  async updateUserInstitution(
    userId: string, 
    institutionId: string, 
    data: UpdateUserInstitutionData
  ): Promise<UserInstitution | null> {
    const userInstitution = await UserInstitution.query()
      .where('user_id', userId)
      .where('institution_id', institutionId)
      .first()

    if (!userInstitution) {
      return null
    }

    userInstitution.merge(data)
    await userInstitution.save()
    return userInstitution
  }

  /**
   * Remove user from institution
   */
  async removeUserFromInstitution(userId: string, institutionId: string): Promise<boolean> {
    const userInstitution = await UserInstitution.query()
      .where('user_id', userId)
      .where('institution_id', institutionId)
      .first()

    if (!userInstitution) {
      return false
    }

    await userInstitution.delete()
    return true
  }

  /**
   * Set user's default institution
   */
  async setDefaultInstitution(userId: string, institutionId: string): Promise<boolean> {
    // First, remove default flag from all user's institutions
    await UserInstitution.query()
      .where('user_id', userId)
      .update({ is_default: false })

    // Then set the specified institution as default
    const userInstitution = await UserInstitution.query()
      .where('user_id', userId)
      .where('institution_id', institutionId)
      .first()

    if (!userInstitution) {
      return false
    }

    userInstitution.is_default = true
    await userInstitution.save()
    return true
  }

  /**
   * Get all users for an institution
   */
  async getInstitutionUsers(institutionId: string): Promise<UserInstitution[]> {
    return await UserInstitution.query()
      .where('institution_id', institutionId)
      .orderBy('created_at', 'desc')
  }

  /**
   * Check if user is assigned to institution
   */
  async isUserAssignedToInstitution(userId: string, institutionId: string): Promise<boolean> {
    const userInstitution = await UserInstitution.query()
      .where('user_id', userId)
      .where('institution_id', institutionId)
      .first()

    return !!userInstitution
  }
} 