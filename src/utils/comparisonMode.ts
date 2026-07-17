/** Date-anchored comparison model (spec: 2026-07-17-date-anchored-compare).
 *
 *  Presets are RELATIONSHIPS — they re-resolve whenever the main date range
 *  moves ('1yr' = same calendar day previous year, leap-aware; 'prev' = back
 *  by the range's own length). Pinned dates are FACTS — they stay put.
 *  The comparison window's length always equals the current range's length.
 */

export type ComparisonPreset = 'prev' | '30d' | '90d' | '180d' | '1yr'

export type ComparisonMode =
  | { kind: 'preset'; preset: ComparisonPreset }
  | { kind: 'date'; start: string } // pinned ISO YYYY-MM-DD = comparison window start
  | null

export interface DateRange {
  start: string
  end: string
}

const PRESETS: ComparisonPreset[] = ['prev', '30d', '90d', '180d', '1yr']

/** Add n days (n may be negative) to a YYYY-MM-DD string. Noon-anchored to dodge DST. */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Whole days from range.start to range.end (0 for a single-day range). */
export function rangeLengthDays(range: DateRange): number {
  const s = new Date(range.start + 'T12:00:00')
  const e = new Date(range.end + 'T12:00:00')
  return Math.round((e.getTime() - s.getTime()) / 86_400_000)
}

/** Same calendar day, previous year. Feb 29 clamps to Feb 28. */
export function sameDayLastYear(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const daysInTargetMonth = new Date(y - 1, m, 0).getDate()
  const day = Math.min(d, daysInTargetMonth)
  return `${y - 1}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function resolveComparisonStart(mode: ComparisonMode, range: DateRange): string | null {
  if (!mode) return null
  if (mode.kind === 'date') return mode.start
  switch (mode.preset) {
    case 'prev': return addDays(range.start, -(rangeLengthDays(range) + 1))
    case '30d': return addDays(range.start, -30)
    case '90d': return addDays(range.start, -90)
    case '180d': return addDays(range.start, -180)
    case '1yr': return sameDayLastYear(range.start)
  }
}

export function resolveComparisonRange(mode: ComparisonMode, range: DateRange): DateRange | null {
  const start = resolveComparisonStart(mode, range)
  if (start === null) return null
  return { start, end: addDays(start, rangeLengthDays(range)) }
}

// AP style: months of ≤5 letters spelled out, longer abbreviated with period.
const AP_MONTHS = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.']

function apMonthDay(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number)
  return `${AP_MONTHS[m - 1]} ${d}`
}

/** "July 4, 2025" · "July 4–10, 2025" · "June 28 – July 4, 2025" · cross-year repeats both years. */
export function describeWindow(win: DateRange): string {
  const [ys, ms] = win.start.split('-').map(Number)
  const [ye, me, de] = win.end.split('-').map(Number)
  if (win.start === win.end) return `${apMonthDay(win.start)}, ${ys}`
  if (ys === ye && ms === me) return `${apMonthDay(win.start)}–${de}, ${ys}`
  if (ys === ye) return `${apMonthDay(win.start)} – ${apMonthDay(win.end)}, ${ys}`
  return `${apMonthDay(win.start)}, ${ys} – ${apMonthDay(win.end)}, ${ye}`
}

/** Card-subtitle label: "vs July 4, 2025" ('' when compare is off). */
export function comparisonLabel(mode: ComparisonMode, range: DateRange): string {
  const win = resolveComparisonRange(mode, range)
  return win ? `vs ${describeWindow(win)}` : ''
}

export function serializeComparison(mode: ComparisonMode): string | null {
  if (!mode) return null
  return mode.kind === 'preset' ? mode.preset : mode.start
}

/** Parse ?compare=. Accepts presets, YYYY-MM-DD, and legacy day counts
 *  (?compare=360 from old shared links — mapped to the nearest preset). */
export function parseComparison(param: string | null): ComparisonMode {
  if (!param) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(param)) return { kind: 'date', start: param }
  if ((PRESETS as string[]).includes(param)) return { kind: 'preset', preset: param as ComparisonPreset }
  const n = parseInt(param, 10)
  if (Number.isFinite(n) && n > 0) {
    const candidates: Array<[ComparisonPreset, number]> = [['30d', 30], ['90d', 90], ['180d', 180], ['1yr', 365]]
    let best: ComparisonPreset = '30d'
    let bestDist = Infinity
    for (const [preset, days] of candidates) {
      const dist = Math.abs(n - days)
      if (dist < bestDist) { best = preset; bestDist = dist }
    }
    return { kind: 'preset', preset: best }
  }
  return null
}
