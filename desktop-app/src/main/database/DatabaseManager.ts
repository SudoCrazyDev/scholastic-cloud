import { SecureDatabase, DatabaseConfig } from './SecureDatabase'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

export class DatabaseManager {
  private static instance: DatabaseManager
  private database: SecureDatabase | null = null
  private configPath: string
  private isInitialized = false

  private constructor() {
    this.configPath = path.join(app.getPath('userData'), 'database', 'config.json')
  }

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager()
    }
    return DatabaseManager.instance
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      const config = await this.loadOrCreateConfig()
      this.database = new SecureDatabase(config)
      await this.database.initialize()
      this.isInitialized = true
      console.log('Database manager initialized successfully')
    } catch (error) {
      console.error('Failed to initialize database manager:', error)
      throw error
    }
  }

  private async loadOrCreateConfig(): Promise<DatabaseConfig> {
    try {
      // Ensure config directory exists
      const configDir = path.dirname(this.configPath)
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
      }

      // Try to load existing config
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8')
        const config = JSON.parse(configData) as DatabaseConfig
        
        // Validate config
        if (this.validateConfig(config)) {
          return config
        }
      }

      // Create new config
      const newConfig: DatabaseConfig = {
        encryptionKey: crypto.randomBytes(32).toString('hex'),
        databasePath: path.join(app.getPath('userData'), 'database', 'scholastic.db'),
        maxRetries: 3,
        timeout: 5000
      }

      // Save config
      fs.writeFileSync(this.configPath, JSON.stringify(newConfig, null, 2))
      return newConfig
    } catch (error) {
      console.error('Error loading/creating config:', error)
      throw error
    }
  }

  private validateConfig(config: any): config is DatabaseConfig {
    return (
      config &&
      typeof config.encryptionKey === 'string' &&
      config.encryptionKey.length === 64 &&
      typeof config.databasePath === 'string' &&
      typeof config.maxRetries === 'number' &&
      typeof config.timeout === 'number'
    )
  }

  public getDatabase(): SecureDatabase {
    if (!this.database || !this.isInitialized) {
      throw new Error('Database not initialized. Call initialize() first.')
    }
    return this.database
  }

  public async backup(): Promise<string> {
    if (!this.database) {
      throw new Error('Database not initialized')
    }
    return this.database.backup()
  }

  public async close(): Promise<void> {
    if (this.database) {
      this.database.close()
      this.database = null
      this.isInitialized = false
    }
  }

  public isReady(): boolean {
    return this.isInitialized && this.database !== null
  }

  public getStats(): any {
    if (!this.database) {
      throw new Error('Database not initialized')
    }
    return this.database.getDatabaseStats()
  }
} 