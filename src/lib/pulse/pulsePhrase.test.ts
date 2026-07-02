// src/lib/pulse/pulsePhrase.test.ts
//
// Guards both contracts of the writing+encoding layer:
//   1. DEJARGON — no statistical term in any reader-facing OR spoken string.
//   2. ENCODING — the structured fields (signalType, magnitude, bigValue,
//      place, factLine) decode each detector's numbers correctly, so the card
//      can render the arrow/pill/big-number without re-deriving anything.

import { describe, it, expect } from 'vitest'
import {
  anomalyToWireItem,
  tickerToWireItem,
  rankWire,
  combinedDeviation,
  NEAR_USUAL_Z,
  type WireItem,
} from './pulsePhrase'
import type { AnomalyResult } from '@/types/last48'
import type { TickerItem } from '@/types/ticker'

const BANNED_TERMS = [
  'σ', 'sigma', 'z-score', 'z score', 'zscore',
  'standard deviation', 'std dev', 'baseline',
  'yoy', 'y-o-y', 'percentile', 'anomaly score', 'delta',
]

// Every string a human or a screen reader can perceive.
function assertNoJargon(item: WireItem | null) {
  expect(item).not.toBeNull()
  const text = `${item!.subject} ${item!.factLine} ${item!.context} ${item!.signalLabel}`.toLowerCase()
  for (const term of BANNED_TERMS) {
    expect(text, `"${term}" leaked into: ${text}`).not.toContain(term)
  }
}

const AT = 1_700_000_000_000

function anomaly(p: Partial<AnomalyResult>): AnomalyResult {
  return {
    neighborhood: 'Mission',
    datasetId: '311-cases',
    count48h: 186,
    baselineMean: 90,
    baselineSd: 30,
    zScore: 3.2,
    ...p,
  }
}

function ticker(p: Partial<TickerItem>): TickerItem {
  return {
    id: 'civic-x',
    headline: 'placeholder',
    category: 'trend',
    severity: 'neutral',
    source: { view: '/x', label: 'X' },
    freshness: 'daily',
    computedAt: new Date(AT),
    priority: 70,
    ...p,
  }
}

describe('anomalyToWireItem — neighborhood volume', () => {
  it('encodes a strong spike as a rising signal with the count as the anchor', () => {
    const w = anomalyToWireItem(anomaly({}), { freshnessOk: true, computedAt: AT })!
    expect(w.signalType).toBe('rise')
    expect(w.magnitude).toBe(3) // z 3.2 → top tier → 3 chevrons
    expect(w.bigValue).toBe('186')
    expect(w.subject).toBe('311 reports')
    expect(w.place).toBe('Mission')
    expect(w.factLine).toBe('usual ≈ 90')
    expect(w.streamLabel).toBe('311')
    expect(w.ratio).toBeCloseTo(186 / 90, 5) // drives the deviation bar
    assertNoJargon(w)
  })

  it('never renders a trailing .0 on rounded thousands ("1K", not "1.0K")', () => {
    const w = anomalyToWireItem(anomaly({ count48h: 1000 }), { freshnessOk: true, computedAt: AT })!
    expect(w.bigValue).toBe('1K')
    const w2 = anomalyToWireItem(anomaly({ count48h: 1234 }), { freshnessOk: true, computedAt: AT })!
    expect(w2.bigValue).toBe('1.2K')
  })

  it('rounds the typical count to a number a person would say', () => {
    const w = anomalyToWireItem(anomaly({ baselineMean: 87.3 }), { freshnessOk: true, computedAt: AT })!
    expect(w.factLine).toBe('usual ≈ 85') // nearest 5, not 87.3
  })

  it('links "dig in" with the FULL drill param set — bare ?nh= is inert on /live', () => {
    const w = anomalyToWireItem(anomaly({ neighborhood: 'Bayview Hunters Point' }), { freshnessOk: true, computedAt: AT })!
    // The param SET is the contract with Last48, not just the nh param: the
    // anomaly fill + neighborhood peek only mount under fill=anomaly + points=off.
    expect(w.evidenceHref).toBe('/live?nh=Bayview%20Hunters%20Point&fill=anomaly&points=off')
  })

  it('drops a weak signal and the synthetic combined row', () => {
    expect(anomalyToWireItem(anomaly({ zScore: 1.0 }), { freshnessOk: true, computedAt: AT })).toBeNull()
    expect(anomalyToWireItem(anomaly({ datasetId: 'combined' }), { freshnessOk: true, computedAt: AT })).toBeNull()
  })

  it('suppresses a "quiet" reading when the stream is behind on publishing', () => {
    expect(
      anomalyToWireItem(anomaly({ count48h: 20, zScore: -2.6 }), { freshnessOk: false, computedAt: AT }),
    ).toBeNull()
  })

  it('encodes a fresh quiet reading as a falling signal, with the magnitude word only in the aria label', () => {
    const w = anomalyToWireItem(anomaly({ count48h: 28, zScore: -2.6 }), { freshnessOk: true, computedAt: AT })!
    expect(w.signalType).toBe('fall')
    expect(w.bigValue).toBe('28')
    // "unusually" lives in the spoken label, never in the visible subject/fact.
    expect(w.signalLabel).toContain('unusually quiet')
    expect(`${w.subject} ${w.factLine}`).not.toContain('unusually')
    assertNoJargon(w)
  })

  it('ranks a strong spike above the citywide tally (priority 92)', () => {
    expect(anomalyToWireItem(anomaly({ zScore: 3.2 }), { freshnessOk: true, computedAt: AT })!.rankScore).toBeGreaterThan(92)
  })
})

