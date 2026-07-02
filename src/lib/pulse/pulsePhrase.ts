// src/lib/pulse/pulsePhrase.ts
//
// The Pulse wire's WRITING + ENCODING layer — pure, no React, fully tested.
//
// Two jobs, both enforcing Jesse's rule DEJARGON, NOT ENJARGON:
//
//   1. Translate each detector's raw numbers into STRUCTURED fields the card
//      renders visually — direction + magnitude (an arrow, not the word
//      "unusually"), a big-number anchor (the count), a place (a pill), and a
//      short fact line (the comparison number). The "how unusual" signal lives
//      in the GLYPH, so the visible text never repeats "unusually … unusually."
//   2. Keep every reader-facing string free of statistical jargon. The reader
//      never sees a sigma, z-score, "baseline," or "YoY"; zScore is only the
//      ranking key + the source of the magnitude tier.
//
// pulsePhrase.test.ts guards both: no banned term in subject/factLine/signal-
// Label, and the structured fields decode correctly.

import type { AnomalyResult } from '@/types/last48'
import type { TickerItem } from '@/types/ticker'

export type WireKind = 'volume' | 'incident' | 'trend' | 'milestone'

// How the entry reads visually:
//   rise — more/higher/rising than usual (warm up-chevrons)
//   fall — fewer/quieter/falling than usual (cool down-chevrons)
//   live — a present-tense tally, no up/down (pulse dot)
//   milestone — a standing total, no up/down (diamond)
export type SignalType = 'rise' | 'fall' | 'live' | 'milestone'

export interface WireItem {
  id: string
  kind: WireKind

  // ── Visual signal (replaces repetitive "unusually …" prose) ──
  signalType: SignalType
  magnitude: 1 | 2 | 3 // chevron count / emphasis; 0-ish signals use 1
  /** current ÷ typical — drives the deviation bar (1 = normal). undefined for
   *  live tallies + milestones (no "usual" to compare against → no bar). */
  ratio?: number

  // ── Big-number anchor (per-card, informative — NOT the uniform timestamp) ──
  bigValue: string // "186", "1.2K", "5", "$4.2M"
  context: string // small caption under the number: "in the last 48h", "this year"

  // ── Short labels — the glyph carries the magnitude, so these stay terse ──
  subject: string // "311 reports", "Violent crime", "Graffiti reports to 311"
  place: string | null // neighborhood name → bold pill; null → citywide tag
  factLine: string // the bare comparison: "usual ≈ 90", "1.8K a year ago"

  // ── Accessibility: the spoken sentence (carries the magnitude word ONCE,
  //     for screen readers — never rendered visually, so no repetition). ──
  signalLabel: string

  // ── Routing / meta ──
  evidenceHref: string
  rankScore: number
  freshnessOk: boolean
  streamLabel?: string
  pigment?: string
  at: number
}

// ── Stream metadata for the three live 48h streams ──────────────────────────
const STREAM: Record<string, { label: string; noun: string; pigment: string }> = {
  '911-realtime':      { label: '911',      noun: '911 calls',        pigment: '#b85a33' }, // terracotta
  'fire-ems-dispatch': { label: 'Fire/EMS', noun: 'Fire & EMS calls', pigment: '#963e30' }, // brick
  '311-cases':         { label: '311',      noun: '311 reports',      pigment: '#5c9693' }, // dusty teal
}

// Citywide-trend subjects (the ticker's source.label is a view name, not a noun).
const TICKER_SUBJECT: Record<string, string> = {
  'civic-emergency-response': 'Fire & EMS call volume',
  'civic-crime-incidents': 'Violent crime',
  'civic-parking-revenue': 'Parking revenue',
  'civic-parking-citations': 'Parking citations',
}

