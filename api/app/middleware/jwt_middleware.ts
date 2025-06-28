import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import JwtService from '#services/jwt_service'
import UserService from '#services/user_service'

export default class JwtMiddleware {
  /**
   * Handle JWT authentication
   */
  async handle(ctx: HttpContext, next: NextFn) {
    try {
      // Get token from Authorization header
      const authHeader = ctx.request.header('authorization')
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return ctx.response.unauthorized({
          message: 'Authorization header missing or invalid',
          status: 401,
        })
      }

      const token = authHeader.substring(7) // Remove 'Bearer ' prefix
      
      // Verify token
      const jwtService = new JwtService()
      const payload = jwtService.verifyToken(token)
      
      if (!payload) {
        return ctx.response.unauthorized({
          message: 'Invalid or expired token',
          status: 401,
        })
      }

      // Check if token is expired
      if (jwtService.isTokenExpired(token)) {
        return ctx.response.unauthorized({
          message: 'Token has expired',
          status: 401,
        })
      }

      // Get user from database
      const userService = new UserService()
      const user = await userService.getUserById(payload.user_id)
      
      if (!user) {
        return ctx.response.unauthorized({
          message: 'User not found',
          status: 401,
        })
      }

      // Check if user is active
      if (!user.is_active) {
        return ctx.response.forbidden({
          message: 'Account is deactivated',
          status: 403,
        })
      }

      // Verify token matches user's stored token (optional security check)
      if (user.token !== token) {
        return ctx.response.unauthorized({
          message: 'Token mismatch',
          status: 401,
        })
      }

      // Set user in context
      // @ts-ignore
      ctx.user = user
      
      return next()
    } catch (error) {
      return ctx.response.unauthorized({
        message: 'Authentication failed',
        status: 401,
      })
    }
  }
} 