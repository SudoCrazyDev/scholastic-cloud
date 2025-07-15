/**
 * Utility functions for attendance calculations
 */

// Default cutoff time for late arrivals (7:05 AM)
export const DEFAULT_LATE_CUTOFF = "07:05";

/**
 * Check if a teacher is late based on their check-in time
 * @param checkInTime - Time string in format like "7:30am", "8:15am", etc.
 * @param cutoffTime - Cutoff time in 24-hour format (default: "07:05")
 * @returns boolean indicating if the teacher is late
 */
export const isLate = (checkInTime: string, cutoffTime: string = DEFAULT_LATE_CUTOFF): boolean => {
  if (!checkInTime) return false;
  
  try {
    // Parse the check-in time (format: "7:30am", "8:15am", etc.)
    const timeMatch = checkInTime.match(/^(\d{1,2}):(\d{2})(am|pm)$/i);
    if (!timeMatch) return false;
    
    let hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);
    const period = timeMatch[3].toLowerCase();
    
    // Convert to 24-hour format
    if (period === 'pm' && hours !== 12) {
      hours += 12;
    } else if (period === 'am' && hours === 12) {
      hours = 0;
    }
    
    // Parse cutoff time
    const [cutoffHours, cutoffMinutes] = cutoffTime.split(':').map(Number);
    
    // Compare times
    const checkInMinutes = hours * 60 + minutes;
    const cutoffMinutesTotal = cutoffHours * 60 + cutoffMinutes;
    
    return checkInMinutes > cutoffMinutesTotal;
  } catch (error) {
    console.error('Error parsing check-in time:', error);
    return false;
  }
};

/**
 * Format the cutoff time for display
 * @param cutoffTime - Cutoff time in 24-hour format
 * @returns formatted time string (e.g., "7:05 AM")
 */
export const formatCutoffTime = (cutoffTime: string = DEFAULT_LATE_CUTOFF): string => {
  try {
    const [hours, minutes] = cutoffTime.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    
    return date.toLocaleTimeString('en-US', {
      hour12: true,
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (error) {
    console.error('Error formatting cutoff time:', error);
    return '7:05 AM';
  }
};

/**
 * Get the status of a teacher based on their attendance entries
 * @param entries - Array of attendance entries
 * @returns status string
 */
export const getTeacherStatus = (entries: any[]): 'present' | 'absent' | 'late' | 'on_break' | 'checked_out' | 'no_scan' => {
  const hasCheckIn = entries.some(entry => entry['check-in']);
  const hasCheckOut = entries.some(entry => entry['check-out']);
  const hasBreakOut = entries.some(entry => entry['break-out']);
  const hasBreakIn = entries.some(entry => entry['break-in']);
  
  if (hasCheckOut) return 'checked_out';
  if (hasBreakOut && !hasBreakIn) return 'on_break';
  if (hasCheckIn) {
    const checkInTime = entries.find(entry => entry['check-in'])?.['check-in'];
    return isLate(checkInTime) ? 'late' : 'present';
  }
  return 'no_scan';
}; 