// Eviction rate = notices per 1,000 renter households, ANNUALIZED over the
// selected date range so a 30-day window and a 5-year window read on the
// same scale. Denominator: ACS B25003_003 renter-occupied households per
// Analysis Neighborhood (exact sums via DataSF's official tract assignment,
// sevw-6tgi — see data-insights.md → Housing).

/** Below this many renter households a rate is statistical noise (a park or
 *  pier neighborhood with 3 renter households and one notice would read as
 *  a citywide-worst crisis). Suppressed, not absent — callers render '—'. */
export const MIN_RENTER_HOUSEHOLDS = 100

const DAYS_PER_YEAR = 365.25

/**
 * Annualized notices per 1,000 renter households, or null when the
 * denominator is missing/below the floor or the window is degenerate.
 */
export function annualizedRatePer1k(
  notices: number | null | undefined,
  renterHouseholds: number | null | undefined,
  rangeDays: number,
): number | null {
  if (notices == null || !Number.isFinite(notices) || notices < 0) return null
  if (renterHouseholds == null || renterHouseholds < MIN_RENTER_HOUSEHOLDS) return null
  if (!Number.isFinite(rangeDays) || rangeDays <= 0) return null
  return (notices / renterHouseholds) * 1000 * (DAYS_PER_YEAR / rangeDays)
}

/** Display formatting: one decimal ("6.7"), two under 1 ("0.42"). */
export function formatRate(rate: number): string {
  return rate < 1 ? rate.toFixed(2) : rate.toFixed(1)
}
