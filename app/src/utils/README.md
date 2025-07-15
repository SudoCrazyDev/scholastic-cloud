# Attendance Utilities

This module contains utility functions for handling teacher attendance calculations and status determination.

## Functions

### `isLate(checkInTime, cutoffTime?)`

Determines if a teacher is late based on their check-in time.

**Parameters:**
- `checkInTime` (string): Time string in format like "7:30am", "8:15am", etc.
- `cutoffTime` (string, optional): Cutoff time in 24-hour format (default: "07:05")

**Returns:** boolean indicating if the teacher is late

**Example:**
```typescript
isLate('7:30am') // true (after 7:05 AM)
isLate('6:45am') // false (before 7:05 AM)
isLate('8:00am', '08:00') // false (before 8:00 AM)
```

### `getTeacherStatus(entries)`

Determines the current status of a teacher based on their attendance entries.

**Parameters:**
- `entries` (array): Array of attendance entries from the API

**Returns:** Status string - 'present' | 'absent' | 'late' | 'on_break' | 'checked_out' | 'no_scan'

**Example:**
```typescript
const entries = [{ 'check-in': '8:30am' }];
getTeacherStatus(entries) // 'late'
```

### `formatCutoffTime(cutoffTime?)`

Formats a cutoff time for display purposes.

**Parameters:**
- `cutoffTime` (string, optional): Cutoff time in 24-hour format (default: "07:05")

**Returns:** Formatted time string (e.g., "7:05 AM")

**Example:**
```typescript
formatCutoffTime() // "7:05 AM"
formatCutoffTime('14:30') // "2:30 PM"
```

## Constants

### `DEFAULT_LATE_CUTOFF`

The default cutoff time for late arrivals: "07:05" (7:05 AM)

## Late Detection Logic

Teachers are considered late if they check in after 7:05 AM. The system:

1. Parses check-in times in the format "7:30am", "8:15am", etc.
2. Converts them to 24-hour format for comparison
3. Compares against the cutoff time (7:05 AM by default)
4. Returns true if the check-in time is after the cutoff

**Status Priority:**
1. `checked_out` - Teacher has checked out for the day
2. `on_break` - Teacher is currently on break
3. `late` - Teacher checked in after 7:05 AM
4. `present` - Teacher checked in before 7:05 AM
5. `no_scan` - Teacher hasn't checked in yet 