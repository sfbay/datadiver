import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Storefront, StorefrontSnapshot, VisibleOwner } from '@/lib/storefronts/types'
import * as R from './storylineRows'

// The Storylines rail's lists, pinned against the COMMITTED snapshot
// (asOf 2026-09-24). Regenerating storefronts.json = re-pin here in the same
// commit, like storefronts.test.ts — the failing pins are the checklist.
const snapshot = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../public/data/restaurants/storefronts.json', import.meta.url)), 'utf8'),
) as StorefrontSnapshot & { stats: { turnover: number; buckets: Record<string, number>; episodes2024: { repeatKeys: number }; episodes2020: { repeatKeys: number } } }

describe('turnover', () => {
  const rows = R.turnoverRows(snapshot, null)

  it('lists every storefront meeting the bar, by strict chain length', () => {
    expect(snapshot.asOf).toBe('2026-09-24')
    expect(rows.length).toBe(snapshot.stats.turnover)
    expect(rows.length).toBe(124)
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].chainStrict).toBeGreaterThanOrEqual(rows[i].chainStrict)
    expect(rows.slice(0, 2).map((s) => s.key).sort()).toEqual(['2704 24TH ST', '570 GREEN ST'])
  })

  it('bucket counts match the generator and the filter partitions the list', () => {
    const counts = R.bucketCounts(snapshot)
    expect(counts).toEqual(snapshot.stats.buckets)
    for (const b of R.BUCKET_ORDER) expect(R.turnoverRows(snapshot, b).length).toBe(counts[b])
  })

  it('parses ?bucket= strictly', () => {
    expect(R.parseBucket('same-owner')).toBe('same-owner')
    expect(R.parseBucket('nope')).toBeNull()
    expect(R.parseBucket(null)).toBeNull()
  })

  it('the chain runs oldest first and keeps the one-timers (marked, not dropped)', () => {
    const s = snapshot.storefronts.find((x) => x.key === '2704 24TH ST')!
    const chain = R.chainOperators(s)
    expect(chain.map((o) => R.displayName(o.name))).toEqual(['Almanac San Francisco', 'Seven Stills', 'Brewvino Sf', 'Ayahuazka Restaurant', 'Caprizza Ristorante'])
    expect(chain.filter((o) => o.seenOnce).length).toBe(2)
  })
})

describe('closures (snapshot)', () => {
  const rows = R.repeatClosureRows(snapshot)

  it('every row meets the repeat bar; 2024+ permits match the generator exactly', () => {
    for (const r of rows) expect(r.barCount).toBeGreaterThanOrEqual(2)
    expect(rows.filter((r) => r.era === 2024).length).toBe(snapshot.stats.episodes2024.repeatKeys)
    expect(rows.filter((r) => r.era === 2024).length).toBe(30)
    // One 2020–23 facility sits at an address left out of the file.
    expect(rows.filter((r) => r.era === 2020).length).toBe(39)
  })

  it('never merges two permits at one door (615 Cortland: Moki’s and Kiwa)', () => {
    const keys = new Set(rows.map((r) => `${r.era}|${r.permit}`))
    expect(keys.size).toBe(rows.length)
  })

  it('names the business operating at the closure, not the current tenant (D5)', () => {
    const yarsa = rows.find((r) => r.permit === '103413')!
    expect(yarsa.name).toBe('Yarsa Nepalese Cuisine')
    expect(yarsa.episodes.length).toBe(3)
  })

  it('the lede figures share one scope (2024+ episodes at storefronts in the file)', () => {
    expect(R.closureLedeFigures(snapshot)).toEqual({ cleared: 299, clearedWithinADay: 163 })
  })

  it('the length bins reconcile with the chip’s numeral (one scope, one reading)', () => {
    const bins = R.closureDurationBins(snapshot)
    const lede = R.closureLedeFigures(snapshot)
    const cleared = bins['same-day'] + bins['one-day'] + bins.week + bins.month + bins.longer
    expect(cleared).toBe(lede.cleared)
    expect(bins['same-day'] + bins['one-day']).toBe(lede.clearedWithinADay)
    // Every 2024+ episode lands in exactly one bin.
    const all = snapshot.storefronts.reduce((n, s) => n + s.episodes.filter((e) => e.era === 2024).length, 0)
    expect(R.DURATION_BIN_ORDER.reduce((n, b) => n + bins[b], 0)).toBe(all)
    expect(bins['no-record']).toBeGreaterThan(0)
  })

  it('bins one episode by the same-day / ≤1 / ≤7 / ≤30 / longer / no-record ladder', () => {
    const e = (p: Partial<{ clearedOn: string | null; days: number | null; sameDay: boolean }>) => ({ clearedOn: '2024-02-01', days: 5, sameDay: false, ...p })
    expect(R.durationBin(e({ sameDay: true, days: null }))).toBe('same-day')
    expect(R.durationBin(e({ days: 1 }))).toBe('one-day')
    expect(R.durationBin(e({ days: 7 }))).toBe('week')
    expect(R.durationBin(e({ days: 8 }))).toBe('month')
    expect(R.durationBin(e({ days: 31 }))).toBe('longer')
    expect(R.durationBin(e({ clearedOn: null, days: null }))).toBe('no-record')
  })
})

