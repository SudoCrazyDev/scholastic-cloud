import React from 'react';
import { motion } from 'framer-motion';

interface AttendanceHeaderProps {
  selectedFilter: 'all' | 'present' | 'absent' | 'late' | 'on_break' | 'checked_out' | 'no_scan';
  onFilterChange: (filter: 'all' | 'present' | 'absent' | 'late' | 'on_break' | 'checked_out' | 'no_scan') => void;
  totalTeachers: number;
  filteredCount: number;
  currentTime: Date;
  compactMode?: boolean;
  onCompactModeChange?: (compact: boolean) => void;
}

export const AttendanceHeader: React.FC<AttendanceHeaderProps> = ({
  selectedFilter,
  onFilterChange,
  totalTeachers,
  filteredCount,
  currentTime,
  compactMode = false,
  onCompactModeChange,
}) => {
  const filters = [
    { key: 'all' as const, label: 'All Teachers', color: 'bg-gray-100 text-gray-700 hover:bg-gray-200' },
    { key: 'present' as const, label: 'Present', color: 'bg-green-100 text-green-700 hover:bg-green-200' },
    { key: 'absent' as const, label: 'Absent', color: 'bg-red-100 text-red-700 hover:bg-red-200' },
    { key: 'late' as const, label: 'Late', color: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' },
    { key: 'on_break' as const, label: 'On Break', color: 'bg-orange-100 text-orange-700 hover:bg-orange-200' },
    { key: 'checked_out' as const, label: 'Checked Out', color: 'bg-gray-100 text-gray-700 hover:bg-gray-200' },
    { key: 'no_scan' as const, label: 'No Scan', color: 'bg-purple-100 text-purple-700 hover:bg-purple-200' },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'present':
        return 'text-green-600 bg-green-50';
      case 'absent':
        return 'text-red-600 bg-red-50';
      case 'late':
        return 'text-yellow-600 bg-yellow-50';
      case 'on_break':
        return 'text-orange-600 bg-orange-50';
      case 'checked_out':
        return 'text-gray-600 bg-gray-50';
      case 'no_scan':
        return 'text-purple-600 bg-purple-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
        {/* Left side - Summary */}
        <div className="flex items-center space-x-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Teacher Attendance</h2>
            <p className="text-sm text-gray-600">
              Showing {filteredCount} of {totalTeachers} teachers
            </p>
          </div>
          
          {/* Current Filter Badge */}
          {selectedFilter !== 'all' && (
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(selectedFilter)}`}>
              {filters.find(f => f.key === selectedFilter)?.label}
            </div>
          )}
        </div>

        {/* Right side - Controls */}
        <div className="flex items-center space-x-4">
          {/* Compact Mode Toggle */}
          {onCompactModeChange && (
            <button
              onClick={() => onCompactModeChange(!compactMode)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
                compactMode
                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              title={compactMode ? 'Switch to Detailed View' : 'Switch to Compact View'}
            >
              {compactMode ? 'Detailed' : 'Compact'}
            </button>
          )}

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            {filters.map((filter) => (
              <motion.button
                key={filter.key}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onFilterChange(filter.key)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
                  selectedFilter === filter.key
                    ? filter.color
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {filter.label}
              </motion.button>
            ))}
          </div>
        </div>
      </div>

      {/* Additional Info */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex flex-wrap items-center justify-between text-sm text-gray-600">
          <div className="flex items-center space-x-4">
            <span>
              <span className="font-medium">Last Updated:</span>{' '}
              {currentTime.toLocaleTimeString('en-US', {
                hour12: true,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
            <span>
              <span className="font-medium">Date:</span>{' '}
              {currentTime.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="font-medium text-green-600">Live Updates</span>
          </div>
        </div>
      </div>
    </div>
  );
}; 