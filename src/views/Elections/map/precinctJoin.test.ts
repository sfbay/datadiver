import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { PrecinctRaceFile, PrecinctTurnoutFile } from '@/types/elections'
import type { ReplayPaintRow } from '@/lib/rcv/replay'
import { buildPrecinctFeatures, candidateShares, FLIP_LIFT } from './precinctJoin'
import { leaderOf, leaderShareQuartiles } from './precinctPaint'

// Real committed files as fixtures — the join is only as good as its
// behavior against the actual emitted data (paths are repo-root relative;
// vitest runs with cwd = repo root).
const load = <T,>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T

const turnout2020 = load<PrecinctTurnoutFile>('public/data/elections/results/20201103/precincts/_turnout.json')
const turnout2024 = load<PrecinctTurnoutFile>('public/data/elections/results/20241105/precincts/_turnout.json')
const president2024 = load<PrecinctRaceFile>('public/data/elections/results/20241105/precincts/president-and-vice-president.json')
const geo2012 = load<GeoJSON.FeatureCollection>('public/data/elections/geo/prec-2012.geojson')
const geo2022 = load<GeoJSON.FeatureCollection>('public/data/elections/geo/prec-2022.geojson')

const base = {
  colorMap: new Map<string, string>(),
  raceIsProp: false,
  raceIsRCV: false,
  selectedNeighborhood: null,
  focusCandidate: null,
}

describe('buildPrecinctFeatures — turnout mode, 2020 legacy era', () => {
  const fc = buildPrecinctFeatures({
    ...base,
    bundle: { dateCode: '20201103', era: 'prec_2012', turnout: turnout2020, race: null },
    geometry: geo2012,
    mode: 'turnout',
  })

  it('expands the consolidated label "1104/1105" to two features with identical paint', () => {
    const members = fc.features.filter((f) => f.properties?.label === '1104/1105')
    expect(members).toHaveLength(2)
    expect(members[0].properties?.fillColor).toBe(members[1].properties?.fillColor)
    expect(members[0].properties?.turnoutPct).toBeCloseTo(0.8333, 3)
  })

  it('unmapped rows produce zero features', () => {
    expect(fc.features.some((f) => f.properties?.label === '7055')).toBe(false)
  })

  it('paints every mapped row that has geometry', () => {
    const mappedRows = Object.values(turnout2020.precincts).filter((r) => !r.unmapped)
    const expectedIds = mappedRows.flatMap((r) => r.ids)
    // one stray zero-registration id may lack geometry; everything else paints
    expect(fc.features.length).toBeGreaterThanOrEqual(expectedIds.length - 1)
    expect(fc.features.length).toBeLessThanOrEqual(expectedIds.length)
  })
})

describe('buildPrecinctFeatures — results mode, 2024', () => {
  const fc = buildPrecinctFeatures({
    ...base,
    colorMap: new Map([['KAMALA D. HARRIS / TIM WALZ', '#616a96']]),
    bundle: { dateCode: '20241105', era: 'prec_2022', turnout: turnout2024, race: president2024 },
    geometry: geo2022,
    mode: 'results',
  })

  it('every 2024 turnout row paints exactly one feature (501 rows, single ids)', () => {
    expect(fc.features).toHaveLength(501)
  })

  it('cleans candidate names so the color map joins', () => {
    const harrisLed = fc.features.filter((f) => f.properties?.fillColor === '#616a96')
    expect(harrisLed.length).toBeGreaterThan(400) // SF 2024: Harris led nearly everywhere
  })

  it('carries dejargoned tooltip fields', () => {
    const f = fc.features.find((x) => x.properties?.label === '1101')
    expect(f?.properties?.tipLeaderName).toBe('Harris')
    expect(String(f?.properties?.tipLeaderPhrase)).toMatch(/in 10 votes|nearly every vote/)
    expect(f?.properties?.votes).toBeGreaterThan(0)
  })

  it('a selected neighborhood lifts fill opacity on its precincts only', () => {
    const sel = buildPrecinctFeatures({
      ...base,
      colorMap: new Map([['KAMALA D. HARRIS / TIM WALZ', '#616a96']]),
      bundle: { dateCode: '20241105', era: 'prec_2022', turnout: turnout2024, race: president2024 },
      geometry: geo2022,
      mode: 'results',
      selectedNeighborhood: 'INNER RICHMOND',
    })
    const inside = sel.features.filter((f) => f.properties?.selected === true)
    const outside = sel.features.filter((f) => f.properties?.selected === false)
    expect(inside.length).toBeGreaterThan(0)
    const pair = (fs: GeoJSON.Feature[]) => fs.map((f) => f.properties?.fillOpacity as number)
    expect(Math.max(...pair(inside))).toBeGreaterThan(Math.min(...pair(outside)))
  })
})