describe('tickerToWireItem — citywide signals', () => {
  it('encodes a YoY drop as a falling trend, big number = current value', () => {
    const w = tickerToWireItem(
      ticker({ id: 'civic-crime-incidents', delta: -33, value: '1.2K', priorValue: '1.8K' }),
    )!
    expect(w.signalType).toBe('fall')
    expect(w.magnitude).toBe(2) // 33% → middle tier
    expect(w.bigValue).toBe('1.2K')
    expect(w.subject).toBe('Violent crime')
    expect(w.place).toBeNull() // citywide
    expect(w.factLine).toBe('1.8K a year ago')
    expect(w.signalLabel).toBe('Violent crime, down notably from last year')
    expect(w.ratio).toBeCloseTo(0.67, 5) // 1 + (-33/100) → deviation bar sits below "usual"
    assertNoJargon(w)
  })

  it('drops a trend too small to be a story', () => {
    expect(tickerToWireItem(ticker({ id: 'civic-parking-revenue', delta: 5, value: '$1M' }))).toBeNull()
  })

  it('encodes the live tally as a present-tense signal (no up/down)', () => {
    const w = tickerToWireItem(
      ticker({
        id: 'civic-significant-tally',
        category: 'anomaly',
        severity: 'alert',
        headline: '3 robberies · 2 shootings across SF',
        value: '5',
        priority: 92,
        source: { view: '/live', label: 'The Last 48' },
      }),
    )!
    expect(w.signalType).toBe('live')
    expect(w.bigValue).toBe('5')
    expect(w.subject).toBe('3 robberies, 2 shootings')
    assertNoJargon(w)
  })

  it('encodes the fastest-rising 311 type as a rising trend', () => {
    const w = tickerToWireItem(
      ticker({
        id: 'civic-311-category-surge',
        delta: 42,
        value: '320',
        source: { view: '/311-cases', label: '311 Cases · Graffiti' },
        priority: 82,
      }),
    )!
    expect(w.signalType).toBe('rise')
    expect(w.subject).toBe('Graffiti reports to 311')
    expect(w.signalLabel).toBe('Graffiti reports to 311, up notably from last year')
    assertNoJargon(w)
  })

  it('encodes a milestone as a standing total (no up/down)', () => {
    const w = tickerToWireItem(
      ticker({
        id: 'civic-campaign-finance',
        category: 'milestone',
        value: '$4.2M',
        detail: 'across 38 committees',
        source: { view: '/campaign-finance', label: 'Campaign Finance' },
        priority: 60,
      }),
    )!
    expect(w.signalType).toBe('milestone')
    expect(w.bigValue).toBe('$4.2M')
    expect(w.subject).toBe('raised by campaign committees')
    assertNoJargon(w)
  })
})

describe('rankWire', () => {
  it('orders strongest-signal-first and is deterministic', () => {
    const mk = (id: string, rankScore: number): WireItem => ({
      id, kind: 'trend', signalType: 'rise', magnitude: 1, bigValue: '', context: '',
      subject: '', place: null, factLine: '', signalLabel: '', evidenceHref: '',
      rankScore, freshnessOk: true, at: AT,
    })
    expect(rankWire([mk('a', 70), mk('b', 110), mk('c', 92)]).map((w) => w.id)).toEqual(['b', 'c', 'a'])
  })
})

describe('combinedDeviation — threshold-free phrasing for the rail/peek', () => {
  it('phrases every z, including near-usual (no null below the wire thresholds)', () => {
    const d = combinedDeviation(0.2)
    expect(d.near).toBe(true)
    expect(d.short).toBe('near usual')
  })

  it('maps direction and the Pulse magnitude tiers onto tier words', () => {
    expect(combinedDeviation(1.0)).toMatchObject({ signalType: 'rise', magnitude: 1, near: false, short: 'above usual' })
    expect(combinedDeviation(2.0)).toMatchObject({ signalType: 'rise', magnitude: 2, short: 'well above usual' })
    expect(combinedDeviation(3.0)).toMatchObject({ signalType: 'rise', magnitude: 3, short: 'far above usual' })
    expect(combinedDeviation(-1.0)).toMatchObject({ signalType: 'fall', magnitude: 1, short: 'below usual' })
    expect(combinedDeviation(-2.7)).toMatchObject({ signalType: 'fall', magnitude: 3, short: 'far below usual' })
  })

  it('keeps every short + spoken string jargon-free across the z range', () => {
    for (const z of [-3.5, -2.1, -1.2, -0.4, 0, 0.3, 0.8, 1.7, 2.2, 4]) {
      const d = combinedDeviation(z)
      const text = `${d.short} ${d.spoken}`.toLowerCase()
      for (const term of BANNED_TERMS) {
        expect(text, `"${term}" leaked into combinedDeviation(${z}): ${text}`).not.toContain(term)
      }
    }
  })

  it('NEAR_USUAL_Z is the boundary between "near usual" and a directional word', () => {
    expect(combinedDeviation(NEAR_USUAL_Z - 0.01).near).toBe(true)
    expect(combinedDeviation(NEAR_USUAL_Z).near).toBe(false)
    expect(combinedDeviation(-NEAR_USUAL_Z).near).toBe(false)
  })
})
