// src/components/charts/spanLayout.ts
//
// Pure layout math for SpanBar / EpisodeStrip — date-only strings
// ('YYYY-MM-DD', the DataSF calendar_date shape) placed on a horizontal
// axis. ZERO-IMPORT leaf, node-tested. Never Date.parse a DataSF string:
// these are floating calendar days, so we index them by UTC day number,
// which makes every host agree on the same integer.

/** 'YYYY-MM-DD' → whole days since the epoch (UTC). Junk → NaN. */
export function dayIndex(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return NaN
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000)
}

export interface SpanInput {
  start: string
  /** null = still open (no later record) — drawn hatched to the axis end. */
  end: string | null
  /** Inspection visits inside the span, as dates; drawn as ticks. */
  visits?: string[]
}

export interface SpanBox {
  x: number
  width: number
  open: boolean
  tickXs: number[]
}

/** Place spans on an axis [a0, a1] scaled to `width` px. A span is clamped
 *  to the axis; an open span runs to the axis end. A zero-length span still
 *  gets `minWidth` so a same-day closure is visible. */
export function layoutSpans(
  spans: readonly SpanInput[],
  axis: readonly [string, string],
  width: number,
  minWidth = 2,
): SpanBox[] {
  const a0 = dayIndex(axis[0])
  const a1 = dayIndex(axis[1])
  const len = Math.max(1, a1 - a0)
  const px = (d: number) => ((Math.min(a1, Math.max(a0, d)) - a0) / len) * width
  return spans.map((s) => {
    const d0 = dayIndex(s.start)
    const open = s.end === null
    const d1 = open ? a1 : dayIndex(s.end as string)
    const x = px(d0)
    const w = Math.max(minWidth, px(d1) - x)
    // Ticks only where the span is actually drawn: inside it AND inside the
    // axis — a visit before the axis start would otherwise pile at x=0.
    const lo = Math.max(d0, a0)
    const hi = Math.min(d1, a1)
    const tickXs = (s.visits ?? []).map(dayIndex).filter((d) => d >= lo && d <= hi).map(px)
    return { x, width: w, open, tickXs }
  })
}

/** A duration bar with no axis: `days` on a 0…`cap` scale (longer runs pin
 *  at the cap and the caller labels it "≤"). null = open. */
export function durationWidth(days: number | null, cap: number, width: number): { width: number; capped: boolean } {
  if (days === null) return { width, capped: false }
  const d = Math.max(0, days)
  return { width: Math.max(2, (Math.min(d, cap) / cap) * width), capped: d > cap }
}

/** Evenly spaced year tick positions inside the axis, for a strip's rule. */
export function yearTicks(axis: readonly [string, string], width: number): { x: number; year: number }[] {
  const a0 = dayIndex(axis[0])
  const a1 = dayIndex(axis[1])
  const y0 = Number(axis[0].slice(0, 4))
  const y1 = Number(axis[1].slice(0, 4))
  const out: { x: number; year: number }[] = []
  for (let y = y0 + 1; y <= y1; y++) {
    const d = dayIndex(`${y}-01-01`)
    if (d > a0 && d < a1) out.push({ x: ((d - a0) / (a1 - a0)) * width, year: y })
  }
  return out
}
