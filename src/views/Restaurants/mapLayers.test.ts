import { describe, it, expect } from 'vitest'
import type { Storefront } from '@/lib/storefronts/types'
import {
  inSf, displayAddress, displayName, ringRank, chainLine, turnoverFeatures, latestReadings, closureFeatures,
  ownerFeatures, selectedFeature, themePaint, TURNOVER_LAYERS, CLOSURE_LAYERS, OWNER_LAYERS,
  RING_LAYER_IDS, PLACARD_POINT_LAYER_IDS, OWNER_LAYER_IDS, RING_MIN_ZOOM, currentOperator, storefrontPanelPx, type ClosureMapPoint,
} from './mapLayers'

const op = (name: string, strict = true) => ({
  name, firstDate: '2020-01-01', lastDate: '2020-06-01', dates: strict ? 2 : 1, eras: [2020 as const],
  seenOnce: !strict, strict, inChain: true, owner: null,
})

const sf = (key: string, over: Partial<Storefront> = {}): Storefront => ({
  key, address: key, nhood: 'Mission', lat: 37.76, lng: -122.42, permits: [], operators: [op('A')],
  chainStrict: 1, chainAll: 1, turnoverBucket: null, lanes: { scores2016: [], placards2020: [] }, episodes: [],
  repeatCurrent: false, ...over,
})

const props = (fc: GeoJSON.FeatureCollection) => fc.features.map((f) => f.properties as Record<string, unknown>)

describe('display helpers', () => {
  it('collapses the post-2025 address padding and keeps ordinals lowercase', () => {
    expect(displayAddress('1148   MISSION ST')).toBe('1148 Mission St')
    expect(displayAddress('2704 24TH ST')).toBe('2704 24th St')
    expect(displayAddress(null)).toBe('')
  })
  it('title-cases an all-caps DBA and leaves a mixed-case one as published', () => {
    expect(displayName('CAPRIZZA RISTORANTE')).toBe('Caprizza Ristorante')
    expect(displayName('Brew Vino, LLC')).toBe('Brew Vino, LLC')
  })
  it('keeps only SF-land coordinates', () => {
    expect(inSf(37.76, -122.42)).toBe(true)
    expect(inSf(0, 0)).toBe(false)
    expect(inSf(null, -122.42)).toBe(false)
  })
})

describe('turnover rings', () => {
  it('ranks by strict operators, clamped 1…5', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(ringRank)).toEqual([1, 1, 2, 3, 4, 5, 5])
  })

  it('names the strict chain only (one-timers that are not strict drop out)', () => {
    expect(chainLine({ operators: [op('ALMANAC'), op('SEVEN STILLS', false), op('Caprizza')] })).toBe('Almanac → Caprizza')
  })

  it('a bucket keeps its own rings and turns everyone else into texture — no dim mask', () => {
    const rows = [
      sf('A', { chainStrict: 4, turnoverBucket: 'same-owner' }),
      sf('B', { chainStrict: 3, turnoverBucket: 'three-owners' }),
      sf('C', { chainStrict: 2 }),
    ]
    expect(props(turnoverFeatures(rows)).map((p) => p.rank)).toEqual([4, 3, 2])
    const bucketed = props(turnoverFeatures(rows, { bucket: 'same-owner' }))
    expect(bucketed.map((p) => [p.key, p.rank])).toEqual([['A', 4], ['C', 1]])
  })

  it('never draws a storefront without SF coordinates', () => {
    expect(turnoverFeatures([sf('X', { lat: null, lng: null })]).features).toHaveLength(0)
  })

  it('flags the repeat-closure center dot from the CURRENT permit only (D5)', () => {
    expect(props(turnoverFeatures([sf('A', { repeatCurrent: true })]))[0].repeat).toBe(1)
  })

  it('draws every rank as its own layers, the 5-ring rank last, with the zoom floors the spec sets', () => {
    const ids = TURNOVER_LAYERS.map((l) => l.id)
    for (const id of RING_LAYER_IDS) expect(ids).toContain(id)
    const r5 = ids.filter((id) => id.startsWith('ring-r5-'))
    expect(r5).toHaveLength(5)
    expect(ids.filter((id) => id.startsWith('ring-r4-'))).toHaveLength(4)
    expect(ids.filter((id) => id.startsWith('ring-r3-'))).toHaveLength(3)
    expect(ids.filter((id) => id.startsWith('ring-r2-'))).toEqual(['ring-r2-2']) // one thin ring
    // rank 5 is drawn after every other rank (only the center dot rides on top)
    expect(ids.indexOf('ring-r5-5')).toBeGreaterThan(Math.max(...ids.filter((id) => /^ring-r[1-4]/.test(id)).map((id) => ids.indexOf(id))))
    expect(RING_MIN_ZOOM).toEqual({ 5: 0, 4: 0, 3: 11, 2: 14, 1: 15 })
  })
})

