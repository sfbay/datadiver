import { describe, it, expect } from 'vitest'
import {
  OAK_BEAT_REGION_FIELD, OAK_CITATION_BEAT_REGIONS, beatToRegionId, regionToBeat,
  OAK_VIOLATION_LABELS, OAK_VIOLATION_GROUPS, oakViolationLabel,
  OAK_HOUR_EXPR, OAK_HOUR_BUCKETS, bucketToHour, bucketsForHours,
  sfViolationClause, sfTodFragment, sfStatsWhere, sfDateOnlyClause,
  oakViolationClause, oakTodClause, oakStatsWhere,
} from './citationsDialect'
import { OAKLAND_BEATS } from '@/cities/oakland/beats'

describe('beat crosswalk', () => {
  it('has exactly 59 one-to-one entries whose values are real beats', () => {
    const ids = Object.keys(OAK_CITATION_BEAT_REGIONS)
    const codes = Object.values(OAK_CITATION_BEAT_REGIONS)
    expect(ids).toHaveLength(59)
    expect(new Set(codes).size).toBe(59)
    const beatSet = new Set(OAKLAND_BEATS as readonly string[])
    for (const c of codes) expect(beatSet.has(c), c).toBe(true)
    for (const id of ids) expect(id).toMatch(/^\d+$/)
  })
  it('inverse round-trips', () => {
    for (const [id, code] of Object.entries(OAK_CITATION_BEAT_REGIONS)) {
      expect(beatToRegionId(code)).toBe(id)
      expect(regionToBeat(id)).toBe(code)
      expect(regionToBeat(Number(id))).toBe(code)
    }
    expect(beatToRegionId('99Z')).toBeNull()
    expect(regionToBeat(null)).toBe('Unknown')
    expect(regionToBeat(undefined)).toBe('Unknown')
  })
})

describe('violation vocabulary', () => {
  it('labels 30 codes; keys look like municipal-code cites', () => {
    expect(Object.keys(OAK_VIOLATION_LABELS)).toHaveLength(30)
    for (const code of Object.keys(OAK_VIOLATION_LABELS)) {
      expect(code).toMatch(/^[0-9][0-9A-Z.]+$/)
    }
  })
  it('every grouped code has a label; groups have >= 2 codes', () => {
    for (const [name, codes] of Object.entries(OAK_VIOLATION_GROUPS)) {
      expect(codes.length, name).toBeGreaterThanOrEqual(2)
      for (const c of codes) expect(OAK_VIOLATION_LABELS[c], `${name}:${c}`).toBeTruthy()
    }
  })
  it('oakViolationLabel prefers the map, falls back to raw desc, then Unknown', () => {
    expect(oakViolationLabel('10.36.050', 'METER VIOL')).toBe('Expired meter')
    expect(oakViolationLabel('9.9.999', 'SOMETHING')).toBe('SOMETHING')
    expect(oakViolationLabel(null, null)).toBe('Unknown')
  })
})

describe('hour module', () => {
  it('OAK_HOUR_EXPR is the pinned SoQL (AM/PM branches FIRST)', () => {
    expect(OAK_HOUR_EXPR).toBe(
      "case(ticket_i_1 like '%AM', 'A' || substring(ticket_i_1, 1, 2), ticket_i_1 like '%PM', 'P' || substring(ticket_i_1, 1, 2), true, substring(ticket_i_1, 1, 2))"
    )
  })
  it('bucketToHour truth table', () => {
    expect(bucketToHour('00')).toBe(0)
    expect(bucketToHour('23')).toBe(23)
    expect(bucketToHour('0:')).toBe(0)
    expect(bucketToHour('9:')).toBe(9)
    expect(bucketToHour('A12')).toBe(0)
    expect(bucketToHour('P12')).toBe(12)
    expect(bucketToHour('A9:')).toBe(9)
    expect(bucketToHour('A09')).toBe(9)
    expect(bucketToHour('P09')).toBe(21)
    expect(bucketToHour('P1:')).toBe(13)
    expect(bucketToHour('24')).toBeNull()
    expect(bucketToHour('A13')).toBeNull()
    expect(bucketToHour('P00')).toBeNull()
    expect(bucketToHour('xx')).toBeNull()
    expect(bucketToHour('')).toBeNull()
    // Socrata OMITS the aliased field for the NULL-time group — the residual
    // arrives as a MISSING KEY (undefined), a different code path than junk.
    expect(bucketToHour(undefined)).toBeNull()
  })
  it('bucketsForHours round-trips and unions to the parseable vocabulary', () => {
    const all = new Set<string>()
    for (let h = 0; h <= 23; h++) {
      for (const b of bucketsForHours([h])) {
        expect(bucketToHour(b)).toBe(h)
        all.add(b)
      }
    }
    const parseable = OAK_HOUR_BUCKETS.filter((b) => bucketToHour(b) !== null)
    expect(all.size).toBe(parseable.length)
  })
})

