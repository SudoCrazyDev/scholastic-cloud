import React from 'react';
import { motion } from 'framer-motion';

interface RealtimeIndicatorProps {
  currentTime: Date;
  isFullscreen?: boolean;
}

export const RealtimeIndicator: React.FC<RealtimeIndicatorProps> = ({ currentTime, isFullscreen = false }) => {
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
        <div className={`text-gray-500 ${isFullscreen ? 'text-lg' : 'text-sm'}`}>
          {formatDate(currentTime)}
        </div>
        <div className={`font-mono font-semibold text-gray-900 ${isFullscreen ? 'text-2xl' : 'text-lg'}`}>
          {formatTime(currentTime)}
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <motion.div
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          className={`bg-green-500 rounded-full ${isFullscreen ? 'w-4 h-4' : 'w-3 h-3'}`}
        />
        <span className={`font-medium text-green-600 ${isFullscreen ? 'text-lg' : 'text-sm'}`}>
          LIVE
        </span>
      </div>
    </div>
  );
}; 