describe('candidateShares — per-candidate share + extent', () => {
  it("Trump's 2024 president share by precinct, extent within [0,1]", () => {
    const { byLabel, extent } = candidateShares(president2024, 'DONALD J. TRUMP / JD VANCE')
    expect(byLabel.size).toBeGreaterThan(400)
    expect(extent).not.toBeNull()
    expect(extent![0]).toBeGreaterThanOrEqual(0)
    expect(extent![1]).toBeLessThanOrEqual(1)
    expect(extent![0]).toBeLessThan(extent![1])
  })
})

describe('buildPrecinctFeatures — candidate focus mode, 2024 president', () => {
  const fc = buildPrecinctFeatures({
    ...base,
    colorMap: new Map([['DONALD J. TRUMP / JD VANCE', '#963e30']]),
    bundle: { dateCode: '20241105', era: 'prec_2022', turnout: turnout2024, race: president2024 },
    geometry: geo2022,
    mode: 'results',
    focusCandidate: 'DONALD J. TRUMP / JD VANCE',
  })

  it('produces 501 features, all painted the focus hue, with varying opacity', () => {
    expect(fc.features).toHaveLength(501)
    const colors = new Set(fc.features.map((f) => f.properties?.fillColor))
    expect(colors).toEqual(new Set(['#963e30']))
    const opacities = fc.features.map((f) => f.properties?.fillOpacity as number)
    expect(Math.min(...opacities)).toBeLessThan(Math.max(...opacities))
  })

  it('carries a sane extent-derived tooltip with the focused candidate name', () => {
    const f = fc.features.find((x) => x.properties?.label === '1101')
    expect(f?.properties?.tipLeaderName).toBe('Trump')
  })
})

describe('buildPrecinctFeatures — leader view now spreads across quartile steps (2024 president)', () => {
  it('paints at least 3 distinct opacity values (the quartile fix, pinned)', () => {
    const fc = buildPrecinctFeatures({
      ...base,
      colorMap: new Map([['KAMALA D. HARRIS / TIM WALZ', '#616a96'], ['DONALD J. TRUMP / JD VANCE', '#963e30']]),
      bundle: { dateCode: '20241105', era: 'prec_2022', turnout: turnout2024, race: president2024 },
      geometry: geo2022,
      mode: 'results',
    })
    const distinctOpacities = new Set(fc.features.map((f) => f.properties?.fillOpacity))
    expect(distinctOpacities.size).toBeGreaterThanOrEqual(3)
  })
})