describe('SF WHERE builders — byte-pins (never change these strings)', () => {
  const range = { start: '2026-07-01', end: '2026-07-31' }
  it('violation clause', () => {
    expect(sfViolationClause(new Set())).toBe('')
    expect(sfViolationClause(new Set(["STR CLEAN", "O'FARRELL"])))
      .toBe("violation_desc IN ('STR CLEAN','O''FARRELL')")
  })
  it('tod fragment (wrap + non-wrap)', () => {
    expect(sfTodFragment(null)).toBe('')
    expect(sfTodFragment({ startHour: 6, endHour: 11 })).toBe(
      'date_extract_hh(citation_issued_datetime) >= 6 AND date_extract_hh(citation_issued_datetime) <= 11'
    )
    expect(sfTodFragment({ startHour: 22, endHour: 3 })).toBe(
      '(date_extract_hh(citation_issued_datetime) >= 22 OR date_extract_hh(citation_issued_datetime) <= 3)'
    )
  })
  it('statsWhere composition', () => {
    expect(sfStatsWhere({ dateRange: range, violationClause: '', selectedNeighborhood: null, todFragment: '' })).toBe(
      "citation_issued_datetime >= '2026-07-01T00:00:00' AND citation_issued_datetime <= '2026-07-31T23:59:59'"
    )
    expect(sfStatsWhere({
      dateRange: range,
      violationClause: "violation_desc IN ('STR CLEAN')",
      selectedNeighborhood: "Fisherman's Wharf",
      todFragment: 'date_extract_hh(citation_issued_datetime) >= 6 AND date_extract_hh(citation_issued_datetime) <= 11',
    })).toBe(
      "citation_issued_datetime >= '2026-07-01T00:00:00' AND citation_issued_datetime <= '2026-07-31T23:59:59' AND violation_desc IN ('STR CLEAN') AND analysis_neighborhood = 'Fisherman''s Wharf' AND date_extract_hh(citation_issued_datetime) >= 6 AND date_extract_hh(citation_issued_datetime) <= 11"
    )
  })
  it('dateOnlyClause', () => {
    expect(sfDateOnlyClause(range, '')).toBe(
      "citation_issued_datetime >= '2026-07-01T00:00:00' AND citation_issued_datetime <= '2026-07-31T23:59:59'"
    )
  })
})

describe('Oakland WHERE builders', () => {
  const range = { start: '2026-01-01', end: '2026-03-31' }
  it('violation clause uses the CODE column', () => {
    expect(oakViolationClause(new Set(['10.36.050']))).toBe("violation IN ('10.36.050')")
  })
  it('statsWhere opens with the replace-compatible date clause and converts beat CODE internally', () => {
    const w = oakStatsWhere({ dateRange: range, violationClause: '', selectedBeat: '07X', todClause: '' })
    expect(w.startsWith("ticket_iss >= '2026-01-01T00:00:00' AND ticket_iss <= '2026-03-31T23:59:59'")).toBe(true)
    // 07X is region 4 in the crosswalk; number column → UNQUOTED numeric
    expect(w).toContain(`${OAK_BEAT_REGION_FIELD} = 4`)
    expect(w).not.toContain("= '4'")
  })
  it('unknown beat yields an impossible numeric filter, not an unfiltered query', () => {
    const w = oakStatsWhere({ dateRange: range, violationClause: '', selectedBeat: 'NOPE', todClause: '' })
    expect(w).toContain(`${OAK_BEAT_REGION_FIELD} = -1`)
  })
  it('tod clause enumerates buckets through the hour vocabulary', () => {
    const clause = oakTodClause({ startHour: 7, endHour: 8 })
    expect(clause.startsWith(`(${OAK_HOUR_EXPR}) IN (`)).toBe(true)
    expect(clause).toContain("'07'")
    expect(clause).toContain("'7:'")
    expect(clause).toContain("'A07'")
    expect(clause).toContain("'A7:'")
    expect(clause).not.toContain("'P07'")
    // wrap-around
    const wrap = oakTodClause({ startHour: 22, endHour: 1 })
    expect(wrap).toContain("'22'")
    expect(wrap).toContain("'01'")
    expect(wrap).not.toContain("'02'")
  })
})
