import { describe, it, expect } from 'vitest'
import { GIFT_CAP, matchNotices, commonNameGuard, buildFunderProfile } from './funderStats'
import type { VariantRow, YearRow, RecipientRow, GiftRow, FunderVariant } from './types'

// --- Moritz-shaped fixture (spec §1 probe facts) ---------------------------
// 2 cities (San Francisco / Menlo Park), 5 ZIPs, 3 recipients spanning all
// three stance buckets, Schedule A (cash) + C (in-kind) gifts, one S497
// notice that matches a real gift within 30 days (dropped) and one that
// matches nobody (stays pending). `gifts` and `byYear` are built to agree to
// the cent, as they do in production when the row count is under GIFT_CAP.

const REC1_NAME = 'Manny Yekutiel for Supervisor 2026'
const REC1_TYPE = 'Candidate or Officeholder' // → stance candidate
const REC2_NAME = 'Yes on K, Ocean Beach Park for All Sponsored By Community Nonprofits'
const REC2_TYPE = 'Primarily Formed Measure' // → stance yes (counts as "measure" in recipientCounts)
const REC3_NAME = 'Neighbors For A Better San Francisco'
const REC3_TYPE = 'General Purpose' // → stance pac

const moritzVariants: VariantRow[] = [
  { transaction_first_name: 'Michael', transaction_last_name: 'Moritz', transaction_city: 'San Francisco', transaction_state: 'CA', transaction_zip: '94103', transaction_employer: 'SEQUOIA CAPITAL', transaction_occupation: 'Investor', entity_code: 'IND', gifts: '8', total: '2000000' },
  { transaction_first_name: 'Michael', transaction_last_name: 'Moritz', transaction_city: 'San Francisco', transaction_state: 'CA', transaction_zip: '94123', transaction_employer: 'SEQUOIA HERITAGE', transaction_occupation: 'Investor', entity_code: 'IND', gifts: '5', total: '1500000' },
  { transaction_first_name: 'Michael', transaction_last_name: 'Moritz', transaction_city: 'San Francisco', transaction_state: 'CA', transaction_zip: '94117', transaction_employer: 'HRTG PARTNERS', transaction_occupation: 'Investor', entity_code: 'IND', gifts: '2', total: '300000' },
  { transaction_first_name: 'MICHAEL', transaction_last_name: 'Moritz', transaction_city: 'Menlo Park', transaction_state: 'CA', transaction_zip: '94025', transaction_employer: 'SEQUOIA INVESTMENTS', transaction_occupation: 'Investor', entity_code: 'IND', gifts: '3', total: '500000' },
  { transaction_first_name: 'Michael', transaction_last_name: 'Moritz', transaction_city: 'Menlo Park', transaction_state: 'CA', transaction_zip: '94125', transaction_employer: 'SEQUOIA CAPITAL', transaction_occupation: 'Investor', entity_code: 'IND', gifts: '2', total: '200000' },
]

const moritzByYear: YearRow[] = [
  { y: '2003', form_type: 'A', gifts: '2', total: '50000' },
  { y: '2010', form_type: 'A', gifts: '3', total: '300000' },
  { y: '2020', form_type: 'C', gifts: '1', total: '20000' },
  { y: '2024', form_type: 'A', gifts: '2', total: '500000' },
  { y: '2024', form_type: 'C', gifts: '1', total: '12418.42' },
  { y: '2025', form_type: 'A', gifts: '2', total: '250000' },
  { y: '2026', form_type: 'A', gifts: '2', total: '200000' },
]

const moritzRecipients: RecipientRow[] = [
  { filer_nid: 'REC1', filer_name: REC1_NAME, filer_type: REC1_TYPE, gifts: '6', total: '412418.42', first_date: '2003-03-01', last_date: '2026-02-15' },
  { filer_nid: 'REC2', filer_name: REC2_NAME, filer_type: REC2_TYPE, gifts: '4', total: '520000', first_date: '2003-05-01', last_date: '2025-02-05' },
  { filer_nid: 'REC3', filer_name: REC3_NAME, filer_type: REC3_TYPE, gifts: '3', total: '400000', first_date: '2010-02-01', last_date: '2026-03-01' },
]

