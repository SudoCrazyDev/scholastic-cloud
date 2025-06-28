import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import User from '#models/user'
import Institution from '#models/institution'

export default class UserInstitution extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare user_id: string

  @column()
  declare institution_id: string

  @column()
  declare is_default: boolean

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime

  @belongsTo(() => User)
  declare user: ReturnType<typeof belongsTo>

  @belongsTo(() => Institution)
  declare institution: ReturnType<typeof belongsTo>
} 