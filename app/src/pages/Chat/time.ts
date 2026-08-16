/*
 * Times come off the API in UTC — config/app.php pins the API to it and ignores
 * APP_TIMEZONE — so every timestamp on this screen is converted here, and to
 * Manila explicitly rather than to whatever the device happens to be set to. A
 * tablet with a wrong clock zone should still show a class the school hour it
 * actually happened.
 */
const SCHOOL_TIME_ZONE = 'Asia/Manila'

const timeOfDay = new Intl.DateTimeFormat('en-PH', {
  timeZone: SCHOOL_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

const dayAndMonth = new Intl.DateTimeFormat('en-PH', {
  timeZone: SCHOOL_TIME_ZONE,
  day: 'numeric',
  month: 'short',
})

const fullDay = new Intl.DateTimeFormat('en-PH', {
  timeZone: SCHOOL_TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** School-local calendar day, used to decide where a date separator goes. */
const schoolDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: SCHOOL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export const formatMessageTime = (iso: string): string => timeOfDay.format(new Date(iso))

export const schoolDayKey = (iso: string): string => schoolDay.format(new Date(iso))

/** Heading above a day's messages: "Today", "Yesterday", or the full date. */
export const formatDaySeparator = (iso: string): string => {
  const now = new Date()
  const key = schoolDayKey(iso)

  if (key === schoolDayKey(now.toISOString())) return 'Today'

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  if (key === schoolDayKey(yesterday.toISOString())) return 'Yesterday'

  return fullDay.format(new Date(iso))
}

/** Compact stamp for the group list: the time today, the date before that. */
export const formatListTime = (iso: string): string => {
  const key = schoolDayKey(iso)
  const today = schoolDayKey(new Date().toISOString())

  return key === today ? timeOfDay.format(new Date(iso)) : dayAndMonth.format(new Date(iso))
}
