import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
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

  @belongsTo(() => User, {
    foreignKey: 'user_id',
  })
  declare user: BelongsTo<typeof User>

  @belongsTo(() => Institution, {
    foreignKey: 'institution_id',
  })
  declare institution: BelongsTo<typeof Institution>
} 