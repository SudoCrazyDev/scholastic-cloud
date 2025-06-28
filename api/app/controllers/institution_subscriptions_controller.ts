import { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import InstitutionSubscriptionService from '#services/institution_subscription_service'
import { DateTime } from 'luxon'
import vine from '@vinejs/vine'

const assignSubscriptionValidator = vine.compile(
  vine.object({
    subscription_id: vine.string().uuid(),
    expiration_date: vine.date(),
    discount: vine.number().min(0).max(100).optional(),
  })
)

const updateSubscriptionValidator = vine.compile(
  vine.object({
    subscription_id: vine.string().uuid().optional(),
    expiration_date: vine.date().optional(),
    discount: vine.number().min(0).max(100).optional(),
  })
)

@inject()
export default class InstitutionSubscriptionsController {
  constructor(private institutionSubscriptionService: InstitutionSubscriptionService) {}

  /**
   * Get institution's subscription
   */
  async show({ params, response }: HttpContext) {
    try {
      const institutionSubscription = await this.institutionSubscriptionService.getInstitutionSubscription(params.institutionId)
      
      if (!institutionSubscription) {
        return response.notFound({
          message: 'Institution subscription not found',
          status: 404,
        })
      }

      return response.ok(this.formatInstitutionSubscriptionResponse(institutionSubscription))
    } catch (error) {
      throw error
    }
  }

  /**
   * Assign subscription to institution
   */
  async store({ params, request, response }: HttpContext) {
    try {
      const payload = await assignSubscriptionValidator.validate(request.body())

      const institutionSubscription = await this.institutionSubscriptionService.assignSubscription({
        institution_id: params.institutionId,
        subscription_id: payload.subscription_id,
        expiration_date: DateTime.fromJSDate(payload.expiration_date),
        discount: payload.discount,
      })

      return response.created(this.formatInstitutionSubscriptionResponse(institutionSubscription))
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
   * Update institution subscription
   */
  async update({ params, request, response }: HttpContext) {
    try {
      const payload = await updateSubscriptionValidator.validate(request.body())

      const updateData: any = {}
      if (payload.expiration_date) {
        updateData.expiration_date = DateTime.fromJSDate(payload.expiration_date)
      }
      if (payload.subscription_id) {
        updateData.subscription_id = payload.subscription_id
      }
      if (payload.discount !== undefined) {
        updateData.discount = payload.discount
      }

      const institutionSubscription = await this.institutionSubscriptionService.updateInstitutionSubscription(
        params.institutionId,
        updateData
      )

      if (!institutionSubscription) {
        return response.notFound({
          message: 'Institution subscription not found',
          status: 404,
        })
      }

      return response.ok(this.formatInstitutionSubscriptionResponse(institutionSubscription))
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
   * Remove subscription from institution
   */
  async destroy({ params, response }: HttpContext) {
    try {
      const deleted = await this.institutionSubscriptionService.removeInstitutionSubscription(params.institutionId)
      
      if (!deleted) {
        return response.notFound({
          message: 'Institution subscription not found',
          status: 404,
        })
      }

      return response.noContent()
    } catch (error) {
      throw error
    }
  }

  /**
   * Check if institution subscription is expired
   */
  async checkExpiration({ params, response }: HttpContext) {
    try {
      const isExpired = await this.institutionSubscriptionService.isSubscriptionExpired(params.institutionId)
      
      return response.ok({
        institution_id: params.institutionId,
        is_expired: isExpired,
      })
    } catch (error) {
      throw error
    }
  }

  /**
   * Format institution subscription response
   */
  private formatInstitutionSubscriptionResponse(institutionSubscription: any) {
    return {
      id: institutionSubscription.id,
      institution_id: institutionSubscription.institution_id,
      subscription_id: institutionSubscription.subscription_id,
      expiration_date: institutionSubscription.expiration_date.toISODate(),
      discount: institutionSubscription.discount,
      created_at: institutionSubscription.created_at.toISO(),
      updated_at: institutionSubscription.updated_at.toISO(),
    }
  }
} 