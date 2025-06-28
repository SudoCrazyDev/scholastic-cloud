import Role from '#models/role'

export interface CreateRoleData {
  title: string
  slug: string
}

export interface UpdateRoleData {
  title?: string
  slug?: string
}

export interface RoleListFilters {
  page?: number
  limit?: number
  search?: string
}

export default class RoleService {
  /**
   * Get paginated list of roles with optional search
   */
  async getRoles(filters: RoleListFilters): Promise<any> {
    const page = filters.page || 1
    const limit = filters.limit || 20

    const query = Role.query()

    // Apply search filter
    if (filters.search) {
      query.where((builder) => {
        builder
          .whereILike('title', `%${filters.search}%`)
          .orWhereILike('slug', `%${filters.search}%`)
      })
    }

    return await query.orderBy('created_at', 'desc').paginate(page, limit)
  }

  /**
   * Get a single role by ID
   */
  async getRoleById(id: string): Promise<Role | null> {
    return await Role.find(id)
  }

  /**
   * Get a single role by slug
   */
  async getRoleBySlug(slug: string): Promise<Role | null> {
    return await Role.findBy('slug', slug)
  }

  /**
   * Create a new role
   */
  async createRole(data: CreateRoleData): Promise<Role> {
    return await Role.create(data)
  }

  /**
   * Update an existing role
   */
  async updateRole(id: string, data: UpdateRoleData): Promise<Role | null> {
    const role = await Role.find(id)
    if (!role) {
      return null
    }

    role.merge(data)
    await role.save()
    return role
  }

  /**
   * Delete a role
   */
  async deleteRole(id: string): Promise<boolean> {
    const role = await Role.find(id)
    if (!role) {
      return false
    }

    await role.delete()
    return true
  }

  /**
   * Check if slug already exists
   */
  async slugExists(slug: string, excludeId?: string): Promise<boolean> {
    const query = Role.query().where('slug', slug)
    
    if (excludeId) {
      query.whereNot('id', excludeId)
    }

    const existingRole = await query.first()
    return !!existingRole
  }

  /**
   * Generate a unique slug from title
   */
  async generateSlug(title: string, excludeId?: string): Promise<string> {
    let baseSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    let slug = baseSlug
    let counter = 1

    while (await this.slugExists(slug, excludeId)) {
      slug = `${baseSlug}-${counter}`
      counter++
    }

    return slug
  }
} 