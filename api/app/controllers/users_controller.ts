import { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import User from '#models/user'
import { createUserValidator, updateUserValidator, userListValidator } from '#validators/user_validator'
import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'
import UserService from '#services/user_service'

@inject()
export default class UsersController {
  constructor(private userService: UserService) {}

  /**
   * Display a list of users with pagination and filtering
   */
  async index({ request, response }: HttpContext) {
    try {
      const payload = await userListValidator.validate(request.qs())
      const users = await this.userService.getUsers(payload)

      return response.ok({
        data: users.all().map((user: User) => this.formatUserResponse(user)),
        meta: users.getMeta(),
      })
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
   * Display a single user
   */
  async show({ params, response }: HttpContext) {
    try {
      const user = await this.userService.getUserById(params.id)
      
      if (!user) {
        return response.notFound({
          message: 'User not found',
          status: 404,
        })
      }

      return response.ok(this.formatUserResponse(user))
    } catch (error) {
      throw error
    }
  }

  /**
   * Create a new user
   */
  async store({ request, response }: HttpContext) {
    try {
      const payload = await createUserValidator.validate(request.body())

      // Check if email already exists
      const emailExists = await this.userService.emailExists(payload.email)
      if (emailExists) {
        return response.conflict({
          message: 'Email already exists',
          status: 409,
        })
      }

      const userData = {
        ...payload,
        password: 'password',
        birthdate: DateTime.fromJSDate(payload.birthdate),
        is_new: true,
        is_active: true,
      }

      const user = await this.userService.createUserWithInstitution(userData)

      return response.created(this.formatUserResponse(user))
    } catch (error) {
      if (error.messages) {
        return response.badRequest({
          message: 'Validation failed',
          errors: error.messages,
          status: 400,
        })
      }
      
      // Handle specific validation errors
      if (error.message === 'Role not found') {
        return response.badRequest({
          message: 'Role not found',
          status: 400,
        })
      }
      
      if (error.message.includes('Institution with ID')) {
        return response.badRequest({
          message: error.message,
          status: 400,
        })
      }
      
      throw error
    }
  }

  /**
   * Update a user
   */
  async update({ params, request, response }: HttpContext) {
    try {
      const user = await this.userService.getUserById(params.id)
      
      if (!user) {
        return response.notFound({
          message: 'User not found',
          status: 404,
        })
      }

      const payload = await updateUserValidator.validate(request.body())

      // Check if email already exists (if email is being updated)
      if (payload.email && payload.email !== user.email) {
        const emailExists = await this.userService.emailExists(payload.email, params.id)
        if (emailExists) {
          return response.conflict({
            message: 'Email already exists',
            status: 409,
          })
        }
      }

      const updateData: any = { ...payload }
      if (payload.birthdate) {
        updateData.birthdate = DateTime.fromJSDate(payload.birthdate)
      }
      // Hash the password if present
      if (payload.password) {
        updateData.password = await hash.make(payload.password)
      }

      const updatedUser = await this.userService.updateUser(params.id, updateData)

      return response.ok(this.formatUserResponse(updatedUser!))
    } catch (error) {
      if (error.messages) {
        return response.badRequest({
          message: 'Validation failed',
          errors: error.messages,
          status: 400,
        })
      }
      
      // Handle specific validation errors
      if (error.message === 'Role not found') {
        return response.badRequest({
          message: 'Role not found',
          status: 400,
        })
      }
      
      if (error.message.includes('Institution with ID')) {
        return response.badRequest({
          message: error.message,
          status: 400,
        })
      }
      
      throw error
    }
  }

  /**
   * Delete a user
   */
  async destroy({ params, response }: HttpContext) {
    try {
      const deleted = await this.userService.deleteUser(params.id)
      
      if (!deleted) {
        return response.notFound({
          message: 'User not found',
          status: 404,
        })
      }

      return response.noContent()
    } catch (error) {
      throw error
    }
  }

  /**
   * Format user response to exclude sensitive data
   */
  private formatUserResponse(user: User) {
    return {
      id: user.id,
      first_name: user.first_name,
      middle_name: user.middle_name,
      last_name: user.last_name,
      ext_name: user.ext_name,
      gender: user.gender,
      birthdate: user.birthdate.toISODate(),
      email: user.email,
      email_verified_at: user.email_verified_at?.toISO(),
      is_new: user.is_new,
      is_active: user.is_active,
      role: user.role ? {
        id: (user.role as any).id,
        title: (user.role as any).title,
        slug: (user.role as any).slug,
      } : null,
      institutions: user.userInstitutions ? user.userInstitutions.map((userInstitution: any) => {
        // Load institution data if not already loaded
        const institution = userInstitution.institution
        if (!institution) {
          return null
        }
        return {
          id: institution.id,
          name: institution.title,
          code: institution.abbr,
          type: institution.division,
          is_default: userInstitution.is_default,
        }
      }).filter(Boolean) : [],
      created_at: user.created_at.toISO(),
      updated_at: user.updated_at.toISO(),
    }
  }
} 