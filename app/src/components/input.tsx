import React, { forwardRef } from 'react'
import clsx from 'clsx'

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  error?: string
  label?: string
  helperText?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  variant?: 'default' | 'filled' | 'outlined'
  size?: 'sm' | 'md' | 'lg'
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ 
    className, 
    error, 
    label, 
    helperText, 
    leftIcon, 
    rightIcon, 
    variant = 'default',
    size = 'md',
    disabled,
    ...props 
  }, ref) => {
    const inputId = props.id || `input-${Math.random().toString(36).substr(2, 9)}`
    
    const inputClasses = clsx(
      // Base styles
      'w-full transition-all duration-200 ease-in-out',
      'border border-gray-300 rounded-lg',
      'bg-white text-gray-900',
      'placeholder:text-gray-400',
      'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      'hover:border-gray-400',
      
      // Variant styles
      variant === 'filled' && [
        'bg-gray-50 border-gray-200',
        'focus:bg-white focus:border-blue-500',
        'hover:bg-gray-100'
      ],
      variant === 'outlined' && [
        'bg-transparent border-gray-300',
        'focus:border-blue-500',
        'hover:border-gray-400'
      ],
      
      // Size styles
      size === 'sm' && 'px-3 py-2 text-sm',
      size === 'md' && 'px-4 py-2.5 text-base',
      size === 'lg' && 'px-4 py-3 text-lg',
      
      // Icon padding
      leftIcon && (size === 'sm' ? 'pl-10' : size === 'lg' ? 'pl-12' : 'pl-11'),
      rightIcon && (size === 'sm' ? 'pr-10' : size === 'lg' ? 'pr-12' : 'pr-11'),
      
      // Error state
      error && [
        'border-red-300 text-red-900',
        'focus:border-red-500 focus:ring-red-500',
        'hover:border-red-400',
        'placeholder:text-red-300'
      ],
      
      className
    )

    const iconClasses = clsx(
      'absolute top-1/2 -translate-y-1/2 text-gray-400',
      'pointer-events-none transition-colors duration-200',
      size === 'sm' && 'w-4 h-4',
      size === 'md' && 'w-5 h-5',
      size === 'lg' && 'w-6 h-6'
    )

    return (
      <div className="w-full">
        {label && (
          <label 
            htmlFor={inputId}
            className={clsx(
              'block text-sm font-medium text-gray-700 mb-2',
              error && 'text-red-700'
            )}
          >
            {label}
          </label>
        )}
        
        <div className="relative">
          {leftIcon && (
            <div className={clsx(iconClasses, 'left-3')}>
              {leftIcon}
            </div>
          )}
          
          <input
            ref={ref}
            id={inputId}
            className={inputClasses}
            disabled={disabled}
            {...props}
          />
          
          {rightIcon && (
            <div className={clsx(iconClasses, 'right-3')}>
              {rightIcon}
            </div>
          )}
        </div>
        
        {(error || helperText) && (
          <div className="mt-2">
            {error && (
              <p className="text-sm text-red-600 flex items-center gap-1">
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {error}
              </p>
            )}
            {helperText && !error && (
              <p className="text-sm text-gray-500">{helperText}</p>
            )}
          </div>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

// InputGroup component for grouped inputs
export function InputGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('flex', className)}>
      {children}
    </div>
  )
}

// InputGroupItem for items within InputGroup
export function InputGroupItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('flex-1', className)}>
      {children}
    </div>
  )
}
