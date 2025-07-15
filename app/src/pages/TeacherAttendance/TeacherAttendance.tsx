import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import { useRealtimeAttendance } from '../../hooks/useAttendance';
import { AttendanceStatsCard, RealtimeIndicator, AttendanceList } from './components';
import { isLate, getTeacherStatus, formatCutoffTime, DEFAULT_LATE_CUTOFF } from '../../utils/attendanceUtils';

const TeacherAttendance: React.FC = () => {
  const { user } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [searchValue, setSearchValue] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'present' | 'late' | 'on_break' | 'checked_out' | 'no_scan'>('all');
  
  // Get the user's default institution
  const defaultInstitution = user?.user_institutions?.find((ui: any) => ui.is_default)?.institution;
  const institutionId = defaultInstitution?.id;

  // Format today's date for the API
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  
  // For now, we'll use a default device name - this could be made configurable
  const deviceName = 'GSCNSSAT'; // This should come from institution settings or be configurable

  const { 
    data: attendanceResponse, 
    isLoading: attendanceLoading, 
    error: attendanceError 
  } = useRealtimeAttendance(today, deviceName, searchValue || undefined);

  const attendanceData = attendanceResponse?.data || [];
  
  // Filter attendance data based on status filter
  const filteredAttendanceData = useMemo(() => {
    if (statusFilter === 'all') {
      return attendanceData;
    }
    return attendanceData.filter(person => getTeacherStatus(person.entries) === statusFilter);
  }, [attendanceData, statusFilter]);

  // Fullscreen functions
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch((err) => {
        console.error('Error attempting to enable fullscreen:', err);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      }).catch((err) => {
        console.error('Error attempting to exit fullscreen:', err);
      });
    }
  };

  // Handle fullscreen change events
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  // Hide header and sidebar when in fullscreen mode
  useEffect(() => {
    if (isFullscreen) {
      // Add CSS classes to hide header and sidebar
      document.body.classList.add('fullscreen-mode');
      
      // Add custom CSS to hide specific elements
      const style = document.createElement('style');
      style.id = 'fullscreen-hide-elements';
      style.textContent = `
        /* Hide sidebar */
        .fullscreen-mode .bg-white.shadow-lg.border-r.border-gray-200.h-screen.flex.flex-col {
          display: none !important;
        }
        
        /* Hide topbar */
        .fullscreen-mode .bg-white.shadow-sm.border-b.border-gray-200.px-6.py-4 {
          display: none !important;
        }
        
        /* Adjust main content area when sidebar and topbar are hidden */
        .fullscreen-mode .flex.h-screen.bg-gray-50 > div:first-child {
          display: none !important;
        }
        .fullscreen-mode .flex.h-screen.bg-gray-50 > div:last-child > div:first-child {
          display: none !important;
        }
        .fullscreen-mode .flex.h-screen.bg-gray-50 > div:last-child > main {
          padding: 0 !important;
          margin: 0 !important;
        }
        .fullscreen-mode .flex.h-screen.bg-gray-50 > div:last-child > main > div {
          max-width: none !important;
          margin: 0 !important;
        }
        
        /* Ensure the main container takes full width and height */
        .fullscreen-mode .flex.h-screen.bg-gray-50 {
          width: 100vw !important;
          height: 100vh !important;
        }
      `;
      document.head.appendChild(style);
    } else {
      // Remove CSS classes and styles when exiting fullscreen
      document.body.classList.remove('fullscreen-mode');
      const style = document.getElementById('fullscreen-hide-elements');
      if (style) {
        style.remove();
      }
    }

    return () => {
      // Cleanup when component unmounts
      document.body.classList.remove('fullscreen-mode');
      const style = document.getElementById('fullscreen-hide-elements');
      if (style) {
        style.remove();
      }
    };
  }, [isFullscreen]);

  // Keyboard shortcuts for fullscreen
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // F11 key for fullscreen toggle
      if (event.key === 'F11') {
        event.preventDefault();
        toggleFullscreen();
      }
      // Escape key to exit fullscreen
      if (event.key === 'Escape' && isFullscreen) {
        toggleFullscreen();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Update current time every 30 seconds to match data refresh rate
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 30000);

    return () => clearInterval(timer);
  }, []);

  // Handle status filter changes
  const handleStatusFilter = (status: 'all' | 'present' | 'late' | 'on_break' | 'checked_out' | 'no_scan') => {
    if (statusFilter === status) {
      // If clicking the same filter, clear it
      setStatusFilter('all');
    } else {
      setStatusFilter(status);
    }
  };
  
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
      className={`space-y-6 ${isFullscreen ? 'p-8 bg-gray-50 min-h-screen' : ''}`}
    >
      {/* Header with realtime indicator and fullscreen toggle */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <h1 className={`font-bold text-gray-900 ${isFullscreen ? 'text-4xl' : 'text-2xl'}`}>
            Teacher Attendance Monitoring
          </h1>
          <p className={`text-gray-600 mt-1 ${isFullscreen ? 'text-xl' : ''}`}>
            Real-time monitoring of teacher attendance at {defaultInstitution?.title}
          </p>
          <p className={`text-orange-600 mt-1 ${isFullscreen ? 'text-lg' : 'text-sm'}`}>
            <span className="font-medium">Late cutoff time:</span> {formatCutoffTime(DEFAULT_LATE_CUTOFF)}
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <RealtimeIndicator currentTime={currentTime} isFullscreen={isFullscreen} />
          
          {/* Fullscreen Toggle Button */}
          <button
            onClick={toggleFullscreen}
            className={`inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors ${
              isFullscreen ? 'bg-blue-50 border-blue-300 text-blue-700' : ''
            }`}
            title={`${isFullscreen ? 'Exit' : 'Enter'} Fullscreen (F11)`}
          >
            {isFullscreen ? (
              <>
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Exit Fullscreen
              </>
            ) : (
              <>
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
                Fullscreen
              </>
            )}
          </button>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <motion.div variants={itemVariants}>
        <AttendanceStatsCard 
          stats={{
            total_teachers: attendanceData.length,
            present_today: attendanceData.filter(person => 
              getTeacherStatus(person.entries) === 'present'
            ).length,
            absent_today: attendanceData.filter(person => 
              getTeacherStatus(person.entries) === 'no_scan'
            ).length,
            late_today: attendanceData.filter(person => 
              getTeacherStatus(person.entries) === 'late'
            ).length,
            on_break: attendanceData.filter(person => 
              getTeacherStatus(person.entries) === 'on_break'
            ).length,
            checked_out: attendanceData.filter(person => 
              getTeacherStatus(person.entries) === 'checked_out'
            ).length,
            no_scan_yet: attendanceData.filter(person => 
              getTeacherStatus(person.entries) === 'no_scan'
            ).length,
          }}
          isLoading={attendanceLoading}
          error={attendanceError}
          currentTime={currentTime}
          isFullscreen={isFullscreen}
          statusFilter={statusFilter}
          onStatusFilter={handleStatusFilter}
        />
      </motion.div>

      {/* Search and Header */}
      <motion.div variants={itemVariants}>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
            {/* Left side - Summary */}
            <div className="flex items-center space-x-6">
              <div>
                <h2 className={`font-semibold text-gray-900 ${isFullscreen ? 'text-2xl' : 'text-lg'}`}>
                  Teacher Attendance
                </h2>
                <p className={`text-gray-600 ${isFullscreen ? 'text-lg' : 'text-sm'}`}>
                  Showing {filteredAttendanceData.length} {statusFilter !== 'all' ? 'filtered' : ''} teachers
                  {statusFilter !== 'all' && (
                    <span className="text-blue-600 ml-1">
                      (of {attendanceData.length} total)
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Right side - Search */}
            <div className="flex items-center space-x-4">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search by name..."
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  className={`border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    isFullscreen 
                      ? 'w-80 px-6 py-3 pl-12 text-lg' 
                      : 'w-64 px-4 py-2 pl-10'
                  }`}
                />
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className={`text-gray-400 ${isFullscreen ? 'h-6 w-6' : 'h-5 w-5'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Additional Info */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex flex-wrap items-center justify-between text-gray-600">
              <div className="flex items-center space-x-4">
                <span className={isFullscreen ? 'text-lg' : 'text-sm'}>
                  <span className="font-medium">Last Updated:</span>{' '}
                  {currentTime.toLocaleTimeString('en-US', {
                    hour12: true,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
                <span className={isFullscreen ? 'text-lg' : 'text-sm'}>
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
                <span className={`font-medium text-green-600 ${isFullscreen ? 'text-lg' : ''}`}>
                  Live Updates
                </span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Teacher Attendance List */}
      <motion.div variants={itemVariants}>
        <AttendanceList 
          attendanceData={filteredAttendanceData}
          totalCount={attendanceData.length}
          isLoading={attendanceLoading}
          error={attendanceError}
          currentTime={currentTime}
          isFullscreen={isFullscreen}
          statusFilter={statusFilter}
        />
      </motion.div>

      {/* Fullscreen Instructions */}
      {isFullscreen && (
        <motion.div 
          variants={itemVariants}
          className="fixed bottom-4 right-4 bg-black bg-opacity-75 text-white px-4 py-2 rounded-lg text-sm"
        >
          <div className="flex items-center space-x-2">
            <span>Press F11 or ESC to exit fullscreen</span>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};

export default TeacherAttendance; 