/** SF fiscal year utilities — SF FY runs July 1 to June 30.
 *  "FY2025" means July 1, 2024 → June 30, 2025. */

import type { FiscalYear } from '@/types/budget'

/** Returns the current fiscal year based on today's date.
 *  Before July 1 → current calendar year. On/after July 1 → next calendar year. */
export function getCurrentFiscalYear(): FiscalYear {
  const now = new Date()
  return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear()
}

/** Converts a fiscal year number to its date boundaries.
 *  FY2025 → { start: '2024-07-01', end: '2025-06-30' } */
export function fiscalYearToDateRange(fy: FiscalYear): { start: string; end: string } {
  return {
    start: `${fy - 1}-07-01`,
    end: `${fy}-06-30`,
  }
}

/** Formats a fiscal year for display: 2025 → "FY2024-25" */
export function formatFiscalYear(fy: FiscalYear): string {
  const startYear = fy - 1
  const endSuffix = String(fy).slice(-2)
  return `FY${startYear}-${endSuffix}`
}

/** Returns an array of fiscal years from start to end (inclusive). */
export function getFiscalYearRange(start: FiscalYear, end: FiscalYear): FiscalYear[] {
  const years: FiscalYear[] = []
  for (let y = start; y <= end; y++) {
    years.push(y)
  }
  return years
}

/** Formats a dollar amount for display: 1234567 → "$1.2M", 1234 → "$1.2K" */
export function formatBudgetAmount(amount: number): string {
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`
  return `${sign}$${abs.toFixed(0)}`
}

/** Formats a full dollar amount: 1234567.89 → "$1,234,568" */
export function formatBudgetFull(amount: number): string {
  return '$' + Math.round(amount).toLocaleString('en-US')
}
