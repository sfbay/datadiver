// src/utils/eraStrip.ts
// Shared annual-strip math. Lifted from src/views/Housing/eraStripMath.ts when
// the header Era Track became its second consumer. Housing-specific content
// (its 1997 floor, its editorial annotations, its buyout-stream parsing) stays
// in that file — this module is the arithmetic both strips agree on.

export interface YearCount { year: number; count: number }

/** Date-only YYYY-MM-DD from local `Date` parts — this bounds a UI control
 *  (the strip's domain end / max-drag day), not data, so the viewer's clock
 *  is fine. Never toISOString() here (see sfTime.ts for why, for DATA
 *  timestamps; mirrors src/views/Housing/EraStrip.tsx's todayIso). */
export function todayIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseYearCounts(rows: Array<{ yr?: string; n: string }>): YearCount[] {
  return rows
    .filter((r): r is { yr: string; n: string } => r.yr != null)
    .map((r) => ({ year: Number(r.yr), count: Number(r.n) }))
    .sort((a, b) => a.year - b.year)
}

const yearOf = (dateStr: string): number => Number(dateStr.slice(0, 4))

/** Year band [y, y+1) counts as selected when the brush covers >= half of it.
 *  A near-zero-width brush (click) selects the single year under the cursor.
 *  `minYear` is a PARAMETER, not a constant: the Housing strip floors at 1997,
 *  the crime strip at 2003, and a baked-in floor would silently clamp one of
 *  them to the other's era. */
export function snapBrushToRange(
  x0: number, x1: number, todayIso: string, minYear: number,
): { start: string; end: string } {
  const maxYear = yearOf(todayIso)
  const startYear = Math.max(minYear, Math.min(Math.round(x0), maxYear))
  const endYear = x1 > x0 + 0.5
    ? Math.max(startYear, Math.min(Math.round(x1) - 1, maxYear))
    : startYear
  const endStr = `${endYear}-12-31`
  return {
    start: `${startYear}-01-01`,
    end: endStr > todayIso ? todayIso : endStr,
  }
}

export function rangeToYearSpan(range: { start: string; end: string }): { y0: number; y1: number } {
  return { y0: yearOf(range.start), y1: yearOf(range.end) }
}
