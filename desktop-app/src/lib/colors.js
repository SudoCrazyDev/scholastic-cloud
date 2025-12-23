/**
 * Color Palette Constants
 * 
 * Use these constants for consistent color usage throughout the application.
 * All colors are available as Tailwind CSS classes.
 */

export const colors = {
  // Primary Color
  primary: {
    light: 'blue-500',
    main: 'blue-600',    // #2563eb
    dark: 'blue-700',
    darker: 'blue-800',
  },

  // Secondary Colors
  secondary: 'gray-600',   // #4b5563
  success: 'green-600',    // #16a34a
  warning: 'yellow-500',   // #eab308
  danger: 'red-600',       // #dc2626
  info: 'cyan-600',        // #0891b2
};

/**
 * Tailwind class names for common color combinations
 */
export const colorClasses = {
  // Primary buttons
  primaryButton: 'bg-blue-600 hover:bg-blue-700 text-white',
  primaryButtonDisabled: 'bg-blue-400 text-white cursor-not-allowed',
  
  // Secondary buttons
  secondaryButton: 'bg-gray-600 hover:bg-gray-700 text-white',
  
  // Success
  successButton: 'bg-green-600 hover:bg-green-700 text-white',
  successText: 'text-green-600',
  successBg: 'bg-green-50',
  
  // Warning
  warningButton: 'bg-yellow-500 hover:bg-yellow-600 text-white',
  warningText: 'text-yellow-500',
  warningBg: 'bg-yellow-50',
  
  // Danger
  dangerButton: 'bg-red-600 hover:bg-red-700 text-white',
  dangerText: 'text-red-600',
  dangerBg: 'bg-red-50',
  
  // Info
  infoButton: 'bg-cyan-600 hover:bg-cyan-700 text-white',
  infoText: 'text-cyan-600',
  infoBg: 'bg-cyan-50',
  
  // Links
  link: 'text-blue-600 hover:text-blue-700 hover:underline',
};

