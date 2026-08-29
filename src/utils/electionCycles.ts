import type { CityId } from '@/cities/routing'

export interface ElectionCycle {
  label: string
  date: string
  start: string
  end: string
}

export const SF_ELECTIONS: ElectionCycle[] = [
  // Nov cycles run from Jan 1 of the election year (house convention — overlaps the June window on purpose, as Nov 2024 / Mar 2024 do).
  { label: 'Nov 2026',  date: '2026-11-03', start: '2026-01-01', end: '2026-11-03' },
  { label: 'June 2026', date: '2026-06-02', start: '2025-07-01', end: '2026-06-02' },
  { label: 'Nov 2024',  date: '2024-11-05', start: '2024-01-01', end: '2024-11-05' },
  { label: 'Mar 2024',  date: '2024-03-05', start: '2023-07-01', end: '2024-03-05' },
  { label: 'Nov 2022',  date: '2022-11-08', start: '2022-01-01', end: '2022-11-08' },
  { label: 'Jun 2022',  date: '2022-06-07', start: '2021-07-01', end: '2022-06-07' },
  { label: 'Nov 2020',  date: '2020-11-03', start: '2020-01-01', end: '2020-11-03' },
  { label: 'Mar 2020',  date: '2020-03-03', start: '2019-07-01', end: '2020-03-03' },
  { label: 'Nov 2019',  date: '2019-11-05', start: '2019-01-01', end: '2019-11-05' },
  { label: 'Nov 2018',  date: '2018-11-06', start: '2018-01-01', end: '2018-11-06' },
  { label: 'Jun 2018',  date: '2018-06-05', start: '2017-07-01', end: '2018-06-05' },
]

/**
 * Oakland cycles TILE — each starts the day after the previous election —
 * because pre-window fundraising is the NORM (Taylor raised $50,665 in
 * Nov–Dec 2024, before any Jan-1 window; 2024 candidates show sustained 2023
 * fundraising). Tiling means no dollar falls between windows and no candidate
 * is asymmetrically clipped. Windows are deliberately UNEVEN (the Apr 2025
 * special's is 5 months; a regular's ~24) — cycle totals are cycle totals.
 * Oldest row anchors at the dataset's onset month (Sch A begins 2010-10).
 */
export const OAKLAND_ELECTIONS: ElectionCycle[] = [
  { label: 'Nov 2026', date: '2026-11-03', start: '2025-04-16', end: '2026-11-03' },
  { label: 'Apr 2025', date: '2025-04-15', start: '2024-11-06', end: '2025-04-15' },
  { label: 'Nov 2024', date: '2024-11-05', start: '2022-11-09', end: '2024-11-05' },
  { label: 'Nov 2022', date: '2022-11-08', start: '2020-11-04', end: '2022-11-08' },
  { label: 'Nov 2020', date: '2020-11-03', start: '2018-11-07', end: '2020-11-03' },
  { label: 'Nov 2018', date: '2018-11-06', start: '2016-11-09', end: '2018-11-06' },
  { label: 'Nov 2016', date: '2016-11-08', start: '2014-11-05', end: '2016-11-08' },
  { label: 'Nov 2014', date: '2014-11-04', start: '2012-11-07', end: '2014-11-04' },
  { label: 'Nov 2012', date: '2012-11-06', start: '2010-10-01', end: '2012-11-06' },
]

export function cityElections(cityId: CityId): ElectionCycle[] {
  return cityId === 'oakland' ? OAKLAND_ELECTIONS : SF_ELECTIONS
}

/** Find the prior equivalent election cycle for YoY comparison.
 *  Nov → prior Nov, Mar → prior Mar, Jun → prior Jun.
 *  Returns null if no match found. */
export function findPriorCycle(current: ElectionCycle, cycles: ElectionCycle[] = SF_ELECTIONS): ElectionCycle | null {
  const currentMonth = current.label.split(' ')[0] // "Nov", "Mar", "Jun"
  const currentIdx = cycles.indexOf(current)
  for (let i = currentIdx + 1; i < cycles.length; i++) {
    if (cycles[i].label.startsWith(currentMonth)) return cycles[i]
  }
  return null
}

/** Get the most recent election cycle that has likely concluded (date <= today). */
export function getDefaultCycle(cycles: ElectionCycle[] = SF_ELECTIONS): ElectionCycle {
  const today = new Date().toISOString().slice(0, 10)
  const past = cycles.find(e => e.date <= today)
  return past || cycles[0]
}

/** Find which election cycle contains a given date range, or null. */
export function findCycleForRange(start: string, end: string, cycles: ElectionCycle[] = SF_ELECTIONS): ElectionCycle | null {
  return cycles.find(e => e.start === start && e.end === end) || null
}

/** Escape single quotes for SoQL WHERE clauses. */
export function escapeSoQL(value: string): string {
  return value.replace(/'/g, "''")
}
