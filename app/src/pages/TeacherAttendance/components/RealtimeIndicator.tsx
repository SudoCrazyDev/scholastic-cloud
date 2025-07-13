import React from 'react';
import { motion } from 'framer-motion';

interface RealtimeIndicatorProps {
  currentTime: Date;
}

export const RealtimeIndicator: React.FC<RealtimeIndicatorProps> = ({ currentTime }) => {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: true,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="flex items-center space-x-3">
      <div className="text-right">
        <div className="text-sm text-gray-500">{formatDate(currentTime)}</div>
        <div className="text-lg font-mono font-semibold text-gray-900">
          {formatTime(currentTime)}
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <motion.div
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-3 h-3 bg-green-500 rounded-full"
        />
        <span className="text-sm font-medium text-green-600">LIVE</span>
      </div>
    </div>
  );
}; 