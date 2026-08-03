import { describe, it, expect } from 'vitest'
import {
  planCrimeEra,
  dayBefore,
  normalizeHistoricalIncident,
  historicalHourClause,
  titleCaseDistrict,
  mergeAggRows,
  HISTORICAL_NEIGHBORHOOD_BY_REGION_ID,
  CRIME_ERA_SEAM,
  CRIME_HISTORY_MIN,
} from './crimeEra'

describe('planCrimeEra', () => {
  it('a modern range asks only the modern dataset', () => {
    const p = planCrimeEra({ start: '2025-01-01', end: '2025-12-31' })
    expect(p.era).toBe('current')
    expect(p.historicalRange).toBeNull()
    expect(p.currentRange).toEqual({ start: '2025-01-01', end: '2025-12-31' })
    expect(p.categoryFilterAvailable).toBe(true)
    expect(p.cadLinkAvailable).toBe(true)
  })

  it('a wholly pre-2018 range asks only the historical dataset', () => {
    const p = planCrimeEra({ start: '2010-03-01', end: '2010-03-31' })
    expect(p.era).toBe('historical')
    expect(p.currentRange).toBeNull()
    expect(p.historicalRange).toEqual({ start: '2010-03-01', end: '2010-03-31' })
  })

  // THE OVERLAP: tmnf-yvry runs to 2018-05-15 and wg3w-h783 starts 2018-01-01,
  // carrying the same incidents. Cutting the seam at 2018-01-01 — historical
  // strictly below, current at-or-above — is what stops the double count.
  it('a straddling range splits at the seam with no overlapping day', () => {
    const p = planCrimeEra({ start: '2017-06-01', end: '2019-06-01' })
    expect(p.era).toBe('straddle')
    expect(p.historicalRange).toEqual({ start: '2017-06-01', end: '2017-12-31' })
    expect(p.currentRange).toEqual({ start: CRIME_ERA_SEAM, end: '2019-06-01' })
    // The two sub-ranges must not share a single day.
    expect(p.historicalRange!.end < p.currentRange!.start).toBe(true)
  })

  it('clamps below the historical floor instead of asking for 1998', () => {
    const p = planCrimeEra({ start: '1998-01-01', end: '2005-01-01' })
    expect(p.historicalRange!.start).toBe(CRIME_HISTORY_MIN)
  })

  it('disables the modern-only capabilities whenever historical rows are in range', () => {
    for (const range of [
      { start: '2010-01-01', end: '2010-06-01' },
      { start: '2017-06-01', end: '2019-06-01' },
    ]) {
      const p = planCrimeEra(range)
      // The violent/property/QoL groups are built on modern category names and
      // would match NOTHING pre-2018 — disabled beats silently empty.
      expect(p.categoryFilterAvailable).toBe(false)
      // cad_number (the 911 cross-reference) does not exist pre-2018.
      expect(p.cadLinkAvailable).toBe(false)
    }
  })

  it('treats the seam day itself as modern', () => {
    const p = planCrimeEra({ start: CRIME_ERA_SEAM, end: '2018-02-01' })
    expect(p.era).toBe('current')
    expect(p.historicalRange).toBeNull()
  })
})

describe('dayBefore', () => {
  it('steps back one calendar day, including across month and year ends', () => {
    expect(dayBefore('2018-01-01')).toBe('2017-12-31')
    expect(dayBefore('2016-03-01')).toBe('2016-02-29') // leap year
  })
})

