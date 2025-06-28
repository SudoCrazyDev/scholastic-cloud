import jwt from 'jsonwebtoken'
import { DateTime } from 'luxon'

export interface TokenPayload {
  user_id: string
  email: string
  role_id?: string
  iat?: number
  exp?: number
}

export default class JwtService {
  private readonly secret: string
  private readonly expiresIn: string

  constructor() {
    this.secret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production'
    this.expiresIn = process.env.JWT_EXPIRES_IN || '24h'
  }

  /**
   * Generate JWT token for user
   */
  generateToken(user: any): string {
    const payload = {
      user_id: user.id,
      email: user.email,
      role_id: user.role_id,
    }

    // @ts-ignore - Ignoring TypeScript error for JWT sign
    return jwt.sign(payload, this.secret, { expiresIn: this.expiresIn })
  }

  /**
   * Verify JWT token
   */
  verifyToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.secret) as TokenPayload
      return decoded
    } catch (error) {
      return null
    }
  }

  /**
   * Decode JWT token without verification
   */
  decodeToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.decode(token) as TokenPayload
      return decoded
    } catch (error) {
      return null
    }
  }

  /**
   * Get token expiration date
   */
  getTokenExpiration(token: string): DateTime | null {
    const decoded = this.decodeToken(token)
    if (!decoded || !decoded.exp) {
      return null
    }

    return DateTime.fromSeconds(decoded.exp)
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(token: string): boolean {
    const expiration = this.getTokenExpiration(token)
    if (!expiration) {
      return true
    }

    return expiration < DateTime.now()
  }
} 