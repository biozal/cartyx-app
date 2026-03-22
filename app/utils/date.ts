import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import advancedFormat from 'dayjs/plugin/advancedFormat'
import localizedFormat from 'dayjs/plugin/localizedFormat'

// Register plugins
dayjs.extend(relativeTime)
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(advancedFormat)
dayjs.extend(localizedFormat)

export { dayjs }

/**
 * Format a date as a human-friendly relative string.
 * e.g. "2 hours ago", "in 3 days"
 */
export function fromNow(date: string | Date): string {
  return dayjs(date).fromNow()
}

/**
 * Format a date with a nice display format.
 * e.g. "Mar 22, 2026 at 6:30 PM"
 */
export function formatDate(date: string | Date, format = 'MMM D, YYYY'): string {
  return dayjs(date).format(format)
}

/**
 * Format a date with time.
 * e.g. "Mar 22, 2026 at 6:30 PM"
 */
export function formatDateTime(date: string | Date): string {
  return dayjs(date).format('MMM D, YYYY [at] h:mm A')
}

/**
 * Format time only.
 * e.g. "6:30 PM"
 */
export function formatTime(time: string): string {
  // Try to parse common time formats (e.g. "18:30", "6:30 PM", "6pm")
  const parsed = dayjs(`2000-01-01 ${time}`)
  if (parsed.isValid()) {
    return parsed.format('h:mm A')
  }
  return time // Return as-is if we can't parse it
}

/**
 * Format a schedule for display.
 * Takes the campaign schedule object and returns a friendly string.
 * e.g. "Every Saturday at 6:30 PM CDT"
 */
export function formatSchedule(schedule: {
  frequency?: string | null
  dayOfWeek?: string | null
  time?: string | null
  timezone?: string | null
} | null): string {
  if (!schedule) return 'Not scheduled'

  const parts: string[] = []

  if (schedule.frequency) {
    parts.push(schedule.frequency)
  }

  if (schedule.dayOfWeek) {
    parts.push(schedule.dayOfWeek)
  }

  if (schedule.time) {
    const formattedTime = formatTime(schedule.time)
    parts.push(`at ${formattedTime}`)
  }

  if (schedule.timezone) {
    // Derive abbreviation based on next session date (DST-aware), not current date
    try {
      const baseDate =
        schedule.dayOfWeek
          ? getNextSessionDate(schedule.dayOfWeek, schedule.time ?? null, schedule.timezone) ?? dayjs()
          : dayjs()
      const abbr = baseDate.tz(schedule.timezone).format('z')
      parts.push(abbr)
    } catch {
      // Fallback: show raw timezone if abbreviation computation fails
      parts.push(schedule.timezone)
    }
  }

  return parts.length > 0 ? parts.join(' · ') : 'Not scheduled'
}

/**
 * Get the next occurrence of a day of the week from today.
 * Returns a Day.js object for the next session date.
 */
export function getNextSessionDate(dayOfWeek: string, time?: string | null, tz?: string | null): dayjs.Dayjs | null {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const targetDay = days.indexOf(dayOfWeek.toLowerCase())
  if (targetDay === -1) return null

  const now = tz ? dayjs().tz(tz) : dayjs()
  const currentDay = now.day()
  let daysUntil = targetDay - currentDay

  // For past days, always go to next week. For same-day, skip only if no time is provided.
  if (daysUntil < 0 || (daysUntil === 0 && !time)) {
    daysUntil += 7
  }

  let nextDate = now.add(daysUntil, 'day')

  // If a time is provided, parse it in the correct timezone
  if (time) {
    const dateStr = nextDate.format('YYYY-MM-DD')
    const parsed = tz
      ? dayjs.tz(`${dateStr} ${time}`, tz)
      : dayjs(`${dateStr} ${time}`)

    if (parsed.isValid()) {
      // If same day and time already passed, move to next week
      if (daysUntil === 0 && parsed.isBefore(now)) {
        const nextWeekStr = now.add(7, 'day').format('YYYY-MM-DD')
        const nextWeekParsed = tz
          ? dayjs.tz(`${nextWeekStr} ${time}`, tz)
          : dayjs(`${nextWeekStr} ${time}`)
        nextDate = nextWeekParsed.isValid() ? nextWeekParsed : parsed
      } else {
        nextDate = parsed
      }
    }
  }

  return nextDate
}

/**
 * Format the next session display.
 * e.g. "Saturday · 6:30 PM (in 3 days)"
 */
export function formatNextSession(
  dayOfWeek: string,
  time?: string | null,
  tz?: string | null
): string {
  const formattedTime = time ? formatTime(time) : 'TBD'
  const nextDate = getNextSessionDate(dayOfWeek, time, tz)
  const relative = nextDate ? ` (${nextDate.fromNow()})` : ''

  return `${dayOfWeek} · ${formattedTime}${relative}`
}
