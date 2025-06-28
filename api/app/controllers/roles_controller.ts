import { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import RoleService from '#services/role_service'
import { createRoleValidator, updateRoleValidator, roleListValidator } from '#validators/role_validator'
import Role from '#models/role'

@inject()
export default class RolesController {
  constructor(private roleService: RoleService) {}

  /**
   * Display a list of roles with pagination and filtering
   */
  async index({ request, response }: HttpContext) {
    try {
      const payload = await roleListValidator.validate(request.qs())
      const roles = await this.roleService.getRoles(payload)

      return response.ok({
        data: roles.all().map((role: Role) => this.formatRoleResponse(role)),
        meta: roles.getMeta(),
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
   * Display a single role
   */
  async show({ params, response }: HttpContext) {
    try {
      const role = await this.roleService.getRoleById(params.id)
      
      if (!role) {
        return response.notFound({
          message: 'Role not found',
          status: 404,
        })
      }

      return response.ok(this.formatRoleResponse(role))
    } catch (error) {
      throw error
    }
  }

  /**
   * Create a new role
   */
  async store({ request, response }: HttpContext) {
    try {
      const payload = await createRoleValidator.validate(request.body())

      // Check if slug already exists
      const slugExists = await this.roleService.slugExists(payload.slug)
      if (slugExists) {
        return response.conflict({
          message: 'Slug already exists',
          status: 409,
        })
      }

      const role = await this.roleService.createRole(payload)

      return response.created(this.formatRoleResponse(role))
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
   * Update a role
   */
  async update({ params, request, response }: HttpContext) {
    try {
      const role = await this.roleService.getRoleById(params.id)
      
      if (!role) {
        return response.notFound({
          message: 'Role not found',
          status: 404,
        })
      }

      const payload = await updateRoleValidator.validate(request.body())

      // Check if slug already exists (if slug is being updated)
      if (payload.slug && payload.slug !== role.slug) {
        const slugExists = await this.roleService.slugExists(payload.slug, params.id)
        if (slugExists) {
          return response.conflict({
            message: 'Slug already exists',
            status: 409,
          })
        }
      }

      const updatedRole = await this.roleService.updateRole(params.id, payload)

      return response.ok(this.formatRoleResponse(updatedRole!))
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
   * Delete a role
   */
  async destroy({ params, response }: HttpContext) {
    try {
      const deleted = await this.roleService.deleteRole(params.id)
      
      if (!deleted) {
        return response.notFound({
          message: 'Role not found',
          status: 404,
        })
      }

      return response.noContent()
    } catch (error) {
      throw error
    }
  }

  /**
   * Format role response
   */
  private formatRoleResponse(role: Role) {
    return {
      id: role.id,
      title: role.title,
      slug: role.slug,
      created_at: role.created_at.toISO(),
      updated_at: role.updated_at.toISO(),
    }
  }
} 