/**
 * Tailwind CSS Configuration
 * 
 * Color Palette:
 * - Primary: blue-600 (#2563eb) - Use for primary actions, links, and accents
 * - Secondary: gray-600 (#4b5563)
 * - Success: green-600 (#16a34a)
 * - Warning: yellow-500 (#eab308)
 * - Danger: red-600 (#dc2626)
 * - Info: cyan-600 (#0891b2)
 * 
 * @type {import('tailwindcss').Config}
 */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Custom colors are already available via Tailwind's default palette
      // Use: blue-600, gray-600, green-600, yellow-500, red-600, cyan-600
    },
  },
  plugins: [],
}

