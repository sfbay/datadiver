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