describe('latest reading (Q3a + Q3b)', () => {
  const T = 'T00:00:00.000'
  it('is the non-pass reading on the last date, else Pass', () => {
    const m = latestReadings(
      [
        { permit_number: '1', last_date: `2025-10-01${T}`, last_pass: `2025-09-01${T}` },
        { permit_number: '2', last_date: `2025-10-01${T}`, last_pass: `2025-10-01${T}` },
        { permit_number: '3', last_date: `2025-10-01${T}` },
        { permit_number: '4', last_date: `2025-10-01${T}`, last_pass: `2025-10-01${T}` },
      ],
      [
        { permit_number: '1', inspection_date: `2025-10-01${T}`, facility_rating_status: 'Closure' },
        // closed and cleared the same day → Pass
        { permit_number: '2', inspection_date: `2025-10-01${T}`, facility_rating_status: 'Closure' },
        // closed earlier in the window, since cleared → Pass, but still "closed in window"
        { permit_number: '4', inspection_date: `2025-08-01${T}`, facility_rating_status: 'Closure' },
        { permit_number: '3', inspection_date: `2025-10-01${T}`, facility_rating_status: 'Closure' },
        { permit_number: '3', inspection_date: `2025-10-01${T}`, facility_rating_status: 'Conditional Pass' },
      ],
    )
    expect(m.get('1')).toEqual({ latest: 'closure', closedInWindow: true, yellowInWindow: false })
    expect(m.get('2')?.latest).toBe('pass')
    expect(m.get('3')).toEqual({ latest: 'conditional', closedInWindow: true, yellowInWindow: true })
    expect(m.get('4')).toEqual({ latest: 'pass', closedInWindow: true, yellowInWindow: false })
  })
})

describe('closures lens', () => {
  const pt = (permit: string, latest: ClosureMapPoint['latest'], over: Partial<ClosureMapPoint> = {}): ClosureMapPoint => ({
    permit, name: permit, address: permit, lat: 37.76, lng: -122.42, lastDate: '2025-10-01', latest,
    closedInWindow: latest === 'closure', yellowInWindow: latest === 'conditional', key: null, ...over,
  })

  it('ranks repeat bar 1 · closed 2 · yellow 3 · pass 4, and draws a repeat door once', () => {
    const fc = closureFeatures({
      points: [pt('p1', 'closure', { key: 'R' }), pt('p2', 'closure'), pt('p3', 'conditional'), pt('p4', 'pass')],
      repeatStorefronts: [sf('R', { permits: ['p1'], repeatCurrent: true })],
      placard: null,
    })
    expect(props(fc).map((p) => [p.permit, p.rank])).toEqual([['p1', 1], ['p2', 2], ['p3', 3], ['p4', 4]])
  })

  it('a place closed once and since cleared reads Pass — never red (D5)', () => {
    const fc = closureFeatures({ points: [pt('p', 'pass', { closedInWindow: true })], repeatStorefronts: [], placard: null })
    expect(props(fc)[0].rank).toBe(4)
  })

  it('the "closed" filter keeps places closed in the window; a repeat door survives only if one of its permits did', () => {
    const fc = closureFeatures({
      points: [pt('p1', 'pass', { closedInWindow: true }), pt('p2', 'pass')],
      repeatStorefronts: [sf('R1', { permits: ['p1'] }), sf('R2', { permits: ['zz'] })],
      placard: 'closure',
    })
    expect(props(fc).map((p) => p.key || p.permit)).toEqual(['R1', 'p1'])
  })

  it('the repeat layer is every zoom and drawn last; one closure is never on it', () => {
    const ids = CLOSURE_LAYERS.map((l) => l.id)
    expect(ids[ids.length - 1]).toBe('placard-repeat-core')
    expect(PLACARD_POINT_LAYER_IDS[0]).toBe('placard-repeat-core')
    const core = CLOSURE_LAYERS.find((l) => l.id === 'placard-repeat-core') as { minzoom?: number; filter: unknown }
    expect(core.minzoom).toBeUndefined()
    expect(core.filter).toEqual(['==', ['get', 'rank'], 1])
    const zooms = Object.fromEntries(CLOSURE_LAYERS.map((l) => [l.id, (l as { minzoom?: number }).minzoom]))
    expect([zooms['placard-closure'], zooms['placard-conditional'], zooms['placard-pass']]).toEqual([12, 13, 14])
  })
})

