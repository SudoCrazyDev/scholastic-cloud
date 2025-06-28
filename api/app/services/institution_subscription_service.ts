import InstitutionSubscription from '#models/institution_subscription'
import Institution from '#models/institution'
import Subscription from '#models/subscription'
import { DateTime } from 'luxon'

export interface AssignSubscriptionData {
  institution_id: string
  subscription_id: string
  expiration_date: DateTime
  discount?: number
}

export interface UpdateInstitutionSubscriptionData {
  subscription_id?: string
  expiration_date?: DateTime
  discount?: number
}

export default class InstitutionSubscriptionService {
  /**
   * Get institution subscription by institution ID
   */
  async getInstitutionSubscription(institutionId: string): Promise<InstitutionSubscription | null> {
    return await InstitutionSubscription.query()
      .where('institution_id', institutionId)
      .first()
  }

  /**
   * Assign a subscription to an institution
   */
  async assignSubscription(data: AssignSubscriptionData): Promise<InstitutionSubscription> {
    // Check if institution already has a subscription
    const existingSubscription = await this.getInstitutionSubscription(data.institution_id)
    
    if (existingSubscription) {
      // Update existing subscription
      existingSubscription.merge({
        subscription_id: data.subscription_id,
        expiration_date: data.expiration_date,
        discount: data.discount || 0,
      })
      await existingSubscription.save()
      return existingSubscription
    } else {
      // Create new subscription assignment
      return await InstitutionSubscription.create({
        institution_id: data.institution_id,
        subscription_id: data.subscription_id,
        expiration_date: data.expiration_date,
        discount: data.discount || 0,
      })
    }
  }

  /**
   * Update institution subscription
   */
  async updateInstitutionSubscription(
    institutionId: string, 
    data: UpdateInstitutionSubscriptionData
  ): Promise<InstitutionSubscription | null> {
    const institutionSubscription = await this.getInstitutionSubscription(institutionId)
    
    if (!institutionSubscription) {
      return null
    }

    institutionSubscription.merge(data)
    await institutionSubscription.save()
    return institutionSubscription
  }

  /**
   * Remove subscription from institution
   */
  async removeInstitutionSubscription(institutionId: string): Promise<boolean> {
    const institutionSubscription = await this.getInstitutionSubscription(institutionId)
    
    if (!institutionSubscription) {
      return false
    }

    await institutionSubscription.delete()
    return true
  }

  /**
   * Check if institution subscription is expired
   */
  async isSubscriptionExpired(institutionId: string): Promise<boolean> {
    const institutionSubscription = await this.getInstitutionSubscription(institutionId)
    
    if (!institutionSubscription) {
      return true // No subscription means expired
    }

    return institutionSubscription.expiration_date < DateTime.now()
  }

  /**
   * Get all expired subscriptions
   */
  async getExpiredSubscriptions(): Promise<InstitutionSubscription[]> {
    return await InstitutionSubscription.query()
      .where('expiration_date', '<', DateTime.now().toSQL())
  }

  /**
   * Get all active subscriptions
   */
  async getActiveSubscriptions(): Promise<InstitutionSubscription[]> {
    return await InstitutionSubscription.query()
      .where('expiration_date', '>=', DateTime.now().toSQL())
  }
} 