describe('buildPrecinctFeatures — replay lens (leader steps + drain + flip lift)', () => {
  const harrisColor = '#616a96'
  const trumpColor = '#963e30'
  const colorMap = new Map([
    ['KAMALA D. HARRIS / TIM WALZ', harrisColor],
    ['DONALD J. TRUMP / JD VANCE', trumpColor],
  ])

  const toReplayRow = (raceRow: { votes: Record<string, number>; total: number }): ReplayPaintRow => ({
    votes: raceRow.votes,
    total: raceRow.total,
    drainShare: 0,
    flipped: false,
  })

  // Real 2024 president votes drive the replay rows — same leader/share
  // spread the existing quartile-fix test relies on, just fed through the
  // replay lens instead of `bundle.race`.
  const fullReplayRows: Record<string, ReplayPaintRow> = Object.fromEntries(
    Object.entries(president2024.precincts).map(([label, row]) => [label, toReplayRow(row)]),
  )

  // Quartiles are now passed IN (fixed per race, spec §4.3) — computed here
  // the same way Elections does it: leader shares of the round-1 rows over
  // turnout-joined labels.
  const quartilesOf = (rows: Record<string, ReplayPaintRow>): [number, number, number] | null => {
    const shares: number[] = []
    for (const [label, row] of Object.entries(turnout2024.precincts)) {
      if (row.unmapped) continue
      const replayRow = rows[label]
      if (!replayRow || replayRow.total === 0) continue
      const leader = leaderOf(replayRow.votes)
      if (leader) shares.push(leader.share)
    }
    return leaderShareQuartiles(shares)
  }
  const fixedQuartiles = quartilesOf(fullReplayRows)

  const buildWithReplay = (
    rows: Record<string, ReplayPaintRow>,
    lift = false,
    quartiles: [number, number, number] | null = fixedQuartiles,
  ) =>
    buildPrecinctFeatures({
      ...base,
      colorMap,
      bundle: { dateCode: '20241105', era: 'prec_2022', turnout: turnout2024, race: president2024 },
      geometry: geo2022,
      mode: 'results',
      focusCandidate: 'DONALD J. TRUMP / JD VANCE',
      replay: { rows, quartiles, round: 3, totalRounds: 5, lift },
    })

  it('preempts focusCandidate — precinct 1101 (Harris-led) paints Harris color, not the focus hue', () => {
    const fc = buildWithReplay(fullReplayRows)
    const f = fc.features.find((x) => x.properties?.label === '1101')
    // Under focus mode EVERY feature paints the focus (Trump) hue regardless
    // of who actually leads there — painting Harris's color at a Harris-led
    // precinct is only possible if replay preempted focus mode.
    expect(f?.properties?.fillColor).toBe(harrisColor)
    expect(f?.properties?.fillColor).not.toBe(trumpColor)
  })

  it('a turnout label missing from replay.rows is skipped (unpainted)', () => {
    const rest = { ...fullReplayRows }
    delete rest['1101']
    const fc = buildWithReplay(rest)
    expect(fc.features.some((f) => f.properties?.label === '1101')).toBe(false)
    expect(fc.features.some((f) => f.properties?.label === '1102')).toBe(true) // everything else still paints
  })

  it('flipped && lift adds FLIP_LIFT capped at MAX_OPACITY (0.8)', () => {
    const landslideRows: Record<string, ReplayPaintRow> = {
      ...fullReplayRows,
      '1101': { votes: { 'LANDSLIDE CANDIDATE': 99, OTHER: 1 }, total: 100, drainShare: 0, flipped: true },
    }
    const unlifted = buildWithReplay(landslideRows, false)
    const lifted = buildWithReplay(landslideRows, true)
    const unliftedOpacity = unlifted.features.find((x) => x.properties?.label === '1101')?.properties?.fillOpacity
    const liftedOpacity = lifted.features.find((x) => x.properties?.label === '1101')?.properties?.fillOpacity
    expect(unliftedOpacity).toBe(0.7) // top decisiveness step, pre-lift
    expect(liftedOpacity).toBe(0.8) // 0.7 + FLIP_LIFT(0.12) = 0.82, capped at MAX_OPACITY
    expect(liftedOpacity).toBeLessThanOrEqual(0.8)
  })

  it('respects the quartiles passed IN — the same share lands in different steps under different arrays', () => {
    // Precinct 1101: Harris leads with a 72% share, drainShare 0.
    const low = buildWithReplay(fullReplayRows, false, [0.1, 0.2, 0.3])
    const high = buildWithReplay(fullReplayRows, false, [0.8, 0.9, 0.95])
    const opacityAt = (fc: GeoJSON.FeatureCollection) =>
      fc.features.find((x) => x.properties?.label === '1101')?.properties?.fillOpacity
    expect(opacityAt(low)).toBe(0.7) // 0.72 ≥ q[2]=0.3 → top step
    expect(opacityAt(high)).toBe(0.25) // 0.72 < q[0]=0.8 → bottom step
  })

  it('tooltip phrase composes as «Name» — NN% of ballots still counting here; votes = the turnout row\'s ballots cast', () => {
    const fc = buildWithReplay(fullReplayRows)
    const f = fc.features.find((x) => x.properties?.label === '1101')
    expect(f?.properties?.tipLeaderName).toBe('Harris')
    expect(f?.properties?.tipLeaderPhrase).toBe('72% of ballots still counting here')
    // «votes» renders as "votes cast" in the tooltip template — it must
    // carry the turnout row's ballots (660), NOT the round's continuing
    // total (640); the leader phrase is the "still counting" carrier.
    expect(f?.properties?.votes).toBe(turnout2024.precincts['1101'].ballots)
    expect(f?.properties?.votes).toBe(660)
  })
})

describe('name-normalization gate — all six elections', () => {
  const frames: Record<string, Set<string>> = {
    legacy26: new Set(
      load<GeoJSON.FeatureCollection>('public/data/elections/geo/legacy-neighborhoods.geojson')
        .features.map((f) => String(f.properties?.nhood).toUpperCase().trim()),
    ),
    analysis41: new Set(
      load<GeoJSON.FeatureCollection>('public/data/geo/sf-analysis-neighborhoods.geojson')
        .features.map((f) => String(f.properties?.nhood).toUpperCase().trim()),
    ),
  }
  it.each(['20201103', '20220607', '20221108', '20240305', '20241105', '20251104'])(
    '%s: every dsov key matches its era frame OR has zero registration — no third bucket',
    (dc) => {
      const n = load<{ scheme: 'legacy26' | 'analysis41'; neighborhoods: Record<string, { registered: number }> }>(
        `public/data/elections/results/${dc}/neighborhoods.json`,
      )
      for (const [name, row] of Object.entries(n.neighborhoods)) {
        const matches = frames[n.scheme].has(name.toUpperCase().trim())
        expect(matches || row.registered === 0, `${dc} ${name}`).toBe(true)
      }
    },
  )
})
