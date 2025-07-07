import Subscription from '#models/subscription'
import InstitutionSubscription from '#models/institution_subscription'

export interface CreateSubscriptionData {
  title: string
  description?: string
  price: number
}

export interface UpdateSubscriptionData {
  title?: string
  description?: string
  price?: number
}

export interface SubscriptionListFilters {
  page?: number
  limit?: number
  search?: string
  min_price?: number
  max_price?: number
}

export default class SubscriptionService {
  /**
   * Get paginated list of subscriptions with optional search
   */
  async getSubscriptions(filters: SubscriptionListFilters): Promise<any> {
    const page = filters.page || 1
    const limit = filters.limit || 20

    const query = Subscription.query()

    // Apply search filter
    if (filters.search) {
      query.where((builder) => {
        builder
          .whereILike('title', `%${filters.search}%`)
          .orWhereILike('description', `%${filters.search}%`)
      })
    }

    if (filters.min_price !== undefined) {
      query.where('price', '>=', filters.min_price)
    }

    if (filters.max_price !== undefined) {
      query.where('price', '<=', filters.max_price)
    }

    return await query.orderBy('created_at', 'desc').paginate(page, limit)
  }

  /**
   * Get a single subscription by ID
   */
  async getSubscriptionById(id: string): Promise<Subscription | null> {
    return await Subscription.find(id)
  }

  /**
   * Create a new subscription
   */
  async createSubscription(data: CreateSubscriptionData): Promise<Subscription> {
    return await Subscription.create(data)
  }

  /**
   * Update an existing subscription
   */
  async updateSubscription(id: string, data: UpdateSubscriptionData): Promise<Subscription | null> {
    const subscription = await Subscription.find(id)
    if (!subscription) {
      return null
    }

    subscription.merge(data)
    await subscription.save()
    return subscription
  }

  /**
   * Delete a subscription
   */
  async deleteSubscription(id: string): Promise<boolean> {
    const subscription = await Subscription.find(id)
    if (!subscription) {
      return false
    }

    // Check if any institutions are using this subscription
    const institutionSubscriptions = await InstitutionSubscription.query()
      .where('subscription_id', id)
      .first()

    if (institutionSubscriptions) {
      throw new Error('Cannot delete subscription: It is currently assigned to one or more institutions')
    }

    await subscription.delete()
    return true
  }
} 