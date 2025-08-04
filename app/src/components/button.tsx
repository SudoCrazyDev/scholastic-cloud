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
          'bg-blue-600 text-white border border-blue-600',
          'hover:bg-blue-700 hover:border-blue-700',
          'focus:ring-blue-500',
          'active:bg-blue-800'
        ],
        'secondary': [
          'bg-gray-600 text-white border border-gray-600',
          'hover:bg-gray-700 hover:border-gray-700',
          'focus:ring-gray-500',
          'active:bg-gray-800'
        ],
        'success': [
          'bg-green-600 text-white border border-green-600',
          'hover:bg-green-700 hover:border-green-700',
          'focus:ring-green-500',
          'active:bg-green-800'
        ],
        'warning': [
          'bg-yellow-500 text-white border border-yellow-500',
          'hover:bg-yellow-600 hover:border-yellow-600',
          'focus:ring-yellow-500',
          'active:bg-yellow-700'
        ],
        'danger': [
          'bg-red-600 text-white border border-red-600',
          'hover:bg-red-700 hover:border-red-700',
          'focus:ring-red-500',
          'active:bg-red-800'
        ],
        'info': [
          'bg-cyan-600 text-white border border-cyan-600',
          'hover:bg-cyan-700 hover:border-cyan-700',
          'focus:ring-cyan-500',
          'active:bg-cyan-800'
        ]
      }[color],
      
      variant === 'outline' && {
        'primary': [
          'bg-transparent text-blue-600 border border-blue-600',
          'hover:bg-blue-50 hover:border-blue-700',
          'focus:ring-blue-500',
          'active:bg-blue-100'
        ],
        'secondary': [
          'bg-transparent text-gray-600 border border-gray-600',
          'hover:bg-gray-50 hover:border-gray-700',
          'focus:ring-gray-500',
          'active:bg-gray-100'
        ],
        'success': [
          'bg-transparent text-green-600 border border-green-600',
          'hover:bg-green-50 hover:border-green-700',
          'focus:ring-green-500',
          'active:bg-green-100'
        ],
        'warning': [
          'bg-transparent text-yellow-600 border border-yellow-600',
          'hover:bg-yellow-50 hover:border-yellow-700',
          'focus:ring-yellow-500',
          'active:bg-yellow-100'
        ],
        'danger': [
          'bg-transparent text-red-600 border border-red-600',
          'hover:bg-red-50 hover:border-red-700',
          'focus:ring-red-500',
          'active:bg-red-100'
        ],
        'info': [
          'bg-transparent text-cyan-600 border border-cyan-600',
          'hover:bg-cyan-50 hover:border-cyan-700',
          'focus:ring-cyan-500',
          'active:bg-cyan-100'
        ]
      }[color],
      
      variant === 'ghost' && {
        'primary': [
          'bg-transparent text-blue-600 border border-transparent',
          'hover:bg-blue-50 hover:border-blue-200',
          'focus:ring-blue-500',
          'active:bg-blue-100'
        ],
        'secondary': [
          'bg-transparent text-gray-600 border border-transparent',
          'hover:bg-gray-50 hover:border-gray-200',
          'focus:ring-gray-500',
          'active:bg-gray-100'
        ],
        'success': [
          'bg-transparent text-green-600 border border-transparent',
          'hover:bg-green-50 hover:border-green-200',
          'focus:ring-green-500',
          'active:bg-green-100'
        ],
        'warning': [
          'bg-transparent text-yellow-600 border border-transparent',
          'hover:bg-yellow-50 hover:border-yellow-200',
          'focus:ring-yellow-500',
          'active:bg-yellow-100'
        ],
        'danger': [
          'bg-transparent text-red-600 border border-transparent',
          'hover:bg-red-50 hover:border-red-200',
          'focus:ring-red-500',
          'active:bg-red-100'
        ],
        'info': [
          'bg-transparent text-cyan-600 border border-transparent',
          'hover:bg-cyan-50 hover:border-cyan-200',
          'focus:ring-cyan-500',
          'active:bg-cyan-100'
        ]
      }[color],
      
      variant === 'link' && {
        'primary': [
          'bg-transparent text-blue-600 border border-transparent',
          'hover:text-blue-700 hover:underline',
          'focus:ring-blue-500',
          'active:text-blue-800'
        ],
        'secondary': [
          'bg-transparent text-gray-600 border border-transparent',
          'hover:text-gray-700 hover:underline',
          'focus:ring-gray-500',
          'active:text-gray-800'
        ],
        'success': [
          'bg-transparent text-green-600 border border-transparent',
          'hover:text-green-700 hover:underline',
          'focus:ring-green-500',
          'active:text-green-800'
        ],
        'warning': [
          'bg-transparent text-yellow-600 border border-transparent',
          'hover:text-yellow-700 hover:underline',
          'focus:ring-yellow-500',
          'active:text-yellow-800'
        ],
        'danger': [
          'bg-transparent text-red-600 border border-transparent',
          'hover:text-red-700 hover:underline',
          'focus:ring-red-500',
          'active:text-red-800'
        ],
        'info': [
          'bg-transparent text-cyan-600 border border-transparent',
          'hover:text-cyan-700 hover:underline',
          'focus:ring-cyan-500',
          'active:text-cyan-800'
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
