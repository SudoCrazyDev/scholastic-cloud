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
  className,
  disabled,
  type = "button",
  ...props
}) {
  const baseClasses =
    "inline-flex items-center justify-center rounded-lg text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none shadow-sm";

  const variants = {
    primary: "bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-blue-600/20 hover:shadow-md hover:shadow-blue-600/30 focus-visible:ring-blue-600",
    secondary: "bg-gray-600 hover:bg-gray-700 active:bg-gray-800 text-white shadow-gray-600/20 hover:shadow-md hover:shadow-gray-600/30 focus-visible:ring-gray-600",
    ghost: "bg-transparent hover:bg-gray-100 active:bg-gray-200 text-gray-700 hover:text-gray-900 focus-visible:ring-gray-600",
  };

  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(baseClasses, variants[variant], className)}
      {...props}
    >
      {children}
    </button>
  );
}