describe('normalizeHistoricalIncident', () => {
  const row = {
    pdid: '16020415607021',
    incidntnum: '160204156',
    date: '2016-03-03T00:00:00.000',
    time: '19:30',
    category: 'VEHICLE THEFT',
    descript: 'STOLEN AUTOMOBILE',
    resolution: 'NONE',
    address: '100 Block of BEPLER ST',
    pddistrict: 'TARAVAL',
    x: '-122.46354501681947',
    y: '37.70796836450968',
    region_id: '35',
  }

  it('reassembles a FLOATING SF-local timestamp from the split date and time', () => {
    const n = normalizeHistoricalIncident(row)!
    // No offset, no Z — the same convention every other DataSF field uses.
    expect(n.incident_datetime).toBe('2016-03-03T19:30:00')
  })

  it('resolves the computed-region id to an Analysis Neighborhood name', () => {
    expect(normalizeHistoricalIncident(row)!.analysis_neighborhood).toBe('Sunset/Parkside')
  })

  it('matches modern police_district casing so the eras group together', () => {
    expect(normalizeHistoricalIncident(row)!.police_district).toBe('Taraval')
  })

  it('leaves genuinely-absent fields empty rather than faking them', () => {
    const n = normalizeHistoricalIncident(row)!
    expect(n.cad_number).toBe('')       // no 911 cross-reference existed
    expect(n.incident_subcategory).toBe('')
    expect(n.isHistorical).toBe(true)
  })

  it('drops the latitude-90 null island but keeps ordinary coordinates', () => {
    expect(normalizeHistoricalIncident({ ...row, y: '90', x: '-120.5' })!.latitude).toBeNull()
    expect(normalizeHistoricalIncident(row)!.latitude).toBeCloseTo(37.70796, 4)
  })

  it('falls back to midnight on a malformed clock, and rejects a row with no date', () => {
    expect(normalizeHistoricalIncident({ ...row, time: '7:3' })!.incident_datetime)
      .toBe('2016-03-03T00:00:00')
    expect(normalizeHistoricalIncident({ ...row, date: undefined })).toBeNull()
  })

  it('carries every region id in the published map', () => {
    expect(Object.keys(HISTORICAL_NEIGHBORHOOD_BY_REGION_ID)).toHaveLength(41)
    expect(HISTORICAL_NEIGHBORHOOD_BY_REGION_ID['36']).toBe('Tenderloin')
    expect(HISTORICAL_NEIGHBORHOOD_BY_REGION_ID['20']).toBe('Mission')
  })
})

describe('historicalHourClause', () => {
  // `time` is text, so date_extract_hh is impossible; the column is
  // zero-padded 'HH:MM' (measured min '00:01', max '23:59'), which makes
  // lexicographic comparison a valid hour filter.
  it('builds an inclusive text range for a normal window', () => {
    expect(historicalHourClause(7, 8)).toBe("time >= '07:00' AND time <= '08:59'")
  })
  it('ORs a window that wraps past midnight, like the modern clause does', () => {
    expect(historicalHourClause(22, 3)).toBe("(time >= '22:00' OR time <= '03:59')")
  })
  it('zero-pads single-digit hours so the string compare stays valid', () => {
    expect(historicalHourClause(0, 5)).toContain("'00:00'")
  })
})

describe('titleCaseDistrict', () => {
  it('normalizes shouted district names, preserving separators', () => {
    expect(titleCaseDistrict('TARAVAL')).toBe('Taraval')
    expect(titleCaseDistrict('BAYVIEW')).toBe('Bayview')
    expect(titleCaseDistrict('')).toBe('')
  })
})

describe('mergeAggRows', () => {
  it('sums a neighborhood that appears in both eras and re-sorts by total', () => {
    const merged = mergeAggRows(
      [{ analysis_neighborhood: 'Mission', incident_count: '100' },
       { analysis_neighborhood: 'Tenderloin', incident_count: '90' }],
      [{ analysis_neighborhood: 'Mission', incident_count: '50' },
       { analysis_neighborhood: 'Marina', incident_count: '20' }],
      'analysis_neighborhood',
      'incident_count',
    )
    expect(merged[0]).toEqual({ analysis_neighborhood: 'Mission', incident_count: '150' })
    expect(merged.map((r) => r.analysis_neighborhood)).toEqual(['Mission', 'Tenderloin', 'Marina'])
  })
  it('drops blank labels rather than creating an empty bucket', () => {
    const merged = mergeAggRows(
      [{ k: '', c: '5' }, { k: 'A', c: '1' }], [], 'k', 'c',
    )
    expect(merged).toEqual([{ k: 'A', c: '1' }])
  })
})
