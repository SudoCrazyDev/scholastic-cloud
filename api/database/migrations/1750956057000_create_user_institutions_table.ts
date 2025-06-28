import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'user_institutions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE').notNullable()
      table.uuid('institution_id').references('id').inTable('institutions').onDelete('CASCADE').notNullable()
      table.boolean('is_default').defaultTo(false).notNullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      // Ensure unique user-institution combinations
      table.unique(['user_id', 'institution_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
} 