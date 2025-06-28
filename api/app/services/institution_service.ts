import Institution from '#models/institution'

export interface CreateInstitutionData {
  title: string
  abbr: string
  address?: string
  division?: string
  region?: string
  gov_id?: string
  logo?: string
}

export interface UpdateInstitutionData {
  title?: string
  abbr?: string
  address?: string
  division?: string
  region?: string
  gov_id?: string
  logo?: string
}

export interface InstitutionListFilters {
  page?: number
  limit?: number
  search?: string
  region?: string
  division?: string
}

export default class InstitutionService {
  /**
   * Get paginated list of institutions with optional search
   */
  async getInstitutions(filters: InstitutionListFilters): Promise<any> {
    const page = filters.page || 1
    const limit = filters.limit || 20

    const query = Institution.query()

    // Apply search filter
    if (filters.search) {
      query.where((builder) => {
        builder
          .whereILike('title', `%${filters.search}%`)
          .orWhereILike('abbr', `%${filters.search}%`)
          .orWhereILike('address', `%${filters.search}%`)
      })
    }

    if (filters.region) {
      query.where('region', filters.region)
    }

    if (filters.division) {
      query.where('division', filters.division)
    }

    return await query.orderBy('created_at', 'desc').paginate(page, limit)
  }

  /**
   * Get a single institution by ID
   */
  async getInstitutionById(id: string): Promise<Institution | null> {
    return await Institution.find(id)
  }

  /**
   * Get a single institution by abbreviation
   */
  async getInstitutionByAbbr(abbr: string): Promise<Institution | null> {
    return await Institution.findBy('abbr', abbr)
  }

  /**
   * Create a new institution
   */
  async createInstitution(data: CreateInstitutionData): Promise<Institution> {
    return await Institution.create(data)
  }

  /**
   * Update an existing institution
   */
  async updateInstitution(id: string, data: UpdateInstitutionData): Promise<Institution | null> {
    const institution = await Institution.find(id)
    if (!institution) {
      return null
    }

    institution.merge(data)
    await institution.save()
    return institution
  }

  /**
   * Delete an institution
   */
  async deleteInstitution(id: string): Promise<boolean> {
    const institution = await Institution.find(id)
    if (!institution) {
      return false
    }

    await institution.delete()
    return true
  }

  /**
   * Check if abbreviation already exists
   */
  async abbrExists(abbr: string, excludeId?: string): Promise<boolean> {
    const query = Institution.query().where('abbr', abbr)
    
    if (excludeId) {
      query.whereNot('id', excludeId)
    }

    const existingInstitution = await query.first()
    return !!existingInstitution
  }
} 