import React, { forwardRef } from 'react'
import clsx from 'clsx'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'solid' | 'outline' | 'ghost' | 'link'
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  fullWidth?: boolean
  href?: string
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ 
    className, 
    variant = 'solid', 
    color = 'primary', 
    size = 'md', 
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    disabled,
    children,
    ...props 
  }, ref) => {
    
    const baseClasses = clsx(
      // Base styles
      'inline-flex items-center justify-center gap-2 font-medium rounded-lg',
      'transition-all duration-200 ease-in-out',
      'focus:outline-none focus:ring-2 focus:ring-offset-2',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      'active:scale-[0.98]',
      
      // Size styles
      size === 'sm' && 'px-3 py-1.5 text-sm',
      size === 'md' && 'px-4 py-2 text-sm',
      size === 'lg' && 'px-6 py-3 text-base',
      
      // Width
      fullWidth && 'w-full',
      
      // Variant and color combinations
      variant === 'solid' && {
        'primary': [
          'bg-primary-600 text-white border border-primary-600',
          'hover:bg-primary-700 hover:border-primary-700',
          'focus:ring-primary-500',
          'active:bg-primary-800'
        ],
        'secondary': [
          'bg-gray-600 text-white border border-gray-600',
          'hover:bg-gray-700 hover:border-gray-700',
          'focus:ring-gray-500',
          'active:bg-gray-800'
        ],
        'success': [
          'bg-success-600 text-white border border-success-600',
          'hover:bg-success-700 hover:border-success-700',
          'focus:ring-success-500',
          'active:bg-success-800'
        ],
        'warning': [
          'bg-warning-500 text-white border border-warning-500',
          'hover:bg-warning-600 hover:border-warning-600',
          'focus:ring-warning-500',
          'active:bg-warning-700'
        ],
        'danger': [
          'bg-danger-600 text-white border border-danger-600',
          'hover:bg-danger-700 hover:border-danger-700',
          'focus:ring-danger-500',
          'active:bg-danger-800'
        ],
        'info': [
          'bg-info-600 text-white border border-info-600',
          'hover:bg-info-700 hover:border-info-700',
          'focus:ring-info-500',
          'active:bg-info-800'
        ]
      }[color],
      
      variant === 'outline' && {
        'primary': [
          'bg-transparent text-primary-600 border border-primary-600',
          'hover:bg-primary-50 hover:border-primary-700',
          'focus:ring-primary-500',
          'active:bg-primary-100'
        ],
        'secondary': [
          'bg-transparent text-gray-600 border border-gray-600',
          'hover:bg-gray-50 hover:border-gray-700',
          'focus:ring-gray-500',
          'active:bg-gray-100'
        ],
        'success': [
          'bg-transparent text-success-600 border border-success-600',
          'hover:bg-success-50 hover:border-success-700',
          'focus:ring-success-500',
          'active:bg-success-100'
        ],
        'warning': [
          'bg-transparent text-warning-600 border border-warning-600',
          'hover:bg-warning-50 hover:border-warning-700',
          'focus:ring-warning-500',
          'active:bg-warning-100'
        ],
        'danger': [
          'bg-transparent text-danger-600 border border-danger-600',
          'hover:bg-danger-50 hover:border-danger-700',
          'focus:ring-danger-500',
          'active:bg-danger-100'
        ],
        'info': [
          'bg-transparent text-info-600 border border-info-600',
          'hover:bg-info-50 hover:border-info-700',
          'focus:ring-info-500',
          'active:bg-info-100'
        ]
      }[color],
      
      variant === 'ghost' && {
        'primary': [
          'bg-transparent text-primary-600 border border-transparent',
          'hover:bg-primary-50 hover:border-primary-200',
          'focus:ring-primary-500',
          'active:bg-primary-100'
        ],
        'secondary': [
          'bg-transparent text-gray-600 border border-transparent',
          'hover:bg-gray-50 hover:border-gray-200',
          'focus:ring-gray-500',
          'active:bg-gray-100'
        ],
        'success': [
          'bg-transparent text-success-600 border border-transparent',
          'hover:bg-success-50 hover:border-success-200',
          'focus:ring-success-500',
          'active:bg-success-100'
        ],
        'warning': [
          'bg-transparent text-warning-600 border border-transparent',
          'hover:bg-warning-50 hover:border-warning-200',
          'focus:ring-warning-500',
          'active:bg-warning-100'
        ],
        'danger': [
          'bg-transparent text-danger-600 border border-transparent',
          'hover:bg-danger-50 hover:border-danger-200',
          'focus:ring-danger-500',
          'active:bg-danger-100'
        ],
        'info': [
          'bg-transparent text-info-600 border border-transparent',
          'hover:bg-info-50 hover:border-info-200',
          'focus:ring-info-500',
          'active:bg-info-100'
        ]
      }[color],
      
      variant === 'link' && {
        'primary': [
          'bg-transparent text-primary-600 border border-transparent',
          'hover:text-primary-700 hover:underline',
          'focus:ring-primary-500',
          'active:text-primary-800'
        ],
        'secondary': [
          'bg-transparent text-gray-600 border border-transparent',
          'hover:text-gray-700 hover:underline',
          'focus:ring-gray-500',
          'active:text-gray-800'
        ],
        'success': [
          'bg-transparent text-success-600 border border-transparent',
          'hover:text-success-700 hover:underline',
          'focus:ring-success-500',
          'active:text-success-800'
        ],
        'warning': [
          'bg-transparent text-warning-600 border border-transparent',
          'hover:text-warning-700 hover:underline',
          'focus:ring-warning-500',
          'active:text-warning-800'
        ],
        'danger': [
          'bg-transparent text-danger-600 border border-transparent',
          'hover:text-danger-700 hover:underline',
          'focus:ring-danger-500',
          'active:text-danger-800'
        ],
        'info': [
          'bg-transparent text-info-600 border border-transparent',
          'hover:text-info-700 hover:underline',
          'focus:ring-info-500',
          'active:text-info-800'
        ]
      }[color],
      
      className
    )

    const iconClasses = clsx(
      'flex-shrink-0',
      size === 'sm' && 'w-4 h-4',
      size === 'md' && 'w-5 h-5',
      size === 'lg' && 'w-6 h-6'
    )

    return (
      <button
        ref={ref}
        className={baseClasses}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg 
            className={clsx(iconClasses, 'animate-spin')} 
            fill="none" 
            viewBox="0 0 24 24"
          >
            <circle 
              className="opacity-25" 
              cx="12" 
              cy="12" 
              r="10" 
              stroke="currentColor" 
              strokeWidth="4"
            />
            <path 
              className="opacity-75" 
              fill="currentColor" 
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        
        {!loading && leftIcon && (
          <span className={iconClasses}>
            {leftIcon}
          </span>
        )}
        
        <span className={loading ? 'opacity-0' : ''}>
          {children}
        </span>
        
        {!loading && rightIcon && (
          <span className={iconClasses}>
            {rightIcon}
          </span>
        )}
      </button>
    )
  }
)

