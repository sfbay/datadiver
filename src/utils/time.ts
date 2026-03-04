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

/** Format a percentage delta with sign, e.g. "+12.3%" or "-5.1%" */
export function formatDelta(pct: number): string {
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

/** Offset a YYYY-MM-DD date string by N days backwards */
export function daysBeforeDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}

/** Format hour number as human-readable, e.g. 0→"12am", 14→"2pm" */
export function formatHour(hour: number): string {
  if (hour === 0) return '12am'
  if (hour === 12) return '12pm'
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`
}

/** Calculate difference in hours between two datetime strings */
export function diffHours(start: string, end: string): number | null {
  const s = parseDateTime(start)
  const e = parseDateTime(end)
  if (!s || !e) return null
  return (e.getTime() - s.getTime()) / 3_600_000
}

/** Format hours as human-readable resolution time (for 311 cases) */
export function formatResolution(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}min`
  if (hours < 24) return `${hours.toFixed(1)}h`
  const days = Math.floor(hours / 24)
  const remainingHours = Math.round(hours % 24)
  if (days === 1) return remainingHours > 0 ? `1d ${remainingHours}h` : '1d'
  return `${days}d`
}

/** Subtract 365 days from a YYYY-MM-DD date string */
export function yearAgo(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() - 365)
  return d.toISOString().split('T')[0]
}

/** Detect appropriate granularity based on date range span */
export function detectGranularity(start: string, end: string): 'daily' | 'weekly' | 'monthly' {
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  const days = (e.getTime() - s.getTime()) / 86_400_000
  if (days <= 60) return 'daily'
  if (days <= 180) return 'weekly'
  return 'monthly'
}

/** Group records by YYYY-MM-DD date string */
export function groupByDay<T>(records: T[], getDate: (r: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const r of records) {
    const day = getDate(r).split('T')[0]
    const arr = map.get(day)
    if (arr) arr.push(r)
    else map.set(day, [r])
  }
  return map
}
