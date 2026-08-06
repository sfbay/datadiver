import { describe, it, expect } from 'vitest'
import {
  OAK311_LABELS, OAK311_GROUPS, OAK311_OPEN_STATUSES, isOakCaseOpen,
  oak311Coords, resolutionHoursExpr, buildSf311Where, buildOak311Where,
} from './dialect311'

// Probe-pinned reqcategory vocabulary (all 30 recent tokens, 2026-08-05).
const PROBE_TOKENS = [
  'ILLDUMP', 'ABANDONED AUTO', 'HOMELESS EMT', 'PARKING', 'OTHER', 'BLDGMAINT',
  'STREETSW', 'ELECTRICAL', 'GRAFFITI', 'METER_REPAIR', 'TREES', 'TRAFFIC',
  'KOCB', 'RECYCLING', 'PARKS', 'ROW_INSPECTORS', 'TRAFFIC_ENGIN', 'DRAINAGE',
  'SEWERS', 'ROW_STREETSW', 'CUT_CLEAN', 'ENVIRON_ENF', 'SIDESHOWS', 'FIRE',
  'WATERSHED', 'HE_CLEAN', 'POLICE', 'CW_DIT_GIS', 'FACILITIES', 'SURVEY',
]

describe('OAK311_LABELS', () => {
  it('covers exactly the 30 probe tokens with non-empty reader labels', () => {
    expect(Object.keys(OAK311_LABELS).sort()).toEqual([...PROBE_TOKENS].sort())
    for (const label of Object.values(OAK311_LABELS)) {
      expect(label.length).toBeGreaterThan(0)
      expect(label).not.toMatch(/_/) // coded tokens never leak to readers
    }
  })
})

describe('OAK311_GROUPS', () => {
  it('members are real tokens and groups are disjoint', () => {
    const all = Object.values(OAK311_GROUPS).flat()
    for (const t of all) expect(PROBE_TOKENS.includes(t), t).toBe(true)
    expect(new Set(all).size).toBe(all.length)
  })
})

describe('open-work grammar', () => {
  // Authored set (spec §4): work-order-created and pending ARE open city
  // work; CANCEL and REFERRED are not. Nothing like SF's 'Open' exists.
  it('the authored set, exactly', () => {
    expect([...OAK311_OPEN_STATUSES].sort()).toEqual(
      ['OPEN', 'PENDING', 'WAITING ON CUSTOMER', 'WOCREATE'].sort()
    )
    expect(isOakCaseOpen('WOCREATE')).toBe(true)
    expect(isOakCaseOpen('CANCEL')).toBe(false)
    expect(isOakCaseOpen('REFERRED')).toBe(false)
    expect(isOakCaseOpen(undefined)).toBe(false)
  })
})

describe('oak311Coords', () => {
  it('accepts WGS84 srx/sry (numbers serialized as strings)', () => {
    expect(oak311Coords({ srx: '-122.2712', sry: '37.8044' }))
      .toEqual({ lat: 37.8044, lng: -122.2712 })
  })
  it('rejects the reqaddress-class junk point and out-of-bbox values', () => {
    expect(oak311Coords({ srx: '-141.21915', sry: '30.00993' })).toBeNull()
    expect(oak311Coords({ srx: undefined, sry: '37.8' })).toBeNull()
  })
})

describe('SoQL builders', () => {
  it('SF resolution expression is byte-identical to the legacy literal', () => {
    expect(resolutionHoursExpr('closed_date', 'requested_datetime')).toBe(
      '(date_diff_d(closed_date, requested_datetime) * 86400 + ' +
      '((date_extract_hh(closed_date) - date_extract_hh(requested_datetime)) * 3600 + ' +
      '(date_extract_mm(closed_date) - date_extract_mm(requested_datetime)) * 60 + ' +
      '(date_extract_ss(closed_date) - date_extract_ss(requested_datetime)) + 86400) % 86400) / 3600'
    )
  })
  const opts = {
    dateRange: { start: '2025-01-01', end: '2025-06-30' },
    categoryClause: '', selectedNeighborhood: null, timeOfDayFilter: null,
  }
  it('SF WHERE is byte-identical to the legacy string (replace-pattern fence)', () => {
    expect(buildSf311Where(opts)).toBe(
      "requested_datetime >= '2025-01-01T00:00:00' AND requested_datetime <= '2025-06-30T23:59:59'"
    )
  })
  it('oakland WHERE leads with the replace-compatible clause and filters beats', () => {
    const w = buildOak311Where({ ...opts, selectedNeighborhood: '26Y' })
    expect(w.startsWith("datetimeinit >= '2025-01-01T00:00:00'")).toBe(true)
    expect(w).toContain("beat = '26Y'")
    expect(w.replace("datetimeinit >= '2025-01-01T00:00:00'", 'CHANGED')).not.toBe(w)
  })
})
