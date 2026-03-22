import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { formatTime, formatDate, formatDateTime, fromNow, formatSchedule, formatNextSession, getNextSessionDate, dayjs } from '~/utils/date'

// Freeze time to a known DST date (June 15, 2026 = a Monday in CDT)
// so timezone abbreviation tests are deterministic
const FROZEN_DATE = new Date('2026-06-15T12:00:00-05:00')

describe('Date utilities (Day.js)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FROZEN_DATE)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('formatTime', () => {
    it('formats 24h time to 12h', () => {
      expect(formatTime('19:00')).toBe('7:00 PM')
      expect(formatTime('08:30')).toBe('8:30 AM')
      expect(formatTime('00:00')).toBe('12:00 AM')
      expect(formatTime('12:00')).toBe('12:00 PM')
    })

    it('passes through unparseable time strings', () => {
      expect(formatTime('TBD')).toBe('TBD')
    })

    it('handles 12h time input', () => {
      expect(formatTime('6:30 PM')).toBe('6:30 PM')
    })
  })

  describe('formatDate', () => {
    it('formats a date with default format', () => {
      expect(formatDate('2026-03-22')).toBe('Mar 22, 2026')
    })

    it('formats with custom format', () => {
      expect(formatDate('2026-03-22', 'YYYY/MM/DD')).toBe('2026/03/22')
    })
  })

  describe('formatDateTime', () => {
    it('formats date and time together', () => {
      const result = formatDateTime('2026-03-22T18:30:00')
      expect(result).toMatch(/Mar 22, 2026 at \d+:\d+ [AP]M/)
    })
  })

  describe('fromNow', () => {
    it('returns relative time', () => {
      const recent = new Date(Date.now() - 60 * 1000) // 1 minute ago
      expect(fromNow(recent)).toBe('a minute ago')
    })

    it('handles future dates', () => {
      const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) // 2 days from now
      expect(fromNow(future)).toBe('in 2 days')
    })
  })

  describe('formatSchedule', () => {
    it('formats a full schedule', () => {
      const result = formatSchedule({
        frequency: 'Weekly',
        dayOfWeek: 'Saturday',
        time: '18:00',
        timezone: 'America/Chicago',
      })
      expect(result).toBe('Weekly · Saturday · at 6:00 PM · CDT')
    })

    it('handles partial schedule', () => {
      expect(formatSchedule({
        frequency: 'Biweekly',
        dayOfWeek: null,
        time: null,
        timezone: null,
      })).toBe('Biweekly')
    })

    it('returns "Not scheduled" for null', () => {
      expect(formatSchedule(null)).toBe('Not scheduled')
    })

    it('returns "Not scheduled" for all-null fields', () => {
      expect(formatSchedule({
        frequency: null,
        dayOfWeek: null,
        time: null,
        timezone: null,
      })).toBe('Not scheduled')
    })
  })

  describe('getNextSessionDate', () => {
    it('returns a future date for a given day of week', () => {
      const next = getNextSessionDate('Saturday')
      expect(next).not.toBeNull()
      expect(next!.day()).toBe(6) // Saturday
      expect(next!.isAfter(dayjs())).toBe(true)
    })

    it('returns null for invalid day', () => {
      expect(getNextSessionDate('Funday')).toBeNull()
    })
  })

  describe('formatNextSession', () => {
    it('formats next session with time and relative date', () => {
      const result = formatNextSession('Saturday', '18:00', 'America/Chicago')
      expect(result).toMatch(/Saturday · 6:00 PM \(in \d+ days?\)/)
    })

    it('shows TBD when no time provided', () => {
      const result = formatNextSession('Friday')
      expect(result).toMatch(/Friday · TBD/)
    })
  })
})
