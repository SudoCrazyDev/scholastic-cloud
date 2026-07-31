import type { AttendanceRequestKind } from '../../types'

export const KIND_LABELS: Record<AttendanceRequestKind, string> = {
  late_arrival: 'Late arrival (excused)',
  early_out: 'Early out',
  official_business: 'Official business',
  forgot_punch: 'Missed punch',
}

/**
 * What each kind does to pay, shown while filing so the staff member knows
 * what they are asking for. Mirrors
 * StaffAttendanceRequest::defaultFlagsForKind on the API.
 */
export const KIND_HELP: Record<AttendanceRequestKind, string> = {
  late_arrival:
    'Arrived after the grace period for an approved reason — e.g. attending a school event in the morning and reporting in the afternoon. Waives the late penalty; you are still expected to stay until the scheduled end.',
  early_out:
    'Left before the scheduled end with permission (emergency, medical). Waives the undertime penalty; arriving late is still counted.',
  official_business:
    'Away on school business for all or part of the day, so the biometric may have no punch at all. Waives both penalties and pays the full day.',
  forgot_punch:
    'Present the whole day but the biometric punch is missing. Waives both penalties and pays the full day — add the actual times below.',
}
