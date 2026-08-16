import React from 'react'
import { Navigate } from 'react-router-dom'
import { useFeatures } from '../hooks/useFeatures'

interface RequireFeatureProps {
  /** Feature key from the platform catalog, e.g. 'chat'. */
  feature: string
  children: React.ReactNode
}

/**
 * Keeps a page closed to an institution that does not have the feature.
 *
 * The sibling of RequireModule, gating on a different question: that one asks
 * whether this person's role may open the screen, this asks whether their school
 * has the thing at all. A page may need both.
 *
 * Hiding the sidebar link is not enough on its own — someone can type the URL,
 * or follow a bookmark from before the feature was switched off.
 */
export const RequireFeature: React.FC<RequireFeatureProps> = ({ feature, children }) => {
  const { hasFeature, isLoading } = useFeatures()

  // The profile is still loading. Redirecting now would bounce people off their
  // own bookmarked page on every refresh.
  if (isLoading) return null

  if (!hasFeature(feature)) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

export default RequireFeature
