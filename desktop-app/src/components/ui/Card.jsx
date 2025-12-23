import { cn } from "@/lib/utils";

/**
 * Card container component.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children - Card content.
 * @param {string} [props.className] - Additional Tailwind classes.
 */
export function Card({ children, className }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-gray-200 bg-white p-8 shadow-lg shadow-blue-600/5",
        className,
      )}
    >
      {children}
    </div>
  );
}


