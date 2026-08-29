import { describe, it, expect } from 'vitest'
import {
  SF_ELECTIONS, OAKLAND_ELECTIONS, cityElections,
  findPriorCycle, getDefaultCycle, findCycleForRange,
} from './electionCycles'

describe('OAKLAND_ELECTIONS', () => {
  it('tiles: every cycle starts the day after the next-older election', () => {
    for (let i = 0; i < OAKLAND_ELECTIONS.length - 1; i++) {
      const younger = OAKLAND_ELECTIONS[i]
      const older = OAKLAND_ELECTIONS[i + 1]
      const dayAfter = new Date(older.date + 'T12:00:00Z')
      dayAfter.setUTCDate(dayAfter.getUTCDate() + 1)
      expect(younger.start, younger.label).toBe(dayAfter.toISOString().slice(0, 10))
    }
    // oldest row anchors at the dataset's onset month
    expect(OAKLAND_ELECTIONS[OAKLAND_ELECTIONS.length - 1].start).toBe('2010-10-01')
  })
  it('is newest-first with start < end everywhere', () => {
    for (const c of OAKLAND_ELECTIONS) expect(c.start < c.end, c.label).toBe(true)
    for (let i = 0; i < OAKLAND_ELECTIONS.length - 1; i++) {
      expect(OAKLAND_ELECTIONS[i].date > OAKLAND_ELECTIONS[i + 1].date).toBe(true)
    }
  })
  it('prior-cycle: Nov 2024 → Nov 2022; the Apr 2025 special has no prior', () => {
    const nov24 = OAKLAND_ELECTIONS.find((c) => c.label === 'Nov 2024')!
    expect(findPriorCycle(nov24, OAKLAND_ELECTIONS)?.label).toBe('Nov 2022')
    const apr25 = OAKLAND_ELECTIONS.find((c) => c.label === 'Apr 2025')!
    expect(findPriorCycle(apr25, OAKLAND_ELECTIONS)).toBeNull()
  })
  it('findCycleForRange + cityElections resolve per city', () => {
    const apr25 = OAKLAND_ELECTIONS.find((c) => c.label === 'Apr 2025')!
    expect(findCycleForRange(apr25.start, apr25.end, OAKLAND_ELECTIONS)?.label).toBe('Apr 2025')
    expect(findCycleForRange(apr25.start, apr25.end)).toBeNull() // SF table: no such window
    expect(cityElections('sf')).toBe(SF_ELECTIONS)
    expect(cityElections('oakland')).toBe(OAKLAND_ELECTIONS)
  })
  it('SF table is newest-first and Nov 2026 → prior Nov 2024', () => {
    expect(SF_ELECTIONS[0].label).toBe('Nov 2026')
    for (let i = 0; i < SF_ELECTIONS.length - 1; i++) {
      expect(SF_ELECTIONS[i].date > SF_ELECTIONS[i + 1].date, SF_ELECTIONS[i].label).toBe(true)
    }
    expect(findPriorCycle(SF_ELECTIONS[0])?.label).toBe('Nov 2024')
  })
  it('SF defaults untouched: no-arg calls still read SF_ELECTIONS', () => {
    expect(getDefaultCycle().label).toBe(getDefaultCycle(SF_ELECTIONS).label)
    const nov24sf = SF_ELECTIONS.find((c) => c.label === 'Nov 2024')!
    expect(findPriorCycle(nov24sf)?.label).toBe('Nov 2022')
  })
})
