import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import Institution from '#models/institution'
import Subscription from '#models/subscription'

export default class InstitutionSubscription extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare institution_id: string

  @column()
  declare subscription_id: string

  @column.date()
  declare expiration_date: DateTime

  @column()
  declare discount: number

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime

  @belongsTo(() => Institution)
  declare institution: ReturnType<typeof belongsTo>

  @belongsTo(() => Subscription)
  declare subscription: ReturnType<typeof belongsTo>
} 