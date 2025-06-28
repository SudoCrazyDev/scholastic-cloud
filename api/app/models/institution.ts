import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Institution extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare title: string

  @column()
  declare abbr: string

  @column()
  declare address: string | null

  @column()
  declare division: string | null

  @column()
  declare region: string | null

  @column()
  declare gov_id: string | null

  @column()
  declare logo: string | null

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime
} 