describe('owners lens', () => {
  it('haloes the selected owner at every zoom; everyone else is a pinprick', () => {
    const fc = ownerFeatures([sf('A'), sf('B')], new Set(['B']))
    expect(props(fc).map((p) => [p.key, p.hit])).toEqual([['A', 0], ['B', 1]])
    expect(OWNER_LAYERS.every((l) => (l as { type: string }).type === 'circle')).toBe(true) // no connecting lines
    expect(OWNER_LAYER_IDS[0]).toBe('owner-core')
  })
})

describe('selected + theme', () => {
  it('draws the selected door only when it has SF coordinates', () => {
    expect(selectedFeature(sf('A')).features).toHaveLength(1)
    expect(selectedFeature(sf('A', { lat: null })).features).toHaveLength(0)
    expect(selectedFeature(null).features).toHaveLength(0)
  })
  it('keylines follow the theme: paper on espresso, espresso on cream', () => {
    const dark = themePaint(true).find((p) => p.layer === 'placard-repeat-core')
    const light = themePaint(false).find((p) => p.layer === 'placard-repeat-core')
    expect(dark?.value).toBe('#f5ecd9')
    expect(light?.value).toBe('#1e140d')
    // every ring gets a theme value; only the rank-5 outer ring is keylined
    const rings = themePaint(false).filter((p) => p.layer.startsWith('ring-r'))
    expect(rings.filter((p) => p.value === '#1e140d').map((p) => p.layer)).toEqual(['ring-r5-5'])
  })
})

describe('currentOperator — the ONE "who is here now" authority', () => {
  it('is the operator seen LAST, not the one that started last', () => {
    const s = sf('1800 FOLSOM ST', {
      operators: [
        { ...op('Foods Co #357'), firstDate: '2017-03-22', lastDate: '2026-02-03' },
        { ...op('EL ALAMBRE #2'), firstDate: '2022-09-30', lastDate: '2023-06-29' },
      ],
      repeatCurrent: true,
    })
    expect(currentOperator(s)?.name).toBe('Foods Co #357')
    expect(props(turnoverFeatures([s], {}))[0].now).toBe('Foods Co #357')
    expect(props(ownerFeatures([s], new Set()))[0].now).toBe('Foods Co #357')
    expect(currentOperator(sf('X', { operators: [] }))).toBeNull()
  })

  it('names the permit holder at the two committed doors where the rules disagreed on a repeat mark', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const snap = JSON.parse(readFileSync(join(process.cwd(), 'public/data/restaurants/storefronts.json'), 'utf8')) as { storefronts: Storefront[] }
    const at = (key: string) => snap.storefronts.find((x) => x.key === key)!
    // Both closures at 1800 Folsom sit on Foods Co's permit 61514.
    expect(currentOperator(at('1800 FOLSOM ST'))?.name).toBe('Foods Co #357')
    // 595 Market's closures are Uno Dos Taco's (permit 78070), not a 2019 one-sighting smoothie stand.
    expect(currentOperator(at('595 MARKET ST'))?.name).toBe('UNO DOS TACO')
    for (const key of ['1800 FOLSOM ST', '595 MARKET ST']) {
      expect(at(key).repeatCurrent).toBe(true)
      expect(props(turnoverFeatures([at(key)], {}))[0].now).toBe(displayName(currentOperator(at(key))!.name))
    }
  })
})

describe('storefrontPanelPx — the width the fly-to offset clears', () => {
  it('is 28rem on desktop, widened by Large Type, capped by the viewport gutters', () => {
    expect(storefrontPanelPx(16, 1440, false)).toBe(448)
    expect(storefrontPanelPx(16 * 1.18, 1440, false)).toBeCloseTo(528.64)
    expect(storefrontPanelPx(16, 420, false)).toBe(380)
  })
  it('is the mobileCompact 54vw on a phone — the door lands left of the card, not under it', () => {
    expect(storefrontPanelPx(16, 390, true)).toBeCloseTo(210.6)
  })
})
