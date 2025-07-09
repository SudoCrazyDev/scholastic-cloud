import { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import { loginValidator } from '#validators/auth_validator'
import AuthService from '#services/auth_service'

@inject()
export default class AuthController {
  constructor(
    private authService: AuthService
  ) {}

  /**
   * Login user and return JWT token
   */
  async login({ request, response }: HttpContext) {
    try {
      const payload = await loginValidator.validate(request.body())

      const loginResult = await this.authService.authenticateUser(payload)
      // console.log(loginResult.user)
      return response.ok({
        message: 'Login successful',
        data: {
          user: {
            id: loginResult.user.id,
            first_name: loginResult.user.first_name,
            middle_name: loginResult.user.middle_name,
            last_name: loginResult.user.last_name,
            ext_name: loginResult.user.ext_name,
            email: loginResult.user.email,
            gender: loginResult.user.gender,
            birthdate: loginResult.user.birthdate.toISODate(),
            is_new: loginResult.user.is_new,
            is_active: loginResult.user.is_active,
            role: loginResult.user.role ? {
              title: (loginResult.user.role as any).title,
              slug: (loginResult.user.role as any).slug,
            } : null,
            institutions: loginResult.user.userInstitutions.map(ui => {
              return {
                id: ui.institution.id,
                title: ui.institution.title,
                abbr: ui.institution.abbr,
                logo: ui.institution.logo,
              }
            }),
          },
          token: loginResult.token,
          token_type: loginResult.token_type,
          expires_in: loginResult.expires_in,
        },
      })
    } catch (error) {
      if (error.messages) {
        return response.badRequest({
          message: 'Validation failed',
          errors: error.messages,
          status: 400,
        })
      }

      if (error.message === 'Invalid credentials') {
        return response.unauthorized({
          message: 'Invalid credentials',
          status: 401,
        })
      }

      if (error.message === 'Account is deactivated') {
        return response.forbidden({
          message: 'Account is deactivated',
          status: 403,
        })
      }

      throw error
    }
  }

  /**
   * Logout user (invalidate token)
   */
  async logout({ auth, response }: HttpContext) {
    try {
      const user = auth.user
      
      if (user) {
        await this.authService.logoutUser(user.id)
      }

      return response.ok({
        message: 'Logout successful',
      })
    } catch (error) {
      throw error
    }
  }

  /**
   * Get current user profile
   */
  async profile({ auth, response }: HttpContext) {
    try {
      const user = auth.user
      
      if (!user) {
        return response.unauthorized({
          message: 'User not authenticated',
          status: 401,
        })
      }

      const userProfile = await this.authService.getUserProfile(user.id)

      // Load role data if needed
      if (user.role_id) {
        // For now, we'll return the profile without role data
        // Role data can be loaded separately if needed
      }

      return response.ok({
        data: userProfile,
      })
    } catch (error) {
      if (error.message === 'User not found') {
        return response.notFound({
          message: 'User not found',
          status: 404,
        })
      }

      throw error
    }
  }
} 