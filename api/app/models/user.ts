import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column, belongsTo, hasMany, hasManyThrough } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import Role from '#models/role'
import UserInstitution from '#models/user_institution'
import Institution from '#models/institution'

const AuthFinder = withAuthFinder(() => hash.use('scrypt'), {
  uids: ['email'],
  passwordColumnName: 'password',
})

export default class User extends compose(BaseModel, AuthFinder) {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare first_name: string

  @column()
  declare middle_name: string | null

  @column()
  declare last_name: string

  @column()
  declare ext_name: string | null

  @column()
  declare gender: 'male' | 'female' | 'other'

  @column.date()
  declare birthdate: DateTime

  @column()
  declare email: string

  @column.dateTime()
  declare email_verified_at: DateTime | null

  @column({ serializeAs: null })
  declare password: string

  @column()
  declare token: string | null

  @column()
  declare is_new: boolean

  @column()
  declare is_active: boolean

  @column()
  declare role_id: string | null

  @belongsTo(() => Role, {
    foreignKey: 'role_id',
  })
  declare role: BelongsTo<typeof Role>

  @hasMany(() => UserInstitution, {
    foreignKey: 'user_id',
  })
  declare userInstitutions: HasMany<typeof UserInstitution>

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime
}