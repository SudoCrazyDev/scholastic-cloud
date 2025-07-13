import React from 'react';
import { motion } from 'framer-motion';
import type { AttendanceStats } from '../../../types';

interface AttendanceStatsCardProps {
  stats?: AttendanceStats;
  isLoading: boolean;
  error: any;
  currentTime: Date;
}

export const AttendanceStatsCard: React.FC<AttendanceStatsCardProps> = ({
  stats,
  isLoading,
  error,
  currentTime,
}) => {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: true,
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const statsData = [
    {
      id: 'total',
      name: 'Total Teachers',
      value: stats?.total_teachers || 0,
      change: '',
      changeType: 'neutral' as const,
      color: 'bg-blue-50 text-blue-600',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      id: 'present',
      name: 'Present Today',
      value: stats?.present_today || 0,
      change: '',
      changeType: 'positive' as const,
      color: 'bg-green-50 text-green-600',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      id: 'absent',
      name: 'Absent Today',
      value: stats?.absent_today || 0,
      change: '',
      changeType: 'negative' as const,
      color: 'bg-red-50 text-red-600',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      ),
    },
    {
      id: 'late',
      name: 'Late Today',
      value: stats?.late_today || 0,
      change: '',
      changeType: 'warning' as const,
      color: 'bg-yellow-50 text-yellow-600',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      id: 'on_break',
      name: 'On Break',
      value: stats?.on_break || 0,
      change: '',
      changeType: 'neutral' as const,
      color: 'bg-orange-50 text-orange-600',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      id: 'checked_out',
      name: 'Checked Out',
      value: stats?.checked_out || 0,
      change: '',
      changeType: 'neutral' as const,
      color: 'bg-gray-50 text-gray-600',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
      ),
    },
    {
      id: 'no_scan',
      name: 'No Scan Yet',
      value: stats?.no_scan_yet || 0,
      change: '',
      changeType: 'warning' as const,
      color: 'bg-purple-50 text-purple-600',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      ),
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {Array.from({ length: 7 }).map((_, index) => (
          <div key={index} className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 animate-pulse">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded w-20"></div>
                <div className="h-8 bg-gray-200 rounded w-12"></div>
              </div>
              <div className="w-12 h-12 bg-gray-200 rounded-lg"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6">
        <div className="flex items-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mr-4">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-medium text-red-800">Error Loading Attendance Stats</h3>
            <p className="text-red-600 mt-1">Failed to load attendance statistics. Please try again.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Current Time Display */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Current Time</h2>
            <p className="text-indigo-100 text-sm">Last updated</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-mono font-bold">{formatTime(currentTime)}</div>
            <div className="text-indigo-100 text-sm">
              {currentTime.toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {statsData.map((stat) => (
          <motion.div
            key={stat.id}
            whileHover={{ y: -2, scale: 1.02 }}
            className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 cursor-pointer transition-all duration-200"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">{stat.name}</p>
                <p className="text-xl font-bold text-gray-900">{stat.value}</p>
              </div>
              <div className={`p-2 rounded-lg ${stat.color}`}>
                {stat.icon}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}; 