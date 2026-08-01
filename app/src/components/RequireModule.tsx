import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { usePermissions } from '../hooks/usePermissions'

interface RequireModuleProps {
  /** Module key from the access catalog, e.g. 'finance'. */
  module: string
  /** Ability required to open the page. Defaults to read access. */
  ability?: string
  children: React.ReactNode
}

/**
 * Keeps a page closed to roles that were not given the module.
 *
 * Hiding the sidebar link is not enough on its own — someone can type the URL,
 * or follow a stale bookmark after their role changed. This sends them back to
 * the dashboard instead of rendering a screen that would only fill with 403s.
 *
 * The API enforces the same permission on every request behind these pages;
 * this guard exists so the user sees a sensible redirect rather than a broken
 * screen.
 */
export const RequireModule: React.FC<RequireModuleProps> = ({ module, ability = 'view', children }) => {
  const { isLoading } = useAuth()
  const { can } = usePermissions()

  // The profile (and with it the permission set) is still loading — rendering
  // a redirect here would bounce people off their own bookmarked page on every
  // refresh.
  if (isLoading) return null

  if (!can(module, ability)) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

export default RequireModule