const moritzGifts: GiftRow[] = [
  { transaction_id: 'g1', calculated_date: '2003-03-01', calculated_amount: '30000', form_type: 'A', record_type: 'RCPT', filer_nid: 'REC1', filer_name: REC1_NAME, filer_type: REC1_TYPE },
  { transaction_id: 'g2', calculated_date: '2003-05-01', calculated_amount: '20000', form_type: 'A', record_type: 'RCPT', filer_nid: 'REC2', filer_name: REC2_NAME, filer_type: REC2_TYPE },
  { transaction_id: 'g3', calculated_date: '2010-01-15', calculated_amount: '100000', form_type: 'A', record_type: 'RCPT', filer_nid: 'REC1', filer_name: REC1_NAME, filer_type: REC1_TYPE },
  { transaction_id: 'g4', calculated_date: '2010-02-01', calculated_amount: '150000', form_type: 'A', record_type: 'RCPT', filer_nid: 'REC3', filer_name: REC3_NAME, filer_type: REC3_TYPE },
  { transaction_id: 'g5', calculated_date: '2010-03-01', calculated_amount: '50000', form_type: 'A', record_type: 'RCPT', filer_nid: 'REC2', filer_name: REC2_NAME, filer_type: REC2_TYPE },
  { transaction_id: 'g6', calculated_date: '2020-06-01', calculated_amount: '20000', form_type: 'C', record_type: 'RCPT', filer_nid: 'REC1', filer_name: REC1_NAME, filer_type: REC1_TYPE },
  { transaction_id: 'g7', calculated_date: '2024-01-10', calculated_amount: '400000', form_type: 'A', record_type: 'RCPT', filer_nid: 'REC2', filer_name: REC2_NAME, filer_type: REC2_TYPE },
  { transaction_id: 'g8', calculated_date: '2024-02-10', calculated_amount: '100000', form_type: 'A', record_type: 'RCPT', filer_nid: 'REC3', filer_name: REC3_NAME, filer_type: REC3_TYPE },
  { transaction_id: 'g9', calculated_date: '2024-03-10', calculated_amount: '12418.42', form_type: 'C', record_type: 'RCPT', filer_nid: 'REC1', filer_name: REC1_NAME, filer_type: REC1_TYPE },
  { transaction_id: 'g10', calculated_date: '2025-01-05', calculated_amount: '200000', form_type: 'A', record_type: 'RCPT', filer_nid: 'REC1', filer_name: REC1_NAME, filer_type: REC1_TYPE },
  { transaction_id: 'g11', calculated_date: '2025-02-05', calculated_amount: '50000', form_type: 'A', record_type: 'RCPT', filer_nid: 'REC2', filer_name: REC2_NAME, filer_type: REC2_TYPE },
  { transaction_id: 'g12', calculated_date: '2026-02-15', calculated_amount: '50000', form_type: 'A', record_type: 'RCPT', filer_nid: 'REC1', filer_name: REC1_NAME, filer_type: REC1_TYPE },
  { transaction_id: 'g13', calculated_date: '2026-03-01', calculated_amount: '150000', form_type: 'A', record_type: 'RCPT', filer_nid: 'REC3', filer_name: REC3_NAME, filer_type: REC3_TYPE },
]

const moritzNotices: GiftRow[] = [
  // matches g12 (REC1, $50,000, 2026-02-15) 14 days later — dropped
  { calculated_date: '2026-03-01', calculated_amount: '50000', form_type: 'F497P1', record_type: 'S497', filer_nid: 'REC1', filer_name: REC1_NAME, filer_type: REC1_TYPE },
  // matches nobody — stays pending
  { calculated_date: '2026-04-07', calculated_amount: '2000000', form_type: 'F496P3', record_type: 'RCPT', filer_nid: 'X', filer_name: 'Unknown Independent Expenditure Committee' },
]

const moritzInput = {
  key: 'MICHAEL|MORITZ',
  variants: moritzVariants,
  byYear: moritzByYear,
  recipients: moritzRecipients,
  gifts: moritzGifts,
  notices: moritzNotices,
  currentYear: 2026,
}

