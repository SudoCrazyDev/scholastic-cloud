import { inject } from '@adonisjs/core'
import hash from '@adonisjs/core/services/hash'
import UserService from '#services/user_service'
import JwtService from '#services/jwt_service'
import User from '#models/user'

export interface LoginCredentials {
  email: string
  password: string
}

export interface LoginResult {
  user: User
  token: string
  token_type: string
  expires_in: string
}

export interface UserProfile {
  id: string
  first_name: string
  middle_name: string | null
  last_name: string
  ext_name: string | null
  email: string
  gender: 'male' | 'female' | 'other'
  birthdate: string
  is_new: boolean
  is_active: boolean
  role?: {
    title: string
    slug: string
  } | null
}

@inject()
export default class AuthService {
  constructor(
    private userService: UserService,
    private jwtService: JwtService
  ) {}

  /**
   * Authenticate user with email and password
   */
  async authenticateUser(credentials: LoginCredentials): Promise<LoginResult> {
    // Find user by email
    const user = await this.userService.getUserByEmail(credentials.email)
    
    if (!user) {
      throw new Error('Invalid credentials')
    }

    // Verify password
    const isValidPassword = await hash.verify(user.password, credentials.password)
    if (!isValidPassword) {
      throw new Error('Invalid credentials')
    }

    // Check if user is active
    if (!user.is_active) {
      throw new Error('Account is deactivated')
    }

    // Generate JWT token
    const token = this.jwtService.generateToken(user)

    // Update user's token field (optional - for tracking active sessions)
    await this.userService.updateUser(user.id, { token })
    return {
      user,
      token,
      token_type: 'Bearer',
      expires_in: '24h',
    }
  }

  /**
   * Logout user by clearing their token
   */
  async logoutUser(userId: string): Promise<void> {
    await this.userService.updateUser(userId, { token: null })
  }

  /**
   * Get user profile data
   */
  async getUserProfile(userId: string): Promise<UserProfile> {
    const user = await this.userService.getUserById(userId)
    
    if (!user) {
      throw new Error('User not found')
    }

    return {
      id: user.id,
      first_name: user.first_name,
      middle_name: user.middle_name,
      last_name: user.last_name,
      ext_name: user.ext_name,
      email: user.email,
      gender: user.gender,
      birthdate: user.birthdate.toISODate() || '',
      is_new: user.is_new,
      is_active: user.is_active,
      role: user.role ? {
        title: user.role.title,
        slug: user.role.slug,
      } : null,
    }
  }

  /**
   * Validate user authentication
   */
  async validateUser(userId: string): Promise<User | null> {
    return await this.userService.getUserById(userId)
  }
} 