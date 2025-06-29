import React from 'react';
import { Heading } from '../components/heading'; // Assuming this component exists
import { Text } from '../components/text'; // Assuming this component exists
import { motion } from 'framer-motion';

const DashboardPage: React.FC = () => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <Heading level={1}>Dashboard</Heading>
      <Text>Welcome to your dashboard. This area is currently under construction.</Text>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Example placeholder cards */}
        {[1, 2, 3].map((item) => (
          <motion.div
            key={item}
            className="bg-white dark:bg-zinc-800 shadow-lg rounded-lg p-6"
            whileHover={{ scale: 1.03 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <Heading level={3} className="text-lg font-semibold text-gray-900 dark:text-white">
              Placeholder Card {item}
            </Heading>
            <Text className="mt-2 text-gray-600 dark:text-gray-300">
              More content will be available here soon.
            </Text>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};

export default DashboardPage;