describe('matchNotices', () => {
  it('drops a notice matching filer + amount + within 30 days; leaves an unmatched one pending', () => {
    const { pending } = matchNotices(moritzGifts, moritzNotices)
    expect(pending).toHaveLength(1)
    expect(pending[0]?.filer_nid).toBe('X')
    expect(pending[0]?.calculated_amount).toBe('2000000')
  })

  it('does not match beyond 30 days even with equal filer + amount', () => {
    const gifts: GiftRow[] = [{ calculated_date: '2026-01-01', calculated_amount: '1000', form_type: 'A', filer_nid: 'R', filer_name: 'R' }]
    const notices: GiftRow[] = [{ calculated_date: '2026-02-15', calculated_amount: '1000', form_type: 'S497', filer_nid: 'R', filer_name: 'R' }] // 45 days
    expect(matchNotices(gifts, notices).pending).toHaveLength(1)
  })

  it('does not match when amounts differ by half a cent or more', () => {
    const gifts: GiftRow[] = [{ calculated_date: '2026-01-01', calculated_amount: '1000', form_type: 'A', filer_nid: 'R', filer_name: 'R' }]
    const notices: GiftRow[] = [{ calculated_date: '2026-01-10', calculated_amount: '1000.01', form_type: 'S497', filer_nid: 'R', filer_name: 'R' }]
    expect(matchNotices(gifts, notices).pending).toHaveLength(1)
  })
})

describe('commonNameGuard', () => {
  it('trips on >1 distinct city AND >3 distinct 5-digit ZIPs (Moritz: 2 cities, 5 zips)', () => {
    const variants: FunderVariant[] = moritzVariants.map((v) => ({
      first: v.transaction_first_name,
      last: v.transaction_last_name,
      city: v.transaction_city,
      zip: v.transaction_zip,
      gifts: Number(v.gifts),
      total: parseFloat(v.total),
    }))
    const guard = commonNameGuard(variants)
    expect(guard.tripped).toBe(true)
    expect(guard.cities).toHaveLength(2)
    expect(guard.zips).toHaveLength(5)
  })

  it('does not trip on a one-city three-ZIP variant set', () => {
    const variants: FunderVariant[] = [
      { last: 'Donor', city: 'San Francisco', zip: '94103', gifts: 1, total: 100 },
      { last: 'Donor', city: 'San Francisco', zip: '94104', gifts: 1, total: 100 },
      { last: 'Donor', city: 'San Francisco', zip: '94105', gifts: 1, total: 100 },
    ]
    const guard = commonNameGuard(variants)
    expect(guard.tripped).toBe(false)
    expect(guard.cities).toEqual(['SAN FRANCISCO'])
    expect(guard.zips).toHaveLength(3)
  })

  it('cities/zips are always filled, even when not tripped', () => {
    const variants: FunderVariant[] = [{ last: 'Donor', city: 'Oakland', zip: '94601', gifts: 1, total: 1 }]
    const guard = commonNameGuard(variants)
    expect(guard.tripped).toBe(false)
    expect(guard.cities).toEqual(['OAKLAND'])
    expect(guard.zips).toEqual(['94601'])
  })
})

