import vine from '@vinejs/vine'

export const createSubscriptionValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(2).maxLength(255),
    description: vine.string().trim().maxLength(1000).optional(),
    price: vine.number().positive(),
  })
)

export const updateSubscriptionValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(2).maxLength(255).optional(),
    description: vine.string().trim().maxLength(1000).optional(),
    price: vine.number().positive().optional(),
  })
)

export const subscriptionListValidator = vine.compile(
  vine.object({
    page: vine.number().positive().optional(),
    limit: vine.number().positive().max(100).optional(),
    search: vine.string().trim().optional(),
    min_price: vine.number().positive().optional(),
    max_price: vine.number().positive().optional(),
  })
) 