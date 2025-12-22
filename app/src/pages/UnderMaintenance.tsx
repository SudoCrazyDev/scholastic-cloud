import React from 'react';
import { motion } from 'framer-motion';

const UnderMaintenance: React.FC = () => {
  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: 'easeOut',
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.4, ease: 'easeOut' },
    },
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-2xl w-full text-center space-y-8"
      >
        {/* Maintenance Icon */}
        <motion.div variants={itemVariants}>
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="mx-auto h-24 w-24 bg-indigo-600 rounded-full flex items-center justify-center shadow-lg"
          >
            <svg
              className="h-12 w-12 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </motion.div>
        </motion.div>

        {/* Title */}
        <motion.div variants={itemVariants}>
          <h1 className="text-5xl font-extrabold text-gray-900 mb-4">
            Under Maintenance
          </h1>
          <p className="text-xl text-gray-600 mb-2">
            We're currently performing scheduled maintenance
          </p>
        </motion.div>

        {/* Description */}
        <motion.div variants={itemVariants} className="bg-white rounded-lg shadow-lg p-8">
          <p className="text-gray-700 text-lg leading-relaxed mb-6">
            We apologize for the inconvenience. Our system is currently undergoing maintenance
            to improve your experience. We'll be back online shortly.
          </p>
          
          <div className="border-t border-gray-200 pt-6 mt-6">
            <p className="text-sm text-gray-500">
              If you have any urgent concerns, please contact our support team.
            </p>
          </div>
        </motion.div>

        {/* Animated Dots */}
        <motion.div variants={itemVariants} className="flex justify-center space-x-2">
          {[0, 1, 2].map((index) => (
            <motion.div
              key={index}
              className="w-3 h-3 bg-indigo-600 rounded-full"
              animate={{
                y: [0, -10, 0],
                opacity: [0.5, 1, 0.5],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: index * 0.2,
                ease: 'easeInOut',
              }}
            />
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
};

export default UnderMaintenance;