describe('buildFunderProfile — Moritz-shaped fixture', () => {
  it('drops the matched notice, keeps the unmatched one pending, and excludes pending from total', () => {
    const profile = buildFunderProfile(moritzInput)
    expect(profile.pending).toEqual({ count: 1, total: 2000000 })
    expect(profile.total).toBeCloseTo(1332418.42, 2)
  })

  it('cash = Σ form A, inKind = Σ form C, total = cash + inKind', () => {
    const profile = buildFunderProfile(moritzInput)
    expect(profile.cash).toBeCloseTo(1300000, 2)
    expect(profile.inKind).toBeCloseTo(32418.42, 2)
    expect(profile.total).toBeCloseTo(profile.cash + profile.inKind, 6)
  })

  it('median differs from average on the fixture', () => {
    const profile = buildFunderProfile(moritzInput)
    expect(profile.average).not.toBeNull()
    expect(profile.median).not.toBeNull()
    expect(profile.median).toBe(50000)
    expect(profile.average).not.toBeCloseTo(profile.median!, 0)
  })

  it('median is null when a 5,000-row gifts array is passed (capped)', () => {
    const cappedGifts: GiftRow[] = Array.from({ length: GIFT_CAP }, (_, i) => ({
      transaction_id: `c${i}`,
      calculated_date: '2026-01-01',
      calculated_amount: '100',
      form_type: 'A',
      record_type: 'RCPT',
      filer_nid: 'REC1',
      filer_name: REC1_NAME,
      filer_type: REC1_TYPE,
    }))
    const profile = buildFunderProfile({
      ...moritzInput,
      gifts: cappedGifts,
      byYear: [{ y: '2026', form_type: 'A', gifts: String(GIFT_CAP), total: String(GIFT_CAP * 100) }],
    })
    expect(profile.capped).toBe(true)
    expect(profile.median).toBeNull()
    const y2026 = profile.byYear.find((y) => y.year === 2026)
    expect(y2026?.byType).toBeNull()
  })

  it('guard trips on the fixture (2 cities, 5 zips)', () => {
    const profile = buildFunderProfile(moritzInput)
    expect(profile.guard.tripped).toBe(true)
    expect(profile.guard.cities).toHaveLength(2)
    expect(profile.guard.zips).toHaveLength(5)
  })

  it('byYear runs 2003..currentYear, zero-fills a dark year, and marks the last entry partial', () => {
    const profile = buildFunderProfile(moritzInput)
    expect(profile.byYear[0]?.year).toBe(2003)
    expect(profile.byYear[profile.byYear.length - 1]).toMatchObject({ year: 2026, partial: true })
    expect(profile.byYear.find((y) => y.year !== 2026)?.partial).toBe(false)
    const dark = profile.byYear.find((y) => y.year === 2004)
    expect(dark).toMatchObject({ gifts: 0, cash: 0, inKind: 0 })
  })

  it('byType dollar sums equal the year\'s cash + in-kind, to the cent', () => {
    const profile = buildFunderProfile(moritzInput)
    for (const y of profile.byYear) {
      if (!y.byType) continue
      const sum = y.byType.candidate + y.byType.measure + y.byType.pac
      expect(Math.round((sum - (y.cash + y.inKind)) * 100)).toBe(0)
    }
    // spot-check a year with mixed recipient types
    const y2024 = profile.byYear.find((y) => y.year === 2024)
    expect(y2024?.byType).toEqual({ candidate: 12418.42, measure: 400000, pac: 100000 })
  })

  it('recipients sorted by total desc with stance set; recipientCounts folds yes/no/measure together', () => {
    const profile = buildFunderProfile(moritzInput)
    expect(profile.recipients.map((r) => r.filerNid)).toEqual(['REC2', 'REC1', 'REC3'])
    expect(profile.recipients[0]?.stance.kind).toBe('yes')
    expect(profile.recipients[1]?.stance.kind).toBe('candidate')
    expect(profile.recipients[2]?.stance.kind).toBe('pac')
    expect(profile.recipientCounts).toEqual({ candidate: 1, measure: 1, pac: 1 })
  })

  it('null recipients → recipients: [] and byType: null for every year', () => {
    const profile = buildFunderProfile({ ...moritzInput, recipients: null })
    expect(profile.recipients).toEqual([])
    expect(profile.recipientCounts).toEqual({ candidate: 0, measure: 0, pac: 0 })
    expect(profile.byYear.every((y) => y.byType === null)).toBe(true)
    // totals still come from byYear regardless
    expect(profile.total).toBeCloseTo(1332418.42, 2)
  })

  it('null variants → variants: [], guard untripped, no primary city / top employers', () => {
    const profile = buildFunderProfile({ ...moritzInput, variants: null })
    expect(profile.variants).toEqual([])
    expect(profile.guard).toEqual({ tripped: false, cities: [], zips: [] })
    expect(profile.primaryCity).toBeUndefined()
    expect(profile.topEmployers).toEqual([])
  })

  it('null byYear → empty span, null first/last year, zero totals', () => {
    const profile = buildFunderProfile({ ...moritzInput, byYear: null })
    expect(profile.byYear).toEqual([])
    expect(profile.firstYear).toBeNull()
    expect(profile.lastYear).toBeNull()
    expect(profile.activeYears).toBe(0)
    expect(profile.total).toBe(0)
  })

  it('null gifts → not capped, no median, no byType, empty gift list; totals unaffected', () => {
    const profile = buildFunderProfile({ ...moritzInput, gifts: null })
    expect(profile.capped).toBe(false)
    expect(profile.median).toBeNull()
    expect(profile.byYear.every((y) => y.byType === null)).toBe(true)
    expect(profile.giftList).toEqual([])
    expect(profile.total).toBeCloseTo(1332418.42, 2)
  })

  it('empty (non-null) gifts array → median null, not capped', () => {
    const profile = buildFunderProfile({ ...moritzInput, gifts: [] })
    expect(profile.capped).toBe(false)
    expect(profile.median).toBeNull()
  })

  it('primary city = the city with the most dollars across variants', () => {
    const profile = buildFunderProfile(moritzInput)
    expect(profile.primaryCity).toBe('San Francisco')
  })

  it('top employers = top two by dollars, persons only, sentence-cased', () => {
    const profile = buildFunderProfile(moritzInput)
    expect(profile.topEmployers).toEqual(['Sequoia Capital', 'Sequoia Heritage'])
  })
})