describe('closures (live list)', () => {
  const byPermit = R.permitIndex(snapshot)
  const mapped = snapshot.storefronts.find((s) => s.permits.length > 0)!

  it('newest first; a permit on the map resolves to its storefront, any other is never located', () => {
    const rows = R.closureListRows(
      [
        { key: mapped.permits[0], start: '2025-10-02', clearedOn: '2025-10-05', days: 3, sameDay: false, closureVisits: 1, closureDates: ['2025-10-02'], afterBreak: true },
        { permit: 'NOT-A-PERMIT', start: '2026-01-15', clearedOn: null, days: null, sameDay: false, name: 'A TRUCK' },
      ],
      byPermit,
    )
    expect(rows.map((r) => r.episode.start)).toEqual(['2026-01-15', '2025-10-02'])
    expect(rows[0].storefront).toBeNull()
    expect(rows[0].name).toBe('A Truck')
    expect(rows[1].storefront?.key).toBe(mapped.key)
  })
})

describe('neighborhood rates', () => {
  const socrata = [
    { analysis_neighborhood: 'North Beach', closed: '17', yellow: '20', inspected: '254' },
    { analysis_neighborhood: 'Mission', closed: '37', yellow: '40', inspected: '822' },
    { analysis_neighborhood: 'Seacliff', closed: '1', yellow: '0', inspected: '12' },
    { closed: '3', yellow: '1', inspected: '40' },
  ]

  it('reads Socrata strings and the hook’s numeric rows alike', () => {
    const a = R.normalizeRates(socrata)
    const b = R.normalizeRates([{ nhood: 'North Beach', closed: 17, yellow: 20, inspected: 254 }, { nhood: '', closed: 3, yellow: 1, inspected: 40 }])
    expect(a.map((r) => r.nhood)).toEqual(['North Beach', 'Mission', 'Seacliff'])
    expect(b.map((r) => r.nhood)).toEqual(['North Beach'])
    expect(a[0].closedShare).toBeCloseTo(17 / 254)
  })

  it('under 50 places inspected is unrated and sorts last', () => {
    const rows = R.sortRates(R.normalizeRates(socrata), 'closed')
    expect(rows.map((r) => r.nhood)).toEqual(['North Beach', 'Mission', 'Seacliff'])
    expect(rows[2].rated).toBe(false)
    expect(rows[2].closedShare).toBeNull()
  })

  it('citywide sums every row, unplaced places included', () => {
    const c = R.citywideRate(socrata)
    expect([c.closed, c.inspected]).toEqual([58, 1128])
  })

  it('range spans rated rows only', () => {
    const [lo, hi] = R.shareRange(R.normalizeRates(socrata), 'closed')
    expect(lo).toBeCloseTo(37 / 822)
    expect(hi).toBeCloseTo(17 / 254)
    expect(R.pct(17 / 254)).toBe('6.7%')
  })
})

