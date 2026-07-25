
import { motion, AnimatePresence } from 'framer-motion'
import { ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { Button } from './button'

interface ConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'info'
  loading?: boolean
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  loading = false,
}: ConfirmationModalProps) {
  const handleClose = () => {
    if (!loading) {
      onClose()
    }
  }

  const handleConfirm = () => {
    if (!loading) {
      onConfirm()
    }
  }

  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          icon: 'text-danger-600',
          bg: 'bg-danger-50',
          border: 'border-danger-200',
          button: 'bg-danger-600 hover:bg-danger-700 focus:ring-danger-500',
        }
      case 'warning':
        return {
          icon: 'text-warning-600',
          bg: 'bg-warning-50',
          border: 'border-warning-200',
          button: 'bg-warning-600 hover:bg-warning-700 focus:ring-warning-500',
        }
      case 'info':
        return {
          icon: 'text-info-600',
          bg: 'bg-info-50',
          border: 'border-info-200',
          button: 'bg-info-600 hover:bg-info-700 focus:ring-info-500',
        }
      default:
        return {
          icon: 'text-danger-600',
          bg: 'bg-danger-50',
          border: 'border-danger-200',
          button: 'bg-danger-600 hover:bg-danger-700 focus:ring-danger-500',
        }
    }
  }

  const styles = getVariantStyles()

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
              className="relative w-full max-w-md bg-white rounded-lg shadow-xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-full ${styles.bg}`}>
                    <ExclamationTriangleIcon className={`w-6 h-6 ${styles.icon}`} />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
                </div>
                <button
                  onClick={handleClose}
                  disabled={loading}
                  className="text-gray-400 hover:text-gray-600 transition-colors duration-200 disabled:opacity-50"
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6">
                <p className="text-gray-700 whitespace-pre-line">{message}</p>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200">
                <Button
                  type="button"
                  onClick={handleClose}
                  disabled={loading}
                  variant="outline"
                >
                  {cancelText}
                </Button>
                <Button
                  type="button"
                  onClick={handleConfirm}
                  disabled={loading}
                  loading={loading}
                  className={styles.button}
                >
                  {confirmText}
                </Button>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
} 