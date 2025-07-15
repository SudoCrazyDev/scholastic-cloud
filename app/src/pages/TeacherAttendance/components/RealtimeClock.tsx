import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';

interface RealtimeClockProps {
  isFullscreen?: boolean;
  currentTime?: Date; // Optional external time prop
  onTimeUpdate?: (currentTime: Date) => void;
}

export const RealtimeClock: React.FC<RealtimeClockProps> = ({ 
  isFullscreen = false, 
  currentTime: externalTime,
  onTimeUpdate 
}) => {
  const [internalTime, setInternalTime] = useState(new Date());
  
  // Use external time if provided, otherwise use internal time
  const currentTime = externalTime || internalTime;

  // Memoize the formatted time and date to prevent unnecessary re-renders
  const formattedTime = useMemo(() => {
    return currentTime.toLocaleTimeString('en-US', {
      hour12: true,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }, [currentTime]);

  const formattedDate = useMemo(() => {
    return currentTime.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, [currentTime]);

  // Memoize the time update function to prevent unnecessary re-renders
  const updateTime = useCallback(() => {
    const newTime = new Date();
    setInternalTime(newTime);
    onTimeUpdate?.(newTime);
  }, [onTimeUpdate]);

  // Set up the timer to update every second (only if no external time is provided)
  useEffect(() => {
    if (externalTime) {
      // If external time is provided, don't set up internal timer
      return;
    }
    
    const timer = setInterval(updateTime, 1000);
    
    // Initial update
    updateTime();
    
    return () => clearInterval(timer);
  }, [updateTime, externalTime]);

  return (
    <div className="flex items-center space-x-3">
      <div className="text-right">
        <div className={`text-gray-500 ${isFullscreen ? 'text-lg' : 'text-sm'}`}>
          {formattedDate}
        </div>
        <div className={`font-mono font-semibold text-gray-900 ${isFullscreen ? 'text-2xl' : 'text-lg'}`}>
          {formattedTime}
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <motion.div
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
          className={`bg-green-500 rounded-full ${isFullscreen ? 'w-4 h-4' : 'w-3 h-3'}`}
        />
        <span className={`font-medium text-green-600 ${isFullscreen ? 'text-lg' : 'text-sm'}`}>
          LIVE
        </span>
      </div>
    </div>
  );
}; 