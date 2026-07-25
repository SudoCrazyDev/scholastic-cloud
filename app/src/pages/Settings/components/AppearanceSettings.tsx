import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { Palette, AlertTriangle } from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth'
import { useRoleAccess } from '../../../hooks/useRoleAccess'
import { themeService } from '../../../services/themeService'
import { Button } from '../../../components/button'
import {
  THEME_SLOTS,
  SHADES,
  DEFAULT_THEME,
  generateRamp,
  applyTheme,
  isValidHex,
  whiteTextContrastOn600,
  type ThemeSlot,
  type InstitutionTheme,
} from '../../../theme/palette'

const SLOT_LABELS: Record<ThemeSlot, { label: string; description: string }> = {
  primary: { label: 'Primary', description: 'Main brand color — buttons, links, active states, highlights.' },
  success: { label: 'Success', description: 'Positive states — confirmations, "active" badges.' },
  warning: { label: 'Warning', description: 'Cautions and pending states.' },
  danger: { label: 'Danger', description: 'Destructive actions and errors.' },
  info: { label: 'Info', description: 'Informational accents and notices.' },
}

/** Build the theme object from only the slots the admin chose to customize. */
function buildTheme(custom: Record<ThemeSlot, boolean>, hex: Record<ThemeSlot, string>): InstitutionTheme {
  const theme: InstitutionTheme = {}
  for (const slot of THEME_SLOTS) {
    if (custom[slot] && isValidHex(hex[slot])) theme[slot] = hex[slot]
  }
  return theme
}

function themesEqual(a: InstitutionTheme, b: InstitutionTheme): boolean {
  return THEME_SLOTS.every((slot) => (a[slot] ?? null) === (b[slot] ?? null))
}

/**
 * Self-serve institution color theming. Institution admins pick a base color per
 * slot; the app generates the full shade ramp. Changes preview live across the
 * whole app and revert on leave unless saved.
 */