describe('recipient renamed-committee merge (review fix)', () => {
  // The `recipients` builder groups server-side on filer_nid + filer_name +
  // filer_type — a committee that renames mid-life (real case: filer_nid
  // 211776936 carries six names across 2024–2026) comes back as several
  // RecipientRows for ONE committee. buildFunderProfile must merge them by
  // filer_nid before FunderList ever sees a `key` collision.
  it('merges same-filer_nid rows into one FunderRecipient: summed gifts/total, min/max dates, higher-dollar name', () => {
    const recipients: RecipientRow[] = [
      { filer_nid: 'REC1', filer_name: 'Old Committee Name', filer_type: 'General Purpose', gifts: '2', total: '10000', first_date: '2024-01-01', last_date: '2024-06-01' },
      { filer_nid: 'REC1', filer_name: 'New Committee Name', filer_type: 'General Purpose', gifts: '3', total: '25000', first_date: '2025-01-01', last_date: '2026-01-01' },
      { filer_nid: 'REC2', filer_name: 'Other PAC', filer_type: 'General Purpose', gifts: '1', total: '5000', first_date: '2024-05-01', last_date: '2024-05-01' },
    ]
    const profile = buildFunderProfile({ key: '|TEST', variants: [], byYear: [], recipients, gifts: [], notices: [], currentYear: 2026 })

    expect(profile.recipients).toHaveLength(2)
    const rec1 = profile.recipients.find((r) => r.filerNid === 'REC1')
    expect(rec1).toMatchObject({
      filerName: 'New Committee Name', // higher-dollar row wins the display name
      gifts: 5, // 2 + 3
      total: 35000, // 10000 + 25000
      firstDate: '2024-01-01', // min
      lastDate: '2026-01-01', // max
    })
  })

  it('recipients.length equals distinct filer_nids, not raw RecipientRow count', () => {
    const recipients: RecipientRow[] = [
      { filer_nid: 'REC1', filer_name: 'A', filer_type: 'General Purpose', gifts: '1', total: '1000' },
      { filer_nid: 'REC1', filer_name: 'B', filer_type: 'General Purpose', gifts: '1', total: '2000' },
      { filer_nid: 'REC1', filer_name: 'C', filer_type: 'General Purpose', gifts: '1', total: '3000' },
      { filer_nid: 'REC2', filer_name: 'D', filer_type: 'General Purpose', gifts: '1', total: '1000' },
    ]
    const profile = buildFunderProfile({ key: '|TEST2', variants: [], byYear: [], recipients, gifts: [], notices: [], currentYear: 2026 })
    expect(profile.recipients).toHaveLength(2)
    expect(new Set(profile.recipients.map((r) => r.filerNid)).size).toBe(profile.recipients.length)
  })
})

describe('FunderRecipient.pending', () => {
  it('sums unmatched-notice dollars for that recipient (distinct from the top-level pending total)', () => {
    const gifts: GiftRow[] = [
      { calculated_date: '2026-01-10', calculated_amount: '10000', form_type: 'A', record_type: 'RCPT', filer_nid: 'REC9', filer_name: 'Some PAC' },
    ]
    const recipients: RecipientRow[] = [
      { filer_nid: 'REC9', filer_name: 'Some PAC', filer_type: 'General Purpose', gifts: '1', total: '10000' },
    ]
    const notices: GiftRow[] = [
      // different amount than the one real gift → no match → pending, attributed to REC9
      { calculated_date: '2026-06-01', calculated_amount: '5000', form_type: 'S497', record_type: 'S497', filer_nid: 'REC9', filer_name: 'Some PAC' },
    ]
    const byYear: YearRow[] = [{ y: '2026', form_type: 'A', gifts: '1', total: '10000' }]
    const profile = buildFunderProfile({ key: '|SOME PAC', variants: [], byYear, recipients, gifts, notices, currentYear: 2026 })
    expect(profile.pending).toEqual({ count: 1, total: 5000 })
    expect(profile.recipients[0]?.pending).toBe(5000)
  })
})
