import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.string('first_name').notNullable()
      table.string('middle_name').nullable()
      table.string('last_name').nullable()
      table.string('ext_name').nullable()
      table.enum('gender', ['male', 'female', 'other']).notNullable().defaultTo('male')
      table.date('birthdate').notNullable()
      table.string('email', 254).notNullable().unique()
      table.timestamp('email_verified_at').nullable()
      table.string('password').notNullable()
      table.string('token').nullable()
      table.boolean('is_new').defaultTo(true).notNullable()
      table.boolean('is_active').defaultTo(true).notNullable()

      table.uuid('role_id').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}