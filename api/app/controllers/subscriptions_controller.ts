import { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import SubscriptionService from '#services/subscription_service'
import { createSubscriptionValidator, updateSubscriptionValidator, subscriptionListValidator } from '#validators/subscription_validator'
import Subscription from '#models/subscription'

@inject()
export default class SubscriptionsController {
  constructor(private subscriptionService: SubscriptionService) {}

  /**
   * Display a list of subscriptions with pagination and filtering
   */
  async index({ request, response }: HttpContext) {
    try {
      const payload = await subscriptionListValidator.validate(request.qs())
      const subscriptions = await this.subscriptionService.getSubscriptions(payload)

      return response.ok({
        data: subscriptions.all().map((subscription: Subscription) => this.formatSubscriptionResponse(subscription)),
        meta: subscriptions.getMeta(),
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
   * Display a single subscription
   */
  async show({ params, response }: HttpContext) {
    try {
      const subscription = await this.subscriptionService.getSubscriptionById(params.id)
      
      if (!subscription) {
        return response.notFound({
          message: 'Subscription not found',
          status: 404,
        })
      }

      return response.ok(this.formatSubscriptionResponse(subscription))
    } catch (error) {
      throw error
    }
  }

  /**
   * Create a new subscription
   */
  async store({ request, response }: HttpContext) {
    try {
      const payload = await createSubscriptionValidator.validate(request.body())

      const subscription = await this.subscriptionService.createSubscription(payload)

      return response.created(this.formatSubscriptionResponse(subscription))
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
   * Update a subscription
   */
  async update({ params, request, response }: HttpContext) {
    try {
      const subscription = await this.subscriptionService.getSubscriptionById(params.id)
      
      if (!subscription) {
        return response.notFound({
          message: 'Subscription not found',
          status: 404,
        })
      }

      const payload = await updateSubscriptionValidator.validate(request.body())

      const updatedSubscription = await this.subscriptionService.updateSubscription(params.id, payload)

      return response.ok(this.formatSubscriptionResponse(updatedSubscription!))
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
   * Delete a subscription
   */
  async destroy({ params, response }: HttpContext) {
    try {
      const deleted = await this.subscriptionService.deleteSubscription(params.id)
      
      if (!deleted) {
        return response.notFound({
          message: 'Subscription not found',
          status: 404,
        })
      }

      return response.noContent()
    } catch (error) {
      throw error
    }
  }

  /**
   * Format subscription response
   */
  private formatSubscriptionResponse(subscription: Subscription) {
    return {
      id: subscription.id,
      title: subscription.title,
      description: subscription.description,
      price: subscription.price,
      created_at: subscription.created_at.toISO(),
      updated_at: subscription.updated_at.toISO(),
    }
  }
} 