import { motion } from "framer-motion";
import { Database } from "lucide-react";

/**
 * Floating Action Button for Debug Database modal
 * Only visible in development mode
 */
export function Fab({ onClick }) {
  const isDev = import.meta.env.DEV;

  if (!isDev) {
    return null;
  }

  return (
    <motion.button
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="fixed bottom-6 right-6 z-50 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-shadow duration-200 flex items-center justify-center"
      aria-label="Open Debug Database"
      title="Debug Database"
    >
      <Database className="w-6 h-6" />
    </motion.button>
  );
}