describe('owners', () => {
  const { ranked, contract } = R.ownerLists(snapshot)
  const byKey = R.storefrontIndex(snapshot)

  it('contract operators fold out of the ranking; the ranking is by size, never by closures', () => {
    expect(ranked.length + contract.length).toBe(snapshot.owners.length)
    expect(contract.length).toBe(10)
    for (const o of ranked) expect(o.contract).toBeNull()
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].storefronts.length).toBeGreaterThanOrEqual(ranked[i].storefronts.length)
    expect(ranked[0].name).toBe('Starbucks Corporation')
  })

  it('closures carry a denominator of the storefronts actually checked', () => {
    for (const o of snapshot.owners) {
      const t = R.ownerClosureTally(o, byKey)
      expect(t.storefronts).toBe(o.storefronts.length)
      expect(t.checked).toBe(o.storefronts.filter((k) => byKey.has(k)).length)
    }
    const little = snapshot.owners.find((o) => o.name === 'Little Sweet Inc')!
    expect(R.ownerClosureTally(little, byKey)).toEqual({ closures: 2, checked: 8, storefronts: 9 })
    expect(R.ownerClosuresPhrase({ closures: 2, checked: 8, storefronts: 9 })).toBe('Two closures since 2020 across eight of its nine storefronts on the map')
    expect(R.ownerClosuresPhrase({ closures: 0, checked: 4, storefronts: 4 })).toBe('No closures since 2020 across its four storefronts on the map')
    expect(R.ownerClosuresPhrase({ closures: 0, checked: 0, storefronts: 4 })).toBeNull()
  })

  it('counts a closure only inside the owner’s own business’s span', () => {
    const s: Storefront = {
      key: '1 TEST ST',
      address: '1 Test St',
      nhood: null,
      lat: null,
      lng: null,
      permits: [],
      operators: [
        { name: 'OLD', firstDate: '2020-01-01', lastDate: '2021-12-31', dates: 5, eras: [2020], seenOnce: false, strict: true, inChain: true, owner: { name: 'Other LLC', kind: 'company', mailCity: null } },
        { name: 'NEW', firstDate: '2022-06-01', lastDate: '2025-01-01', dates: 5, eras: [2024], seenOnce: false, strict: true, inChain: true, owner: { name: 'Mine, LLC', kind: 'company', mailCity: null } },
      ],
      chainStrict: 2,
      chainAll: 2,
      turnoverBucket: null,
      lanes: { scores2016: [], placards2020: [] },
      episodes: [
        { permit: 'a', era: 2020, start: '2021-03-01', clearedOn: '2021-03-04', days: 3, closureVisits: 1, sameDay: false, afterBreak: false, familyIds: [] },
        { permit: 'b', era: 2024, start: '2024-05-01', clearedOn: '2024-05-01', days: null, closureVisits: 1, sameDay: true, afterBreak: false, familyIds: [] },
      ],
      repeatCurrent: false,
    }
    const o: VisibleOwner = { name: 'MINE LLC', kind: 'company', mailCity: null, storefronts: ['1 TEST ST', 'NOT IN FILE'], brands: [], contract: null }
    expect(R.ownerClosureTally(o, new Map([[s.key, s]]))).toEqual({ closures: 1, checked: 1, storefronts: 2 })
  })

  it('shared addresses list the FACT, most companies first', () => {
    const rows = R.sharedAddressRows(snapshot)
    expect(rows.length).toBe(163)
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].companies.length).toBeGreaterThanOrEqual(rows[i].companies.length)
  })

  it('names the evidence behind curated groups, or nothing while none exist', () => {
    expect(R.groupEvidencePhrase([])).toBeUndefined()
    expect(R.groupEvidencePhrase([{ evidence: [{ kind: 'group-website' }, { kind: 'registry-mailing-address' }] }])).toBe(
      'the city business registry and the group’s own website',
    )
  })

  it('match percentage is the generator’s pinned figure', () => {
    expect(Math.round(R.registryMatchPct(snapshot))).toBe(98)
  })
})

// The rail's own reader text obeys the view's banned-word contract
// (restaurantPhrase.test.ts, spec §5).
describe('rail copy — banned words', () => {
  const BANNED_WORDS = ['cursed', 'shell', 'secretly', 'dirty', 'failed', 'reopened', 'sigma', 'yoy', 'baseline', 'score', 'inspector', 'live']
  const BANNED_PHRASES = ['hidden owner', 'still closed', 'closed for good', 'σ', 'z-score', 'year-over-year', 'lives in', 'mailing city on']
  const copy = [
    ...Object.values(R.BUCKET_LABEL),
    ...Object.values(R.BUCKET_SHORT),
    ...Object.values(R.DURATION_BIN_LABEL),
    R.BUCKET_NOTE,
    R.CHAIN_NOTE,
    R.REPEAT_NOTE,
    R.CLOSURE_LEDE_NOTE,
    R.CLOSURE_LIST_NOTE,
    R.OWNER_CLOSURES_NOTE,
    R.FRANCHISE_NOTE,
    R.ownerClosuresPhrase({ closures: 3, checked: 2, storefronts: 5 })!,
  ]
  for (const s of copy) {
    it(s.slice(0, 48), () => {
      const low = s.toLowerCase()
      for (const w of BANNED_WORDS) expect(new RegExp(`\\b${w}\\b`, 'i').test(s), `"${w}" in: ${s}`).toBe(false)
      for (const p of BANNED_PHRASES) expect(low.includes(p), `"${p}" in: ${s}`).toBe(false)
    })
  }
})
