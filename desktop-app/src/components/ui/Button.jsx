import { cn } from "@/lib/utils";

/**
 * Primary button component.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children - Button content.
 * @param {"primary" | "secondary" | "ghost"} [props.variant="primary"] - Visual style of the button.
 * @param {string} [props.className] - Additional Tailwind classes.
 * @param {boolean} [props.disabled] - Disabled state.
 * @param {() => void} [props.onClick] - Click handler.
 * @param {string} [props.type="button"] - Button type.
 */
export function Button({
  children,
  variant = "primary",
  color = "primary",
  size = "md",
  className,
  disabled,
  type = "button",
  onClick,
  ...props
}) {
  const baseClasses =
    "inline-flex items-center justify-center rounded-lg font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none shadow-sm";

  const sizeClasses = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };

  const variants = {
    primary: "bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-blue-600/20 hover:shadow-md hover:shadow-blue-600/30 focus-visible:ring-blue-600",
    secondary: "bg-gray-600 hover:bg-gray-700 active:bg-gray-800 text-white shadow-gray-600/20 hover:shadow-md hover:shadow-gray-600/30 focus-visible:ring-gray-600",
    ghost: "bg-transparent hover:bg-gray-100 active:bg-gray-200 text-gray-700 hover:text-gray-900 focus-visible:ring-gray-600",
    outline: "bg-transparent border-2 border-blue-600 text-blue-600 hover:bg-blue-50 active:bg-blue-100 focus-visible:ring-blue-600",
    solid: "bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-blue-600/20 hover:shadow-md hover:shadow-blue-600/30 focus-visible:ring-blue-600",
  };

  // Use variant prop, fallback to color if variant not recognized
  const variantClass = variants[variant] || variants[color] || variants.primary;

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(baseClasses, sizeClasses[size], variantClass, className)}
      {...props}
    >
      {children}
    </button>
  );
}