Button.displayName = 'Button'

// TouchTarget component for accessibility
export function TouchTarget({ children }: { children: React.ReactNode }) {
  return (
    <span className="absolute inset-0 -m-px rounded-lg" aria-hidden="true">
      {children}
    </span>
  )
}

// Button Group component
export function ButtonGroup({ 
  children, 
  className,
  vertical = false 
}: { 
  children: React.ReactNode
  className?: string
  vertical?: boolean 
}) {
  return (
    <div className={clsx(
      'inline-flex',
      vertical ? 'flex-col' : 'flex-row',
      className
    )}>
      {React.Children.map(children, (child, index) => {
        if (React.isValidElement(child) && typeof child.type === 'function') {
          return React.cloneElement(child as React.ReactElement<any>, {
            className: clsx(
              (child as React.ReactElement<any>).props.className,
              // Remove rounded corners for middle buttons
              index > 0 && !vertical && 'rounded-l-none',
              index < React.Children.count(children) - 1 && !vertical && 'rounded-r-none',
              index > 0 && vertical && 'rounded-t-none',
              index < React.Children.count(children) - 1 && vertical && 'rounded-b-none',
              // Add borders between buttons
              index > 0 && !vertical && 'border-l-0',
              index > 0 && vertical && 'border-t-0'
            )
          })
        }
        return child
      })}
    </div>
  )
}
