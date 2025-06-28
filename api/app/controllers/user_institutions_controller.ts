import { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import UserInstitutionService from '#services/user_institution_service'
import vine from '@vinejs/vine'

const assignUserValidator = vine.compile(
  vine.object({
    user_id: vine.string().uuid(),
    is_default: vine.boolean().optional(),
  })
)

const updateUserInstitutionValidator = vine.compile(
  vine.object({
    is_default: vine.boolean().optional(),
  })
)

@inject()
export default class UserInstitutionsController {
  constructor(private userInstitutionService: UserInstitutionService) {}

  /**
   * Get all institutions for a user
   */
  async getUserInstitutions({ params, response }: HttpContext) {
    try {
      const userInstitutions = await this.userInstitutionService.getUserInstitutions(params.userId)
      
      return response.ok({
        data: userInstitutions.map((userInstitution) => this.formatUserInstitutionResponse(userInstitution)),
      })
    } catch (error) {
      throw error
    }
  }

  /**
   * Get user's default institution
   */
  async getUserDefaultInstitution({ params, response }: HttpContext) {
    try {
      const userInstitution = await this.userInstitutionService.getUserDefaultInstitution(params.userId)
      
      if (!userInstitution) {
        return response.notFound({
          message: 'User has no default institution',
          status: 404,
        })
      }

      return response.ok(this.formatUserInstitutionResponse(userInstitution))
    } catch (error) {
      throw error
    }
  }

  /**
   * Assign user to institution
   */
  async assignUserToInstitution({ params, request, response }: HttpContext) {
    try {
      const payload = await assignUserValidator.validate(request.body())

      const userInstitution = await this.userInstitutionService.assignUserToInstitution({
        user_id: payload.user_id,
        institution_id: params.institutionId,
        is_default: payload.is_default,
      })

      return response.created(this.formatUserInstitutionResponse(userInstitution))
    } catch (error) {
      if (error.messages) {
        return response.badRequest({
          message: 'Validation failed',
          errors: error.messages,
          status: 400,
        })
      }
      throw error
    }
  }

  /**
   * Update user institution assignment
   */
  async updateUserInstitution({ params, request, response }: HttpContext) {
    try {
      const payload = await updateUserInstitutionValidator.validate(request.body())

      const userInstitution = await this.userInstitutionService.updateUserInstitution(
        params.userId,
        params.institutionId,
        payload
      )

      if (!userInstitution) {
        return response.notFound({
          message: 'User institution assignment not found',
          status: 404,
        })
      }

      return response.ok(this.formatUserInstitutionResponse(userInstitution))
    } catch (error) {
      if (error.messages) {
        return response.badRequest({
          message: 'Validation failed',
          errors: error.messages,
          status: 400,
        })
      }
      throw error
    }
  }

  /**
   * Remove user from institution
   */
  async removeUserFromInstitution({ params, response }: HttpContext) {
    try {
      const deleted = await this.userInstitutionService.removeUserFromInstitution(params.userId, params.institutionId)
      
      if (!deleted) {
        return response.notFound({
          message: 'User institution assignment not found',
          status: 404,
        })
      }

      return response.noContent()
    } catch (error) {
      throw error
    }
  }

  /**
   * Set user's default institution
   */
  async setDefaultInstitution({ params, response }: HttpContext) {
    try {
      const success = await this.userInstitutionService.setDefaultInstitution(params.userId, params.institutionId)
      
      if (!success) {
        return response.notFound({
          message: 'User institution assignment not found',
          status: 404,
        })
      }

      return response.ok({
        message: 'Default institution set successfully',
        user_id: params.userId,
        institution_id: params.institutionId,
      })
    } catch (error) {
      throw error
    }
  }

  /**
   * Get all users for an institution
   */
  async getInstitutionUsers({ params, response }: HttpContext) {
    try {
      const userInstitutions = await this.userInstitutionService.getInstitutionUsers(params.institutionId)
      
      return response.ok({
        data: userInstitutions.map((userInstitution) => this.formatUserInstitutionResponse(userInstitution)),
      })
    } catch (error) {
      throw error
    }
  }

  /**
   * Check if user is assigned to institution
   */
  async checkUserAssignment({ params, response }: HttpContext) {
    try {
      const isAssigned = await this.userInstitutionService.isUserAssignedToInstitution(params.userId, params.institutionId)
      
      return response.ok({
        user_id: params.userId,
        institution_id: params.institutionId,
        is_assigned: isAssigned,
      })
    } catch (error) {
      throw error
    }
  }

  /**
   * Format user institution response
   */
  private formatUserInstitutionResponse(userInstitution: any) {
    return {
      id: userInstitution.id,
      user_id: userInstitution.user_id,
      institution_id: userInstitution.institution_id,
      is_default: userInstitution.is_default,
      created_at: userInstitution.created_at.toISO(),
      updated_at: userInstitution.updated_at.toISO(),
    }
  }
} 