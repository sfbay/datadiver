/** Time and date utilities for response time calculations */

/** Parse a Socrata datetime string into a Date object */
export function parseDateTime(dt: string | null | undefined): Date | null {
  if (!dt) return null
  const d = new Date(dt)
  return isNaN(d.getTime()) ? null : d
}

/** Calculate difference in minutes between two datetime strings */
export function diffMinutes(start: string, end: string): number | null {
  const s = parseDateTime(start)
  const e = parseDateTime(end)
  if (!s || !e) return null
  return (e.getTime() - s.getTime()) / 60_000
}

/** Format minutes as human-readable duration */
export function formatDuration(minutes: number): string {
  if (minutes < 1) return `${Math.round(minutes * 60)}s`
  if (minutes < 60) return `${minutes.toFixed(1)}min`
  const hrs = Math.floor(minutes / 60)
  const mins = Math.round(minutes % 60)
  return `${hrs}h ${mins}m`
}

/** Format a date for display */
export function formatDate(date: Date | string, style: 'short' | 'long' = 'short'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (style === 'short') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Format a date range for display */
export function formatDateRange(start: string, end: string): string {
  return `${formatDate(start)} — ${formatDate(end)}`
}

/** Get hour of day from datetime string (0-23) */
export function getHourOfDay(dt: string): number {
  return new Date(dt).getHours()
}

/** Get day of week from datetime string (0=Sun, 6=Sat) */
export function getDayOfWeek(dt: string): number {
  return new Date(dt).getDay()
}

/** Day of week labels */
export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Format number with commas */
export function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

/** Format currency */
export function formatCurrency(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}
