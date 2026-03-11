export interface ElectionCycle {
  label: string
  date: string
  start: string
  end: string
}

export const SF_ELECTIONS: ElectionCycle[] = [
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

/** Find the prior equivalent election cycle for YoY comparison.
 *  Nov → prior Nov, Mar → prior Mar, Jun → prior Jun.
 *  Returns null if no match found. */
export function findPriorCycle(current: ElectionCycle): ElectionCycle | null {
  const currentMonth = current.label.split(' ')[0] // "Nov", "Mar", "Jun"
  const currentIdx = SF_ELECTIONS.indexOf(current)
  for (let i = currentIdx + 1; i < SF_ELECTIONS.length; i++) {
    if (SF_ELECTIONS[i].label.startsWith(currentMonth)) return SF_ELECTIONS[i]
  }
  return null
}

/** Get the most recent election cycle that has likely concluded (date <= today). */
export function getDefaultCycle(): ElectionCycle {
  const today = new Date().toISOString().slice(0, 10)
  const past = SF_ELECTIONS.find(e => e.date <= today)
  return past || SF_ELECTIONS[0]
}

/** Find which election cycle contains a given date range, or null. */
export function findCycleForRange(start: string, end: string): ElectionCycle | null {
  return SF_ELECTIONS.find(e => e.start === start && e.end === end) || null
}

/** Escape single quotes for SoQL WHERE clauses. */
export function escapeSoQL(value: string): string {
  return value.replace(/'/g, "''")
}
