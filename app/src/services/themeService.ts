import { api } from '../lib/api'
import type { InstitutionTheme } from '../theme/palette'

/**
 * Self-serve per-institution color theme. Resolves the caller's own institution
 * server-side (no id needed); gated to institution admins.
 */
class ThemeService {
  async getTheme() {
    const response = await api.get<{ data: { theme: InstitutionTheme | null } }>('/institution-theme')
    return response.data.data.theme
  }

  async updateTheme(theme: InstitutionTheme | null) {
    const response = await api.put<{ data: { theme: InstitutionTheme | null } }>('/institution-theme', { theme })
    return response.data.data.theme
  }
}

export const themeService = new ThemeService()
