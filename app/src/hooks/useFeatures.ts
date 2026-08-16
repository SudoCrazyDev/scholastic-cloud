import { useMemo } from 'react'
import { useAuth } from './useAuth'

/**
 * What the signed-in user's institution has.
 *
 * The companion to usePermissions, and deliberately separate. A permission says
 * what this person's role may reach, and a super-administrator's wildcard
 * satisfies every one of them. A feature says what the school has at all — the
 * wildcard does not reach it, because "does this school have chat" is not a
 * question about the person asking.
 *
 * Like permissions, the set arrives on the profile payload, so this reads auth
 * state rather than firing its own request.
 *
 * Hiding a screen here is a courtesy. The API refuses the call regardless — see
 * App\Http\Middleware\EnsureFeatureEnabled.
 */
export function useFeatures() {
  const { user, isLoading } = useAuth()

  const features = useMemo<Set<string>>(
    () => new Set<string>(Array.isArray(user?.features) ? user.features : []),
    [user?.features],
  )

  return useMemo(
    () => ({
      features,
      /** Does this institution have the feature? */
      hasFeature: (feature: string): boolean => features.has(feature),
      /**
       * True while the profile is still in flight. Callers that would otherwise
       * redirect need this, or a page refresh bounces someone off their own
       * bookmark before the answer has arrived.
       */
      isLoading,
    }),
    [features, isLoading],
  )
}
