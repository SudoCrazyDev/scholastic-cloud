import vine from '@vinejs/vine'

export const createInstitutionValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(2).maxLength(255),
    abbr: vine.string().trim().minLength(2).maxLength(50),
    address: vine.string().trim().maxLength(500).optional(),
    division: vine.string().trim().maxLength(100).optional(),
    region: vine.string().trim().maxLength(100).optional(),
    gov_id: vine.string().trim().maxLength(100).optional(),
    logo: vine.string().trim().maxLength(255).optional(),
  })
)

export const updateInstitutionValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(2).maxLength(255).optional(),
    abbr: vine.string().trim().minLength(2).maxLength(50).optional(),
    address: vine.string().trim().maxLength(500).optional(),
    division: vine.string().trim().maxLength(100).optional(),
    region: vine.string().trim().maxLength(100).optional(),
    gov_id: vine.string().trim().maxLength(100).optional(),
    logo: vine.string().trim().maxLength(255).optional(),
  })
)

export const institutionListValidator = vine.compile(
  vine.object({
    page: vine.number().positive().optional(),
    limit: vine.number().positive().max(100).optional(),
    search: vine.string().trim().optional(),
    region: vine.string().trim().optional(),
    division: vine.string().trim().optional(),
  })
) 