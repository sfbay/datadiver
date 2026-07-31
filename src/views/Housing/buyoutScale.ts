// Dot radius ∝ sqrt(amount): area reads proportional to dollars.
// Domain from live probe: $0–$469,562 (lifetime max), median $40K.
export const BUYOUT_RADIUS_MIN = 4
export const BUYOUT_RADIUS_MAX = 22
export const BUYOUT_AMOUNT_CAP = 470_000

export function parseAmount(raw: string | undefined): number | null {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export function buyoutRadius(amount: number | null | undefined): number {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return BUYOUT_RADIUS_MIN
  const t = Math.sqrt(Math.min(amount, BUYOUT_AMOUNT_CAP)) / Math.sqrt(BUYOUT_AMOUNT_CAP)
  return BUYOUT_RADIUS_MIN + t * (BUYOUT_RADIUS_MAX - BUYOUT_RADIUS_MIN)
}

/** Ring size for agreements whose amount hasn't been entered yet (the Rent
 *  Board keys amounts in ~3 months behind — see data-insights.md → Housing).
 *  Sized at the lifetime AVERAGE amount (~$46K) under the same sqrt scale:
 *  the statistically honest "expected size", rendered gray so it reads as
 *  provisional, and large enough to stay findable over a choropleth underlay. */
export const BUYOUT_RADIUS_PENDING = 10

/** Amounts older than this many days with no value are treated as
 *  UNDISCLOSED (never coming); newer ones as PENDING ENTRY (backfill lag). */
export const AMOUNT_ENTRY_LAG_DAYS = 180
