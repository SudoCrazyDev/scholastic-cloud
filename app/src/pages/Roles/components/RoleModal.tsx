import React, { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XMarkIcon, LockClosedIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { Input } from '../../../components/input'
import { Button } from '../../../components/button'
import { ModuleAccessGrid } from './ModuleAccessGrid'
import { useModuleCatalog } from '../../../hooks/useModuleCatalog'
import { usePermissions } from '../../../hooks/usePermissions'
import type { Role } from '../../../types'

interface RoleModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: { title: string; permissions: string[] }) => Promise<void>
  role?: Role | null
  loading?: boolean
  error?: string | null
}

export function RoleModal({
  isOpen,
  onClose,
  onSubmit,
  role,
  loading = false,
  error = null
}: RoleModalProps) {
  const [title, setTitle] = useState('')
  const [permissions, setPermissions] = useState<string[]>([])
  const [errors, setErrors] = useState<{ [key: string]: string }>({})

  const { fullAccess } = usePermissions()

  const isEditing = !!role
  const isBuiltIn = Boolean(role?.is_system)
  // Built-in roles are shown to an institution read-only rather than hidden —
  // seeing what "Principal" grants is useful when deciding what a new custom
  // role needs. A super-administrator may edit them, which is what the API
  // allows, so the two agree on who can do what.
  const isReadOnly = isBuiltIn && !fullAccess
  const isEditingBuiltIn = isBuiltIn && fullAccess

  const { data: catalog, isLoading: catalogLoading, error: catalogError } = useModuleCatalog(isOpen)

  useEffect(() => {
    if (!isOpen) return

    setTitle(role?.title ?? '')
    setPermissions(role?.permissions ?? [])
    setErrors({})
  }, [isOpen, role])

  const grantedCount = useMemo(
    () => new Set(permissions.filter((p) => p.endsWith('.view')).map((p) => p.split('.')[0])).size,
    [permissions]
  )

  const validate = () => {
    const next: { [key: string]: string } = {}

    if (!title.trim()) {
      next.title = 'Name is required'
    } else if (title.trim().length < 2) {
      next.title = 'Name must be at least 2 characters'
    } else if (title.length > 100) {
      next.title = 'Name must be less than 100 characters'
    }

    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (isReadOnly || !validate()) return

    try {
      await onSubmit({ title: title.trim(), permissions })
      onClose()
    } catch {
      // Surfaced by the parent through the `error` prop.
    }
  }

  const handleClose = () => {
    if (!loading) onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
            onClick={handleClose}
          />

          {/* Modal */}
          <div className="flex min-h-full items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl dark:bg-gray-900 dark:ring-1 dark:ring-white/10"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-4 border-b border-gray-200 p-6 dark:border-gray-700">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {isReadOnly
                      ? role?.title
                      : isEditingBuiltIn
                        ? `Edit ${role?.title}`
                        : isEditing
                          ? 'Edit Role'
                          : 'Create New Role'}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {isReadOnly
                      ? 'This is a built-in role. Create a role of your own to customise access.'
                      : 'Choose which modules this role can open, and what it can change in them.'}
                  </p>
                </div>
                <button
                  onClick={handleClose}
                  disabled={loading}
                  className="text-gray-400 transition-colors duration-200 hover:text-gray-600 disabled:opacity-50 dark:hover:text-gray-200"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
                  {error && (
                    <div className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-500/30 dark:bg-red-500/10">
                      <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                    </div>
                  )}

                  {isReadOnly && (
                    <div className="flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/60">
                      <LockClosedIcon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        Built-in roles are shared by every school on the platform and cannot be
                        edited or deleted.
                      </p>
                    </div>
                  )}

                  {/*
                    A super-administrator may edit these, but neither
                    consequence is visible from the form: the role belongs to
                    every tenant, and the deploy seeder rewrites built-in roles
                    from SystemRolePermissions. Say both before they save.
                  */}
                  {isEditingBuiltIn && (
                    <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-400/30 dark:bg-amber-400/10">
                      <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                      <p className="text-sm text-amber-800 dark:text-amber-300">
                        This is a built-in role. Changes apply to{' '}
                        <strong className="font-semibold">every school on the platform</strong>, and
                        are overwritten the next time built-in roles are re-seeded on deploy. To
                        change it for good, edit it in the code instead.
                      </p>
                    </div>
                  )}

                  <Input
                    label="Role name"
                    type="text"
                    value={title}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      setTitle(e.target.value)
                      if (errors.title) setErrors((prev) => ({ ...prev, title: '' }))
                    }}
                    placeholder="e.g. Cashier, Guidance Counselor"
                    error={errors.title}
                    disabled={loading || isReadOnly}
                    required
                  />

                  <div>
                    <div className="mb-3 flex items-baseline justify-between gap-4">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Module access</h4>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {grantedCount === 0
                          ? 'No modules selected'
                          : `${grantedCount} module${grantedCount === 1 ? '' : 's'} granted`}
                      </span>
                    </div>

                    {catalogLoading && (
                      <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading modules…</p>
                    )}

                    {catalogError && (
                      <p className="py-8 text-center text-sm text-red-600 dark:text-red-400">
                        Could not load the module list. Close this and try again.
                      </p>
                    )}

                    {catalog && (
                      <ModuleAccessGrid
                        groups={catalog.groups}
                        value={permissions}
                        onChange={setPermissions}
                        disabled={loading || isReadOnly}
                      />
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end space-x-3 border-t border-gray-200 p-6 dark:border-gray-700">
                  <Button
                    type="button"
                    onClick={handleClose}
                    disabled={loading}
                    variant="outline"
                    color="secondary"
                  >
                    {isReadOnly ? 'Close' : 'Cancel'}
                  </Button>
                  {!isReadOnly && (
                    <Button type="submit" disabled={loading} loading={loading} color="primary">
                      {isEditing ? 'Save Changes' : 'Create Role'}
                    </Button>
                  )}
                </div>
              </form>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
}
