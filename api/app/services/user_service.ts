import User from '#models/user'
import Role from '#models/role'
import UserInstitution from '#models/user_institution'
import Institution from '#models/institution'
import RoleService from '#services/role_service'
import InstitutionService from '#services/institution_service'
import { DateTime } from 'luxon'

export interface CreateUserData {
  first_name: string
  middle_name?: string
  last_name: string
  ext_name?: string
  gender: 'male' | 'female' | 'other'
  birthdate: DateTime
  email: string
  password?: string
  role_id: string
  institution_ids: string[]
}

export interface UpdateUserData {
  first_name?: string
  middle_name?: string
  last_name?: string
  ext_name?: string
  gender?: 'male' | 'female' | 'other'
  birthdate?: DateTime
  email?: string
  password?: string
  role_id?: string
  institution_ids?: string[]
  is_new?: boolean
  is_active?: boolean
  token?: string | null
}

export interface UserListFilters {
  page?: number
  limit?: number
  search?: string
  gender?: 'male' | 'female' | 'other'
  is_active?: boolean
  role_id?: string
  institution_ids?: string[]
}

export default class UserService {
  private roleService: RoleService
  private institutionService: InstitutionService

  constructor() {
    this.roleService = new RoleService()
    this.institutionService = new InstitutionService()
  }

  /**
   * Get paginated list of users with optional search and filters
   */
  async getUsers(filters: UserListFilters): Promise<any> {
    const page = filters.page || 1
    const limit = filters.limit || 20

    const query = User.query()

    // Apply filters
    if (filters.search) {
      query.where((builder) => {
        builder
          .whereILike('first_name', `%${filters.search}%`)
          .orWhereILike('last_name', `%${filters.search}%`)
          .orWhereILike('email', `%${filters.search}%`)
      })
    }

    if (filters.gender) {
      query.where('gender', filters.gender)
    }

    if (filters.is_active !== undefined) {
      query.where('is_active', filters.is_active)
    }

    if (filters.role_id) {
      query.where('role_id', filters.role_id)
    }

    if (filters.institution_ids) {
      query.whereHas('userInstitutions', (builder) => {
        builder.whereIn('institution_id', filters.institution_ids as string[])
      })
    }

    return await query.preload('role').preload('userInstitutions', (query) => {
      query.preload('institution')
    }).orderBy('created_at', 'desc').paginate(page, limit)
  }

  /**
   * Get a single user by ID with role and institutions
   */
  async getUserById(id: string): Promise<User | null> {
    return await User.query().where('id', id).preload('role').preload('userInstitutions', (query) => {
      query.preload('institution')
    }).first()
  }

  /**
   * Get a single user by email with role and institutions
   */
  async getUserByEmail(email: string): Promise<User | null> {
    return await User.query().where('email', email).preload('role').preload('userInstitutions', (query) => {
      query.preload('institution')
    }).first()
  }

  /**
   * Create a new user with institution assignment
   */
  async createUserWithInstitution(data: CreateUserData): Promise<User> {
    // Validate that role exists
    const role = await this.roleService.getRoleById(data.role_id)
    if (!role) {
      throw new Error('Role not found')
    }

    // Validate that all institutions exist
    for (const institutionId of data.institution_ids) {
      const institution = await this.institutionService.getInstitutionById(institutionId)
      if (!institution) {
        throw new Error(`Institution with ID ${institutionId} not found`)
      }
    }

    // Create the user first
    const user = await User.create({
      first_name: data.first_name,
      middle_name: data.middle_name,
      last_name: data.last_name,
      ext_name: data.ext_name,
      gender: data.gender,
      birthdate: data.birthdate,
      email: data.email,
      password: data.password,
      role_id: data.role_id,
    })

    // Assign user to all institutions
    for (let i = 0; i < data.institution_ids.length; i++) {
      await UserInstitution.create({
        user_id: user.id,
        institution_id: data.institution_ids[i],
        is_default: i === 0, // Set first institution as default
      })
    }

    // Return user with preloaded relationships
    const userWithRelations = await User.query().where('id', user.id).preload('role').preload('userInstitutions', (query) => {
      query.preload('institution')
    }).first()
    if (!userWithRelations) {
      throw new Error('Failed to create user with relationships')
    }
    return userWithRelations
  }

  /**
   * Create a new user (legacy method - kept for backward compatibility)
   */
  async createUser(data: Omit<CreateUserData, 'institution_ids'>): Promise<User> {
    return await User.create(data)
  }

  /**
   * Update an existing user
   */
  async updateUser(id: string, data: UpdateUserData): Promise<User | null> {
    const user = await User.find(id)
    if (!user) {
      return null
    }

    // Handle institution assignment if provided
    if (data.institution_ids) {
      // Validate that all institutions exist
      for (const institutionId of data.institution_ids) {
        const institution = await this.institutionService.getInstitutionById(institutionId)
        if (!institution) {
          throw new Error(`Institution with ID ${institutionId} not found`)
        }
      }

      // Get existing institution assignments for this user
      const existingAssignments = await UserInstitution.query()
        .where('user_id', id)
        .whereIn('institution_id', data.institution_ids)

      const existingInstitutionIds = existingAssignments.map(assignment => assignment.institution_id)
      
      // Find new institutions that need to be assigned
      const newInstitutionIds = data.institution_ids.filter(id => !existingInstitutionIds.includes(id))
      
      // Assign user to new institutions
      for (let i = 0; i < newInstitutionIds.length; i++) {
        await UserInstitution.create({
          user_id: id,
          institution_id: newInstitutionIds[i],
          is_default: existingAssignments.length === 0 && i === 0, // Set as default only if no existing assignments
        })
      }
    }

    // Handle role validation if provided
    if (data.role_id) {
      const role = await this.roleService.getRoleById(data.role_id)
      if (!role) {
        throw new Error('Role not found')
      }
    }

    // Remove institution_ids from data before merging with user
    const { institution_ids, ...userData } = data

    user.merge(userData)
    await user.save()
    
    // Return user with preloaded relationships
    return await User.query().where('id', id).preload('role').preload('userInstitutions', (query) => {
      query.preload('institution')
    }).first()
  }

  /**
   * Delete a user
   */
  async deleteUser(id: string): Promise<boolean> {
    const user = await User.find(id)
    if (!user) {
      return false
    }

    await user.delete()
    return true
  }

  /**
   * Check if email already exists
   */
  async emailExists(email: string, excludeId?: string): Promise<boolean> {
    const query = User.query().where('email', email)
    
    if (excludeId) {
      query.whereNot('id', excludeId)
    }

    const existingUser = await query.first()
    return !!existingUser
  }
} 