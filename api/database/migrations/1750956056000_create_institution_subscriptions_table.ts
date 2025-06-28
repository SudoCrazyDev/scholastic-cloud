import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'institution_subscriptions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary().defaultTo(this.raw('gen_random_uuid()'))
      table.uuid('institution_id').references('id').inTable('institutions').onDelete('CASCADE').notNullable()
      table.uuid('subscription_id').references('id').inTable('subscriptions').onDelete('CASCADE').notNullable()
      table.date('expiration_date').notNullable()
      table.decimal('discount', 5, 2).defaultTo(0).notNullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      // Ensure one subscription per institution
      table.unique(['institution_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
} 