import { generateRamp, type InstitutionTheme, type Shade } from './palette';

/**
 * Extract the active institution's color theme from an auth user object.
 * Mirrors how currentAcademicYear is resolved: prefer the default membership,
 * else the first. Works for both staff (user_institutions) and student payloads.
 * Returns null when there is no user or no custom theme.
 */
export function resolveUserTheme(user: unknown): InstitutionTheme | null {
  const memberships = (user as { user_institutions?: Array<{ is_default?: boolean; institution?: { theme?: InstitutionTheme | null } }> } | null)
    ?.user_institutions;
  if (!memberships?.length) return null;
  const active = memberships.find((m) => m.is_default) ?? memberships[0];
  return active?.institution?.theme ?? null;
}

/**
 * Resolve the institution's primary brand color at a given shade as a concrete
 * hex, for contexts that can't use CSS variables (e.g. react-pdf documents).
 * Falls back to the default (indigo) when there is no custom primary color.
 */
export function brandPrimaryHex(user: unknown, shade: Shade = 700, fallback = '#4338ca'): string {
  const primary = resolveUserTheme(user)?.primary;
  if (!primary) return fallback;
  return generateRamp(primary)?.[shade] ?? fallback;
}
