import { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import InstitutionService from '#services/institution_service'
import { createInstitutionValidator, updateInstitutionValidator, institutionListValidator } from '#validators/institution_validator'
import Institution from '#models/institution'

@inject()
export default class InstitutionsController {
  constructor(private institutionService: InstitutionService) {}

  /**
   * Display a list of institutions with pagination and filtering
   */
  async index({ request, response }: HttpContext) {
    try {
      const payload = await institutionListValidator.validate(request.qs())
      const institutions = await this.institutionService.getInstitutions(payload)

      return response.ok({
        data: institutions.all().map((institution: Institution) => this.formatInstitutionResponse(institution)),
        meta: institutions.getMeta(),
      })
    } catch (error) {
      if (error.messages) {
        return response.badRequest({
          message: 'Validation failed',
          errors: error.messages,
          status: 400,
        })
      }
      throw error
    }
  }

  /**
   * Display a single institution
   */
  async show({ params, response }: HttpContext) {
    try {
      const institution = await this.institutionService.getInstitutionById(params.id)
      
      if (!institution) {
        return response.notFound({
          message: 'Institution not found',
          status: 404,
        })
      }

      return response.ok(this.formatInstitutionResponse(institution))
    } catch (error) {
      throw error
    }
  }

  /**
   * Create a new institution
   */
  async store({ request, response }: HttpContext) {
    try {
      const payload = await createInstitutionValidator.validate(request.body())

      // Check if abbreviation already exists
      const abbrExists = await this.institutionService.abbrExists(payload.abbr)
      if (abbrExists) {
        return response.conflict({
          message: 'Abbreviation already exists',
          status: 409,
        })
      }

      const institution = await this.institutionService.createInstitution(payload)

      return response.created(this.formatInstitutionResponse(institution))
    } catch (error) {
      if (error.messages) {
        return response.badRequest({
          message: 'Validation failed',
          errors: error.messages,
          status: 400,
        })
      }
      throw error
    }
  }

  /**
   * Update an institution
   */
  async update({ params, request, response }: HttpContext) {
    try {
      const institution = await this.institutionService.getInstitutionById(params.id)
      
      if (!institution) {
        return response.notFound({
          message: 'Institution not found',
          status: 404,
        })
      }

      const payload = await updateInstitutionValidator.validate(request.body())

      // Check if abbreviation already exists (if abbreviation is being updated)
      if (payload.abbr && payload.abbr !== institution.abbr) {
        const abbrExists = await this.institutionService.abbrExists(payload.abbr, params.id)
        if (abbrExists) {
          return response.conflict({
            message: 'Abbreviation already exists',
            status: 409,
          })
        }
      }

      const updatedInstitution = await this.institutionService.updateInstitution(params.id, payload)

      return response.ok(this.formatInstitutionResponse(updatedInstitution!))
    } catch (error) {
      if (error.messages) {
        return response.badRequest({
          message: 'Validation failed',
          errors: error.messages,
          status: 400,
        })
      }
      throw error
    }
  }

  /**
   * Delete an institution
   */
  async destroy({ params, response }: HttpContext) {
    try {
      const deleted = await this.institutionService.deleteInstitution(params.id)
      
      if (!deleted) {
        return response.notFound({
          message: 'Institution not found',
          status: 404,
        })
      }

      return response.noContent()
    } catch (error) {
      throw error
    }
  }

  /**
   * Format institution response
   */
  private formatInstitutionResponse(institution: Institution) {
    return {
      id: institution.id,
      title: institution.title,
      abbr: institution.abbr,
      address: institution.address,
      division: institution.division,
      region: institution.region,
      gov_id: institution.gov_id,
      logo: institution.logo,
      created_at: institution.created_at.toISO(),
      updated_at: institution.updated_at.toISO(),
    }
  }
} 