// Feed pigment for citywide trends (the card's single colour = its dataset,
// matching DataDiver's "same colour = same dataset" convention).
const TICKER_PIGMENT: Record<string, string> = {
  'civic-emergency-response': '#b85a33', // terracotta
  'civic-crime-incidents': '#963e30', // brick
  'civic-parking-revenue': '#5c9693', // teal
  'civic-parking-citations': '#d47149', // terracotta-500
}

// ── Inclusion thresholds ────────────────────────────────────────────────────
// Documented publicly at /about#whats-unusual (About.tsx) — the one place the
// statistical machinery is named, numbers included. Change a threshold here
// (or the tier boundaries below) and that section must change with it.
const VOLUME_MIN_Z = 1.5
const QUIET_MIN_Z = 2.0
const TREND_MIN_PCT = 10

// ── Number humanizers ───────────────────────────────────────────────────────

/** Round to a number a person would say: <10 exact, <100 nearest 5, else 10. */
function roundNice(n: number): number {
  if (n < 10) return Math.round(n)
  if (n < 100) return Math.round(n / 5) * 5
  return Math.round(n / 10) * 10
}

function formatCount(n: number): string {
  // Strip a trailing .0 — "1K", never "1.0K".
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return n.toLocaleString()
}

function volumeTier(absZ: number): 1 | 2 | 3 {
  if (absZ >= 2.6) return 3
  if (absZ >= 1.9) return 2
  return 1
}

function trendTier(absPct: number): 1 | 2 | 3 {
  if (absPct >= 60) return 3
  if (absPct >= 28) return 2
  return 1
}

// Magnitude word — spoken (aria) ONLY, so it can be vivid without repeating
// on screen.
function riseWord(tier: 1 | 2 | 3): string {
  return tier === 3 ? 'far more than usual' : tier === 2 ? 'well above its usual level' : 'a bit above its usual level'
}
function fallWord(tier: 1 | 2 | 3): string {
  return tier === 3 ? 'unusually quiet' : tier === 2 ? 'fewer than usual' : 'a bit below its usual level'
}
// Trends compare to a year ago, not to "usual" — distinct spoken phrasing.
function trendWord(up: boolean, tier: 1 | 2 | 3): string {
  const amt = tier === 3 ? 'sharply' : tier === 2 ? 'notably' : 'slightly'
  return `${up ? 'up' : 'down'} ${amt} from last year`
}

// ── Anomaly (neighborhood volume) → WireItem ────────────────────────────────

export function anomalyToWireItem(
  a: AnomalyResult,
  opts: { freshnessOk: boolean; computedAt: number },
): WireItem | null {
  if (a.datasetId === 'combined') return null
  const meta = STREAM[a.datasetId]
  if (!meta) return null

  const z = a.zScore
  const az = Math.abs(z)
  if (az < VOLUME_MIN_Z) return null

  const fall = z < 0
  // "Quiet" needs a higher bar AND a fresh stream — a stream merely behind on
  // publishing must never read as "unusually quiet" (the Quakebot trap).
  if (fall && (az < QUIET_MIN_Z || !opts.freshnessOk)) return null

  const tier = volumeTier(az)
  return {
    id: `pulse-vol-${a.datasetId}-${a.neighborhood}`,
    kind: 'volume',
    signalType: fall ? 'fall' : 'rise',
    magnitude: tier,
    ratio: a.baselineMean > 0 ? a.count48h / a.baselineMean : undefined,
    bigValue: formatCount(a.count48h),
    context: 'in the last 48h',
    subject: meta.noun,
    place: a.neighborhood,
    factLine: `usual ≈ ${roundNice(a.baselineMean)}`,
    signalLabel: `${meta.noun} in ${a.neighborhood}, ${fall ? fallWord(tier) : riseWord(tier)}`,
    // The full drill param SET, matching Last48's heartbeat drill-in exactly:
    // a bare ?nh= is inert there (the anomaly fill + neighborhood peek only
    // mount when fill=anomaly AND points=off), so the link must carry all
    // three or the card promises evidence and delivers the lobby.
    evidenceHref: `/live?nh=${encodeURIComponent(a.neighborhood)}&fill=anomaly&points=off`,
    rankScore: 85 + (az - VOLUME_MIN_Z) * 15,
    freshnessOk: opts.freshnessOk,
    streamLabel: meta.label,
    pigment: meta.pigment,
    at: opts.computedAt,
  }
}

