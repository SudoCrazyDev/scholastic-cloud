import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import { useAttendanceStats, useTodayAttendance } from '../../hooks/useAttendance';
import { AttendanceStatsCard } from './components';
import { AttendanceHeader } from './components';
import { TeacherAttendanceGrid } from './components';
import { RealtimeIndicator } from './components';
import type { TeacherAttendanceSummary } from '../../types';

const TeacherAttendance: React.FC = () => {
  const { user } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [currentPage, setCurrentPage] = useState(1);
  const [searchValue, setSearchValue] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'present' | 'absent' | 'late' | 'on_break' | 'checked_out' | 'no_scan'>('all');
  const [compactMode, setCompactMode] = useState(false);
  
  // Get the user's default institution
  const defaultInstitution = user?.user_institutions?.find((ui: any) => ui.is_default)?.institution;
  const institutionId = defaultInstitution?.id;

  const { data: stats, isLoading: statsLoading, error: statsError } = useAttendanceStats(institutionId || '');
  const { 
    data: attendanceResponse, 
    isLoading: attendanceLoading, 
    error: attendanceError 
  } = useTodayAttendance(
    institutionId || '', 
    currentPage, 
    compactMode ? 40 : 20, // Show more items in compact mode
    searchValue, 
    selectedFilter === 'all' ? undefined : selectedFilter
  );

  const todayAttendance = attendanceResponse?.data || [];
  const pagination = attendanceResponse?.pagination;

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Reset to first page when search or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchValue, selectedFilter]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: 'easeOut' },
    },
  };

  if (!institutionId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Institution Selected</h2>
          <p className="text-gray-600">Please select a default institution to view attendance data.</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header with realtime indicator */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Teacher Attendance Monitoring</h1>
          <p className="text-gray-600 mt-1">
            Real-time monitoring of teacher attendance at {defaultInstitution?.title}
          </p>
        </div>
        <RealtimeIndicator currentTime={currentTime} />
      </motion.div>

      {/* Stats Cards */}
      <motion.div variants={itemVariants}>
        <AttendanceStatsCard 
          stats={stats} 
          isLoading={statsLoading} 
          error={statsError}
          currentTime={currentTime}
        />
      </motion.div>

      {/* Filter and Header */}
      <motion.div variants={itemVariants}>
        <AttendanceHeader 
          selectedFilter={selectedFilter}
          onFilterChange={setSelectedFilter}
          totalTeachers={pagination?.total || 0}
          filteredCount={todayAttendance.length}
          currentTime={currentTime}
          compactMode={compactMode}
          onCompactModeChange={setCompactMode}
        />
      </motion.div>

      {/* Teacher Attendance Grid */}
      <motion.div variants={itemVariants}>
        <TeacherAttendanceGrid 
          teachers={todayAttendance}
          isLoading={attendanceLoading}
          error={attendanceError}
          institutionId={institutionId}
          compact={compactMode}
          onPageChange={setCurrentPage}
          currentPage={pagination?.current_page || 1}
          totalPages={pagination?.last_page || 1}
        />
      </motion.div>
    </motion.div>
  );
};

export default TeacherAttendance; 