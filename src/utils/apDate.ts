import { apMonthDay } from './comparisonMode'

/** AP-style date; year appended only when it differs from nowYear.
 *  Month styling delegates to comparisonMode's apMonthDay — the repo's ONE
 *  AP-month authority. Takes a date-only or SF-local ISO string; never
 *  parses through Date (a date-only string read as UTC renders a day early
 *  on Pacific hosts — see spec §11.5). */
export function apDate(isoDate: string, nowYear: number): string {
  const y = Number(isoDate.slice(0, 4))
  const base = apMonthDay(isoDate.slice(0, 10))
  return y === nowYear ? base : `${base}, ${y}`
}
