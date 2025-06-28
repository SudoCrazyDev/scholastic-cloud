import User from '#models/user'
import Role from '#models/role'
import { DateTime } from 'luxon'

export interface CreateUserData {
  first_name: string
  middle_name?: string
  last_name: string
  ext_name?: string
  gender: 'male' | 'female' | 'other'
  birthdate: DateTime
  email: string
  password: string
  role_id?: string
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
}

export default class UserService {
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

    return await query.orderBy('created_at', 'desc').paginate(page, limit)
  }

  /**
   * Get a single user by ID with role
   */
  async getUserById(id: string): Promise<User | null> {
    return await User.query().where('id', id).preload('role').first()
  }

  /**
   * Get a single user by email with role
   */
  async getUserByEmail(email: string): Promise<User | null> {
    return await User.query().where('email', email).preload('role').first()
  }

  /**
   * Create a new user
   */
  async createUser(data: CreateUserData): Promise<User> {
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

    user.merge(data)
    await user.save()
    return user
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