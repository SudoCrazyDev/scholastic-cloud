import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { AttendancePerson } from '../../../services/attendanceService';
import { getTeacherStatus } from '../../../utils/attendanceUtils';

interface AttendanceListProps {
  attendanceData: AttendancePerson[];
  totalCount: number;
  isLoading: boolean;
  error: any;
  currentTime: Date;
  isFullscreen?: boolean;
  statusFilter?: 'all' | 'present' | 'late' | 'on_break' | 'checked_out' | 'no_scan';
}

type SortOrder = 'asc' | 'desc' | 'none';

const AttendanceList: React.FC<AttendanceListProps> = ({
  attendanceData,
  totalCount,
  isLoading,
  error,
  currentTime,
  isFullscreen = false,
  statusFilter = 'all',
}) => {
  const [sortOrder, setSortOrder] = useState<SortOrder>('none');

  const sortedAttendanceData = useMemo(() => {
    if (sortOrder === 'none') return attendanceData;

    return [...attendanceData].sort((a, b) => {
      const aCheckIn = a.entries.find(entry => entry['check-in'])?.['check-in'];
      const bCheckIn = b.entries.find(entry => entry['check-in'])?.['check-in'];

      // Handle cases where check-in time is missing
      if (!aCheckIn && !bCheckIn) return 0;
      if (!aCheckIn) return 1; // Put entries without check-in at the end
      if (!bCheckIn) return -1;

      // Convert time strings to minutes for comparison (format: "7:30am", "8:15am", etc.)
      const parseTimeToMinutes = (timeStr: string) => {
        const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})(am|pm)$/i);
        if (!timeMatch) return 0;
        
        let hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const period = timeMatch[3].toLowerCase();
        
        // Convert to 24-hour format
        if (period === 'pm' && hours !== 12) {
          hours += 12;
        } else if (period === 'am' && hours === 12) {
          hours = 0;
        }
        
        return hours * 60 + minutes;
      };

      const aMinutes = parseTimeToMinutes(aCheckIn);
      const bMinutes = parseTimeToMinutes(bCheckIn);

      return sortOrder === 'asc' ? aMinutes - bMinutes : bMinutes - aMinutes;
    });
  }, [attendanceData, sortOrder]);

  const handleSortToggle = () => {
    setSortOrder(prev => {
      if (prev === 'none') return 'asc';
      if (prev === 'asc') return 'desc';
      return 'none';
    });
  };

  const getSortIcon = () => {
    switch (sortOrder) {
      case 'asc':
        return (
          <svg className={`${isFullscreen ? 'w-6 h-6' : 'w-4 h-4'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        );
      case 'desc':
        return (
          <svg className={`${isFullscreen ? 'w-6 h-6' : 'w-4 h-4'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        );
      default:
        return (
          <svg className={`text-gray-400 ${isFullscreen ? 'w-6 h-6' : 'w-4 h-4'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6">
          <div className="animate-pulse space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Attendance</h3>
          <p className="text-gray-600">{error.message || 'Failed to load attendance data'}</p>
        </div>
      </div>
    );
  }

  if (!attendanceData || attendanceData.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Attendance Data</h3>
          <p className="text-gray-600">No attendance records found for today.</p>
        </div>
      </div>
    );
  }

  const getStatusColor = (entries: any[]) => {
    const status = getTeacherStatus(entries);
    
    switch (status) {
      case 'checked_out':
        return 'bg-green-100 text-green-800';
      case 'on_break':
        return 'bg-yellow-100 text-yellow-800';
      case 'present':
        return 'bg-blue-100 text-blue-800';
      case 'late':
        return 'bg-orange-100 text-orange-800';
      case 'no_scan':
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (entries: any[]) => {
    const status = getTeacherStatus(entries);
    
    switch (status) {
      case 'checked_out':
        return 'Checked Out';
      case 'on_break':
        return 'On Break';
      case 'present':
        return 'Present';
      case 'late':
        return 'Late';
      case 'no_scan':
      default:
        return 'Not Checked In';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className={`font-medium text-gray-900 ${isFullscreen ? 'text-2xl' : 'text-lg'}`}>
              Today's Attendance
              {statusFilter !== 'all' && (
                <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  Filtered: {statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1).replace('_', ' ')}
                </span>
              )}
            </h3>
            <p className={`text-gray-600 ${isFullscreen ? 'text-lg' : 'text-sm'}`}>
              Last updated: {currentTime.toLocaleTimeString()}
              {statusFilter !== 'all' && (
                <span className="ml-2 text-blue-600">
                  Showing {attendanceData.length} of {totalCount} teachers
                </span>
              )}
            </p>
          </div>
          <button
            onClick={handleSortToggle}
            className={`flex items-center space-x-2 px-3 py-2 font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors duration-150 ${
              isFullscreen ? 'text-lg px-4 py-3' : 'text-sm'
            }`}
          >
            <span>Sort by Check-in</span>
            {getSortIcon()}
          </button>
        </div>
      </div>
      <div className="divide-y divide-gray-200">
        {sortedAttendanceData.map((person, index) => (
          <motion.div
            key={person.person_name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className={`hover:bg-gray-50 transition-colors duration-150 ${
              isFullscreen ? 'p-8' : 'p-6'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className={`bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center ${
                  isFullscreen ? 'w-16 h-16' : 'w-12 h-12'
                }`}>
                  <span className={`text-white font-semibold ${isFullscreen ? 'text-xl' : 'text-sm'}`}>
                    {person.person_name.split(' ').map(n => n[0]).join('').toUpperCase()}
                  </span>
                </div>
                <div>
                  <h4 className={`font-medium text-gray-900 ${isFullscreen ? 'text-2xl' : 'text-lg'}`}>
                    {person.person_name}
                  </h4>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-medium ${getStatusColor(person.entries)} ${
                    isFullscreen ? 'text-lg' : 'text-xs'
                  }`}>
                    {getStatusText(person.entries)}
                  </span>
                </div>
              </div>
              
              <div className="flex items-center space-x-6">
                {/* Check-in Time */}
                <div className="text-center">
                  <div className={`font-medium text-gray-500 uppercase tracking-wide ${isFullscreen ? 'text-lg' : 'text-xs'}`}>
                    Check-in
                  </div>
                  <div className={`font-semibold text-gray-900 ${isFullscreen ? 'text-xl' : 'text-sm'}`}>
                    {person.entries.find(entry => entry['check-in'])?.['check-in'] || '--'}
                  </div>
                </div>

                {/* Break-out Time */}
                <div className="text-center">
                  <div className={`font-medium text-gray-500 uppercase tracking-wide ${isFullscreen ? 'text-lg' : 'text-xs'}`}>
                    Break-out
                  </div>
                  <div className={`font-semibold text-gray-900 ${isFullscreen ? 'text-xl' : 'text-sm'}`}>
                    {person.entries.find(entry => entry['break-out'])?.['break-out'] || '--'}
                  </div>
                </div>

                {/* Break-in Time */}
                <div className="text-center">
                  <div className={`font-medium text-gray-500 uppercase tracking-wide ${isFullscreen ? 'text-lg' : 'text-xs'}`}>
                    Break-in
                  </div>
                  <div className={`font-semibold text-gray-900 ${isFullscreen ? 'text-xl' : 'text-sm'}`}>
                    {person.entries.find(entry => entry['break-in'])?.['break-in'] || '--'}
                  </div>
                </div>

                {/* Check-out Time */}
                <div className="text-center">
                  <div className={`font-medium text-gray-500 uppercase tracking-wide ${isFullscreen ? 'text-lg' : 'text-xs'}`}>
                    Check-out
                  </div>
                  <div className={`font-semibold text-gray-900 ${isFullscreen ? 'text-xl' : 'text-sm'}`}>
                    {person.entries.find(entry => entry['check-out'])?.['check-out'] || '--'}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default AttendanceList; 