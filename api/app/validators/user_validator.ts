import vine from '@vinejs/vine'

export const createUserValidator = vine.compile(
  vine.object({
    first_name: vine.string().trim().minLength(2).maxLength(50),
    middle_name: vine.string().trim().maxLength(50).optional(),
    last_name: vine.string().trim().minLength(2).maxLength(50),
    ext_name: vine.string().trim().maxLength(10).optional(),
    gender: vine.enum(['male', 'female', 'other']),
    birthdate: vine.date().before('today'),
    email: vine.string().email().trim(),
    password: vine.string().minLength(8).maxLength(255),
  })
)

export const updateUserValidator = vine.compile(
  vine.object({
    first_name: vine.string().trim().minLength(2).maxLength(50).optional(),
    middle_name: vine.string().trim().maxLength(50).optional(),
    last_name: vine.string().trim().minLength(2).maxLength(50).optional(),
    ext_name: vine.string().trim().maxLength(10).optional(),
    gender: vine.enum(['male', 'female', 'other']).optional(),
    birthdate: vine.date().before('today').optional(),
    email: vine.string().email().trim().optional(),
    is_new: vine.boolean().optional(),
    is_active: vine.boolean().optional(),
    password: vine.string().minLength(8).maxLength(255).optional(),
  })
)

export const userListValidator = vine.compile(
  vine.object({
    page: vine.number().positive().optional(),
    limit: vine.number().positive().max(100).optional(),
    search: vine.string().trim().optional(),
    gender: vine.enum(['male', 'female', 'other']).optional(),
    is_active: vine.boolean().optional(),
  })
) 