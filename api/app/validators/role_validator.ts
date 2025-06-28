import vine from '@vinejs/vine'

export const createRoleValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(2).maxLength(100),
    slug: vine.string().trim().minLength(2).maxLength(100).regex(/^[a-z0-9-]+$/),
  })
)

export const updateRoleValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(2).maxLength(100).optional(),
    slug: vine.string().trim().minLength(2).maxLength(100).regex(/^[a-z0-9-]+$/).optional(),
  })
)

export const roleListValidator = vine.compile(
  vine.object({
    page: vine.number().positive().optional(),
    limit: vine.number().positive().max(100).optional(),
    search: vine.string().trim().optional(),
  })
) 