// ── TickerItem (citywide signals) → WireItem ────────────────────────────────

export function tickerToWireItem(t: TickerItem): WireItem | null {
  const href = t.source.view
  const at = t.computedAt.getTime()

  // Live significant-incident tally — a present-tense count, no up/down.
  if (t.id === 'civic-significant-tally') {
    const subject = t.headline.replace(/\s*·\s*/g, ', ').replace(/ across SF$/, '')
    return {
      id: t.id,
      kind: 'incident',
      signalType: 'live',
      magnitude: 2,
      bigValue: t.value ?? '—',
      context: 'in the last 48h',
      subject,
      place: null,
      factLine: 'serious 911 & Fire/EMS calls citywide',
      signalLabel: 'Significant incidents reported in the last 48 hours',
      evidenceHref: href,
      rankScore: t.priority,
      freshnessOk: true,
      pigment: '#b85a33',
      at,
    }
  }

  // Fastest-rising 311 complaint type.
  if (t.id === 'civic-311-category-surge') {
    const pct = t.delta ?? 0
    if (Math.abs(pct) < TREND_MIN_PCT) return null
    const type = t.source.label.split('·').pop()?.trim() ?? '311 reports'
    const tier = trendTier(Math.abs(pct))
    return {
      id: t.id,
      kind: 'trend',
      signalType: 'rise',
      magnitude: tier,
      ratio: 1 + pct / 100,
      bigValue: t.value ?? '—',
      context: 'this period',
      subject: `${type} reports to 311`,
      place: null,
      factLine: 'more than a year ago',
      signalLabel: `${type} reports to 311, ${trendWord(true, tier)}`,
      evidenceHref: href,
      rankScore: t.priority,
      freshnessOk: true,
      streamLabel: '311',
      pigment: '#5c9693',
      at,
    }
  }

  // Campaign-finance milestone — a standing total.
  if (t.category === 'milestone') {
    return {
      id: t.id,
      kind: 'milestone',
      signalType: 'milestone',
      magnitude: 1,
      bigValue: t.value ?? '—',
      context: 'this cycle',
      subject: 'raised by campaign committees',
      place: null,
      factLine: t.detail ?? '',
      signalLabel: `${t.value ?? ''} raised by campaign committees this cycle`,
      evidenceHref: href,
      rankScore: t.priority,
      freshnessOk: true,
      pigment: '#8b6282',
      at,
    }
  }

  // Generic citywide YoY trend.
  const pct = t.delta ?? 0
  if (Math.abs(pct) < TREND_MIN_PCT) return null
  const up = pct >= 0
  const tier = trendTier(Math.abs(pct))
  const subject = TICKER_SUBJECT[t.id] ?? t.source.label
  return {
    id: t.id,
    kind: 'trend',
    signalType: up ? 'rise' : 'fall',
    magnitude: tier,
    ratio: 1 + pct / 100,
    bigValue: t.value ?? '—',
    context: 'this year',
    subject,
    place: null,
    factLine: t.priorValue ? `${t.priorValue} a year ago` : 'vs a year ago',
    signalLabel: `${subject}, ${trendWord(up, tier)}`,
    evidenceHref: href,
    rankScore: t.priority,
    freshnessOk: true,
    pigment: TICKER_PIGMENT[t.id] ?? '#8a7050',
    at,
  }
}

/** Sort a wire descending by rankScore; deterministic id tiebreak. */
export function rankWire(items: WireItem[]): WireItem[] {
  return [...items].sort((a, b) => b.rankScore - a.rankScore || a.id.localeCompare(b.id))
}
