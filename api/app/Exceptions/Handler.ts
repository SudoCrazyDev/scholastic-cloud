import app from '@adonisjs/core/services/app'
import { HttpContext, ExceptionHandler } from '@adonisjs/core/http'

export default class HttpExceptionHandler extends ExceptionHandler {
  /**
   * In debug mode, we map all SQLite errors to a generic database error and
   * all errors to a generic error
   */
  protected debug = !app.inProduction

  /**
   * The method is used for handling errors and returning
   * response to the client
   */
  async handle(error: any, ctx: HttpContext) {
    // Handle validation errors
    if (error.messages && error.status === 400) {
      return ctx.response.badRequest({
        message: 'Validation failed',
        errors: error.messages,
        status: 400,
      })
    }

    // Handle not found errors
    if (error.status === 404) {
      return ctx.response.notFound({
        message: 'Resource not found',
        status: 404,
      })
    }

    // Handle conflict errors
    if (error.status === 409) {
      return ctx.response.conflict({
        message: 'Resource already exists',
        status: 409,
      })
    }

    // Handle unauthorized errors
    if (error.status === 401) {
      return ctx.response.unauthorized({
        message: 'Unauthorized access',
        status: 401,
      })
    }

    // Handle forbidden errors
    if (error.status === 403) {
      return ctx.response.forbidden({
        message: 'Forbidden access',
        status: 403,
      })
    }

    // Handle bad request errors
    if (error.status === 400) {
      return ctx.response.badRequest({
        message: error.message || 'Bad request',
        status: 400,
      })
    }

    // Handle internal server errors
    if (error.status === 500 || !error.status) {
      return ctx.response.internalServerError({
        message: this.debug ? error.message : 'Internal server error',
        status: 500,
      })
    }

    return super.handle(error, ctx)
  }

  /**
   * The method is used to report error to the logging service or
   * the a third party error monitoring service.
   *
   * @note You should not await the inside of this method. The notification
   * services should not block the execution
   */
  async report(error: any, ctx: HttpContext) {
    if (!this.debug) {
      return
    }

    return super.report(error, ctx)
  }
}
