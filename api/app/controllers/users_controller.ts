import { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import User from '#models/user'
import { createUserValidator, updateUserValidator, userListValidator } from '#validators/user_validator'
import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'

@inject()
export default class UsersController {
  /**
   * Display a list of users with pagination and filtering
   */
  async index({ request, response }: HttpContext) {
    try {
      const payload = await userListValidator.validate(request.qs())
      const page = payload.page || 1
      const limit = payload.limit || 20

      const query = User.query()

      // Apply filters
      if (payload.search) {
        query.where((builder) => {
          builder
            .whereILike('first_name', `%${payload.search}%`)
            .orWhereILike('last_name', `%${payload.search}%`)
            .orWhereILike('email', `%${payload.search}%`)
        })
      }

      if (payload.gender) {
        query.where('gender', payload.gender)
      }

      if (payload.is_active !== undefined) {
        query.where('is_active', payload.is_active)
      }

      const users = await query
        .orderBy('created_at', 'desc')
        .paginate(page, limit)

      return response.ok({
        data: users.all().map((user) => this.formatUserResponse(user)),
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
      const user = await User.findOrFail(params.id)
      return response.ok(this.formatUserResponse(user))
    } catch (error) {
      return response.notFound({
        message: 'User not found',
        status: 404,
      })
    }
  }

  /**
   * Create a new user
   */
  async store({ request, response }: HttpContext) {
    try {
      const payload = await createUserValidator.validate(request.body())

      // Check if email already exists
      const existingUser = await User.findBy('email', payload.email)
      if (existingUser) {
        return response.conflict({
          message: 'Email already exists',
          status: 409,
        })
      }

      // Hash the password before saving
      const hashedPassword = await hash.make(payload.password)

      const user = await User.create({
        ...payload,
        password: hashedPassword,
        birthdate: DateTime.fromJSDate(payload.birthdate),
        is_new: true,
        is_active: true,
      })

      return response.created(this.formatUserResponse(user))
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
   * Update a user
   */
  async update({ params, request, response }: HttpContext) {
    try {
      const user = await User.findOrFail(params.id)
      const payload = await updateUserValidator.validate(request.body())

      // Check if email already exists (if email is being updated)
      if (payload.email && payload.email !== user.email) {
        const existingUser = await User.findBy('email', payload.email)
        if (existingUser) {
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

      user.merge(updateData)
      await user.save()

      return response.ok(this.formatUserResponse(user))
    } catch (error) {
      if (error.messages) {
        return response.badRequest({
          message: 'Validation failed',
          errors: error.messages,
          status: 400,
        })
      }
      return response.notFound({
        message: 'User not found',
        status: 404,
      })
    }
  }

  /**
   * Delete a user
   */
  async destroy({ params, response }: HttpContext) {
    try {
      const user = await User.findOrFail(params.id)
      await user.delete()

      return response.noContent()
    } catch (error) {
      return response.notFound({
        message: 'User not found',
        status: 404,
      })
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
      created_at: user.created_at.toISO(),
      updated_at: user.updated_at.toISO(),
    }
  }
} 