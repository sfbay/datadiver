import { describe, it, expect } from 'vitest'
import { currentCountsFromRows, CURRENT_MIN_INTERVAL_MS } from './useAnomalyBaseline'

describe('currentCountsFromRows', () => {
  it('parses grouped rows into { neighborhood: count } with integer counts', () => {
    expect(currentCountsFromRows([
      { neighborhood: 'Mission', cnt: '42' },
      { neighborhood: 'Tenderloin', cnt: '7' },
    ])).toEqual({ Mission: 42, Tenderloin: 7 })
  })
  it('skips rows with no neighborhood (Socrata omits the aliased key for the NULL group)', () => {
    expect(currentCountsFromRows([
      { cnt: '999' },
      { neighborhood: '', cnt: '5' },
      { neighborhood: 'Mission', cnt: '3' },
    ])).toEqual({ Mission: 3 })
  })
  it('last row wins on a duplicate neighborhood', () => {
    expect(currentCountsFromRows([
      { neighborhood: 'Mission', cnt: '1' },
      { neighborhood: 'Mission', cnt: '9' },
    ])).toEqual({ Mission: 9 })
  })
  it('skips an unparseable count rather than storing NaN', () => {
    expect(currentCountsFromRows([
      { neighborhood: 'Mission', cnt: 'n/a' },
      { neighborhood: 'Castro', cnt: '12' },
    ])).toEqual({ Castro: 12 })
  })
  it('returns an empty record for no rows', () => {
    expect(currentCountsFromRows([])).toEqual({})
  })
})

describe('CURRENT_MIN_INTERVAL_MS', () => {
  it('spaces current-count refreshes at two minutes', () => {
    expect(CURRENT_MIN_INTERVAL_MS).toBe(2 * 60 * 1000)
  })
})
