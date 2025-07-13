import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useCheckIn, useCheckOut, useBreakOut, useBreakIn } from '../../../hooks/useAttendance';
import type { TeacherAttendanceSummary } from '../../../types';

interface TeacherAttendanceGridProps {
  teachers: TeacherAttendanceSummary[];
  isLoading: boolean;
  error: any;
  institutionId: string;
  compact?: boolean;
  onPageChange?: (page: number) => void;
  currentPage?: number;
  totalPages?: number;
}

export const TeacherAttendanceGrid: React.FC<TeacherAttendanceGridProps> = ({
  teachers,
  isLoading,
  error,
  institutionId,
  compact = false,
  onPageChange,
  currentPage = 1,
  totalPages = 1,
}) => {
  const [selectedTeacher, setSelectedTeacher] = useState<string | null>(null);
  
  const checkInMutation = useCheckIn();
  const checkOutMutation = useCheckOut();
  const breakOutMutation = useBreakOut();
  const breakInMutation = useBreakIn();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'present':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'absent':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'late':
        return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'on_break':
        return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'checked_out':
        return 'bg-gray-50 text-gray-700 border-gray-200';
      case 'no_scan':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'present':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'absent':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
      case 'late':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'on_break':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'checked_out':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        );
      case 'no_scan':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        );
      default:
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        );
    }
  };

  const formatTime = (timeString?: string) => {
    if (!timeString) return '--:--';
    return new Date(timeString).toLocaleTimeString('en-US', {
      hour12: true,
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleAction = async (action: 'check-in' | 'check-out' | 'break-out' | 'break-in', userId: string) => {
    try {
      switch (action) {
        case 'check-in':
          await checkInMutation.mutateAsync({ userId, institutionId });
          break;
        case 'check-out':
          await checkOutMutation.mutateAsync({ userId, institutionId });
          break;
        case 'break-out':
          await breakOutMutation.mutateAsync({ userId, institutionId });
          break;
        case 'break-in':
          await breakInMutation.mutateAsync({ userId, institutionId });
          break;
      }
    } catch (error) {
      console.error('Action failed:', error);
    }
  };

  const getAvailableActions = (teacher: TeacherAttendanceSummary) => {
    const actions = [];
    
    switch (teacher.status) {
      case 'no_scan':
        actions.push({ key: 'check-in', label: 'Check In', color: 'bg-green-500 hover:bg-green-600' });
        break;
      case 'present':
        actions.push(
          { key: 'break-out', label: 'Break Out', color: 'bg-orange-500 hover:bg-orange-600' },
          { key: 'check-out', label: 'Check Out', color: 'bg-gray-500 hover:bg-gray-600' }
        );
        break;
      case 'on_break':
        actions.push({ key: 'break-in', label: 'Break In', color: 'bg-blue-500 hover:bg-blue-600' });
        break;
    }
    
    return actions;
  };

  if (isLoading) {
    const gridCols = compact ? 'grid-cols-2 md:grid-cols-4 lg:grid-cols-6' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
    return (
      <div className={`grid ${gridCols} gap-4`}>
        {Array.from({ length: compact ? 12 : 6 }).map((_, index) => (
          <div key={index} className={`bg-white rounded-xl shadow-sm border border-gray-200 animate-pulse ${compact ? 'p-3' : 'p-6'}`}>
            <div className={`flex items-center space-x-3 ${compact ? 'mb-2' : 'mb-4'}`}>
              <div className={`bg-gray-200 rounded-full ${compact ? 'w-8 h-8' : 'w-12 h-12'}`}></div>
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-200 rounded w-3/4"></div>
                <div className="h-2 bg-gray-200 rounded w-1/2"></div>
              </div>
            </div>
            {!compact && (
              <div className="space-y-2">
                <div className="h-3 bg-gray-200 rounded"></div>
                <div className="h-3 bg-gray-200 rounded w-2/3"></div>
              </div>
            )}
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
            <h3 className="text-lg font-medium text-red-800">Error Loading Teachers</h3>
            <p className="text-red-600 mt-1">Failed to load teacher attendance data. Please try again.</p>
          </div>
        </div>
      </div>
    );
  }

  const gridCols = compact ? 'grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';

  return (
    <div className="space-y-6">
      <div className={`grid ${gridCols} gap-4`}>
        {teachers.map((teacher) => (
          <motion.div
            key={teacher.user.id}
            whileHover={{ y: -2, scale: 1.02 }}
            className={`bg-white rounded-xl shadow-sm border border-gray-200 cursor-pointer transition-all duration-200 ${compact ? 'p-3' : 'p-6'}`}
            onClick={() => setSelectedTeacher(selectedTeacher === teacher.user.id ? null : teacher.user.id)}
          >
            {/* Teacher Info */}
            <div className={`flex items-center space-x-3 ${compact ? 'mb-2' : 'mb-4'}`}>
              <div className={`bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold ${compact ? 'w-8 h-8 text-xs' : 'w-12 h-12'}`}>
                {teacher.user.first_name.charAt(0)}{teacher.user.last_name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`font-semibold text-gray-900 ${compact ? 'text-sm' : ''} truncate`}>
                  {compact ? `${teacher.user.first_name} ${teacher.user.last_name}` : `${teacher.user.first_name} ${teacher.user.last_name}`}
                </h3>
                {!compact && (
                  <p className="text-sm text-gray-600 truncate">{teacher.user.email}</p>
                )}
              </div>
            </div>

            {/* Status Badge */}
            <div className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(teacher.status)}`}>
              {getStatusIcon(teacher.status)}
              <span className="capitalize">{compact ? teacher.status.charAt(0).toUpperCase() : teacher.status.replace('_', ' ')}</span>
            </div>

            {/* Time Information - Only show in detailed view */}
            {!compact && (
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Check In:</span>
                  <span className="font-medium">{formatTime(teacher.check_in_time)}</span>
                </div>
                {teacher.break_out_time && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Break Out:</span>
                    <span className="font-medium">{formatTime(teacher.break_out_time)}</span>
                  </div>
                )}
                {teacher.break_in_time && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Break In:</span>
                    <span className="font-medium">{formatTime(teacher.break_in_time)}</span>
                  </div>
                )}
                {teacher.check_out_time && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Check Out:</span>
                    <span className="font-medium">{formatTime(teacher.check_out_time)}</span>
                  </div>
                )}
                {teacher.total_hours && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Total Hours:</span>
                    <span className="font-medium">{teacher.total_hours.toFixed(1)}h</span>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            {selectedTeacher === teacher.user.id && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className={`mt-3 pt-3 border-t border-gray-200 ${compact ? 'space-y-1' : ''}`}
              >
                <div className={`flex ${compact ? 'flex-col' : 'flex-wrap'} gap-1`}>
                  {getAvailableActions(teacher).map((action) => (
                    <button
                      key={action.key}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAction(action.key as any, teacher.user.id);
                      }}
                      disabled={checkInMutation.isPending || checkOutMutation.isPending || breakOutMutation.isPending || breakInMutation.isPending}
                      className={`px-2 py-1 rounded text-xs font-medium text-white transition-colors duration-200 ${action.color} disabled:opacity-50 disabled:cursor-not-allowed ${compact ? 'w-full' : ''}`}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Pagination for grid view */}
      {onPageChange && totalPages > 1 && (
        <div className="flex items-center justify-center">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="px-3 py-2 text-sm text-gray-700">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}; 