const AppearanceSettings: React.FC = () => {
  const { refreshProfile } = useAuth()
  const queryClient = useQueryClient()
  const { hasAccess } = useRoleAccess(['institution-administrator', 'super-administrator'])

  const { data: savedTheme, isLoading } = useQuery({
    queryKey: ['institution-theme'],
    queryFn: () => themeService.getTheme(),
    enabled: hasAccess,
  })

  const [custom, setCustom] = useState<Record<ThemeSlot, boolean>>(() =>
    Object.fromEntries(THEME_SLOTS.map((s) => [s, false])) as Record<ThemeSlot, boolean>,
  )
  const [hex, setHex] = useState<Record<ThemeSlot, string>>(() => ({ ...DEFAULT_THEME }))

  // The last persisted theme, used to revert the live preview when leaving.
  const savedRef = useRef<InstitutionTheme>({})

  // Seed local state whenever the saved theme (re)loads.
  useEffect(() => {
    if (savedTheme === undefined) return
    const saved = savedTheme ?? {}
    savedRef.current = saved
    setCustom(Object.fromEntries(THEME_SLOTS.map((s) => [s, !!saved[s]])) as Record<ThemeSlot, boolean>)
    setHex(Object.fromEntries(THEME_SLOTS.map((s) => [s, saved[s] ?? DEFAULT_THEME[s]])) as Record<ThemeSlot, string>)
  }, [savedTheme])

  const draft = useMemo(() => buildTheme(custom, hex), [custom, hex])

  // Live preview across the whole app; revert to the saved theme on unmount.
  useEffect(() => {
    applyTheme(draft)
  }, [draft])
  useEffect(() => () => applyTheme(savedRef.current), [])

  const mutation = useMutation({
    mutationFn: (theme: InstitutionTheme) => themeService.updateTheme(Object.keys(theme).length ? theme : null),
    onSuccess: async (result) => {
      savedRef.current = result ?? {}
      queryClient.setQueryData(['institution-theme'], result ?? null)
      await refreshProfile()
      toast.success('Colors updated.')
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to update colors'
      toast.error(message)
    },
  })

  if (!hasAccess) return null

  const dirty = !themesEqual(draft, savedRef.current)
  const primaryContrast = custom.primary && isValidHex(hex.primary) ? whiteTextContrastOn600(hex.primary) : null

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
          <Palette className="w-6 h-6 text-primary-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Appearance &amp; Branding</h2>
          <p className="text-sm text-gray-500">
            Customize your institution&apos;s colors. Changes preview live below and apply to everyone once saved.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
          <span className="ml-3 text-gray-500 text-sm">Loading colors…</span>
        </div>
      ) : (
        <div className="space-y-6">
          {THEME_SLOTS.map((slot) => {
            const enabled = custom[slot]
            const value = hex[slot]
            const valid = isValidHex(value)
            const ramp = valid ? generateRamp(value) : null
            return (
              <div key={slot} className="border border-gray-200 rounded-lg p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block w-4 h-4 rounded-full border border-gray-300"
                        style={{ backgroundColor: enabled && valid ? ramp![600] : `var(--color-${slot}-600)` }}
                      />
                      <h3 className="text-sm font-semibold text-gray-900">{SLOT_LABELS[slot].label}</h3>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{SLOT_LABELS[slot].description}</p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => setCustom((p) => ({ ...p, [slot]: e.target.checked }))}
                      className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    Customize
                  </label>
                </div>

                {enabled && (
                  <div className="mt-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        type="color"
                        value={valid ? value : '#000000'}
                        onChange={(e) => setHex((p) => ({ ...p, [slot]: e.target.value }))}
                        className="h-9 w-12 rounded border border-gray-300 cursor-pointer bg-white p-0.5"
                        aria-label={`${SLOT_LABELS[slot].label} color`}
                      />
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => setHex((p) => ({ ...p, [slot]: e.target.value }))}
                        placeholder="#4f46e5"
                        className={`w-32 rounded-md border px-3 py-1.5 text-sm font-mono ${valid ? 'border-gray-300' : 'border-danger-400 text-danger-600'}`}
                      />
                      <button
                        type="button"
                        onClick={() => setHex((p) => ({ ...p, [slot]: DEFAULT_THEME[slot] }))}
                        className="text-xs text-primary-600 hover:text-primary-800 font-medium"
                      >
                        Reset to default
                      </button>
                      {!valid && <span className="text-xs text-danger-600">Enter a valid hex color (e.g. #4f46e5)</span>}
                    </div>

                    {ramp && (
                      <div className="flex flex-wrap gap-1">
                        {SHADES.map((shade) => (
                          <div key={shade} className="flex flex-col items-center">
                            <span
                              className="w-9 h-8 rounded border border-black/5"
                              style={{ backgroundColor: ramp[shade] }}
                              title={`${shade}: ${ramp[shade]}`}
                            />
                            <span className="text-[10px] text-gray-400 mt-0.5">{shade}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {slot === 'primary' && primaryContrast !== null && primaryContrast < 4.5 && (
                      <div className="flex items-start gap-2 rounded-md bg-warning-50 border border-warning-200 p-2 text-xs text-warning-800">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>
                          White text on this color may be hard to read (contrast {primaryContrast.toFixed(1)}:1, below the
                          recommended 4.5:1). Consider a darker shade for buttons.
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-200">
            <button
              type="button"
              onClick={() => setCustom(Object.fromEntries(THEME_SLOTS.map((s) => [s, false])) as Record<ThemeSlot, boolean>)}
              className="text-sm text-gray-500 hover:text-gray-700 font-medium"
            >
              Reset all to default
            </button>
            <Button
              type="button"
              color="primary"
              disabled={!dirty || mutation.isPending}
              onClick={() => mutation.mutate(draft)}
            >
              {mutation.isPending ? 'Saving…' : 'Save Colors'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default AppearanceSettings
