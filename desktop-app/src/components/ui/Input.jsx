import { cn } from "@/lib/utils";

/**
 * Text input component.
 *
 * @param {object} props
 * @param {string} [props.label] - Optional label text.
 * @param {string} [props.error] - Optional error message.
 * @param {string} [props.type="text"] - Input type.
 * @param {string} [props.className] - Additional Tailwind classes.
 */
export function Input({ label, error, type = "text", className, ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-semibold text-gray-700 mb-1.5 block">
          {label}
        </label>
      )}
      <input
        type={type}
        className={cn(
          "w-full rounded-lg border bg-white px-4 py-3 text-sm text-gray-900 transition-all duration-200 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
          error
            ? "border-red-600 focus-visible:border-red-600 focus-visible:ring-red-600"
            : "border-gray-300 focus-visible:border-blue-600 focus-visible:ring-blue-600",
          className,
        )}
        {...props}
      />
      {error && (
        <p className="text-xs font-medium text-red-600 mt-1 flex items-center gap-1">
          <span>⚠</span>
          {error}
        </p>
      )}
    </div>
  );
}


