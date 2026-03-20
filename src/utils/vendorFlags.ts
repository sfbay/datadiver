/** Vendor anomaly flag computation — automated investigative signals */

import type { VendorLandscapeItem } from '@/hooks/useVendorLandscape'
import type { VendorContractRow } from '@/hooks/useVendorProfile'

// ── Flag types ─────────────────────────────────────────────

export type FlagSeverity = 'red' | 'amber' | 'green' | 'ghost'

export interface VendorFlag {
  type: string
  label: string
  detail: string
  severity: FlagSeverity
}

// ── Sensitivity thresholds ─────────────────────────────────

export interface FlagThresholds {
  /** YoY increase threshold for spending spike (as multiplier of vendor's own σ) */
  spikeSigma: number
  /** Minimum dollar amount for mega-vendor threshold */
  megaThreshold: number
  /** Sole-source payment concentration percentage */
  soleSourcePct: number
  /** FY-end clustering: % of payments in May-June */
  fyEndPct: number
  /** Split purchase thresholds (amounts to check proximity to) */
  splitThresholds: number[]
}

export const DEFAULT_THRESHOLDS: FlagThresholds = {
  spikeSigma: 2,
  megaThreshold: 1_000_000,
  soleSourcePct: 50,
  fyEndPct: 40,
  splitThresholds: [10_000, 75_000],
}

// ── Landscape-level flags (computed from VendorLandscapeItem) ──

export function computeLandscapeFlags(
  vendor: VendorLandscapeItem,
  allVendors: VendorLandscapeItem[],
  thresholds = DEFAULT_THRESHOLDS,
): VendorFlag[] {
  const flags: VendorFlag[] = []

  // 1. Spending spike — YoY increase significantly above the cohort norm
  if (vendor.yoyDelta !== null && vendor.priorTotal > 0 && !vendor.isNew && !vendor.isDeparted) {
    // Compute mean and σ of YoY deltas across vendors with prior year data
    const deltas = allVendors
      .filter((v) => v.yoyDelta !== null && !v.isNew && !v.isDeparted && v.priorTotal > 0)
      .map((v) => v.yoyDelta!)

    if (deltas.length >= 5) {
      const mean = deltas.reduce((s, d) => s + d, 0) / deltas.length
      const variance = deltas.reduce((s, d) => s + (d - mean) ** 2, 0) / deltas.length
      const sigma = Math.sqrt(variance)

      if (sigma > 0 && vendor.yoyDelta! > mean + thresholds.spikeSigma * sigma) {
        const sigmaVal = ((vendor.yoyDelta! - mean) / sigma).toFixed(1)
        flags.push({
          type: 'spending-spike',
          label: `${sigmaVal}σ spike`,
          detail: `YoY increase of ${vendor.yoyDelta!.toFixed(0)}% is ${sigmaVal}σ above the cohort mean`,
          severity: 'red',
        })
      }
    }
  }

  // 2. New mega-vendor — first appearance with payments above threshold
  if (vendor.isNew && vendor.total >= thresholds.megaThreshold) {
    flags.push({
      type: 'new-mega',
      label: 'NEW',
      detail: `First-year vendor with ${formatDollar(vendor.total)} in payments`,
      severity: 'green',
    })
  }

  // 3. Departed vendor — had payments last year, zero this year
  if (vendor.isDeparted) {
    flags.push({
      type: 'departed',
      label: 'DEPARTED',
      detail: `Had ${formatDollar(vendor.priorTotal)} last year, zero this year`,
      severity: 'ghost',
    })
  }

  return flags
}

// ── Profile-level flags (computed from contract and payment data) ──

export function computeContractFlags(
  contracts: VendorContractRow[],
  thresholds = DEFAULT_THRESHOLDS,
): VendorFlag[] {
  const flags: VendorFlag[] = []

  if (contracts.length === 0) return flags

  // 4. Sole source concentration
  const totalPaid = contracts.reduce((s, c) => s + (parseFloat(c.pmt_amt) || 0), 0)
  const soleSourcePaid = contracts
    .filter((c) => c.sole_source_flg === 'Y')
    .reduce((s, c) => s + (parseFloat(c.pmt_amt) || 0), 0)

  if (totalPaid > 0 && (soleSourcePaid / totalPaid) * 100 > thresholds.soleSourcePct) {
    const pct = ((soleSourcePaid / totalPaid) * 100).toFixed(0)
    flags.push({
      type: 'sole-source',
      label: `${pct}% sole source`,
      detail: `${pct}% of contract payments via sole-source awards`,
      severity: 'amber',
    })
  }

  // 7. Contract overrun — payments exceed contract award
  for (const c of contracts) {
    const agreed = parseFloat(c.agreed_amt) || 0
    const paid = parseFloat(c.pmt_amt) || 0
    if (agreed > 0 && paid > agreed) {
      const overPct = (((paid - agreed) / agreed) * 100).toFixed(0)
      flags.push({
        type: 'contract-overrun',
        label: 'Over-contract',
        detail: `Contract ${c.contract_no}: paid ${formatDollar(paid)} against ${formatDollar(agreed)} award (+${overPct}%)`,
        severity: 'red',
      })
    }
  }

  return flags
}

// ── Payment pattern flags (need monthly payment data) ──

export function computePaymentPatternFlags(
  monthlyTotals: { month: number; total: number }[],
  thresholds = DEFAULT_THRESHOLDS,
): VendorFlag[] {
  const flags: VendorFlag[] = []

  if (monthlyTotals.length === 0) return flags

  const totalAnnual = monthlyTotals.reduce((s, m) => s + m.total, 0)
  if (totalAnnual === 0) return flags

  // 5. FY-end clustering — >40% of payments in May-June (months 5,6)
  const fyEndTotal = monthlyTotals
    .filter((m) => m.month === 5 || m.month === 6)
    .reduce((s, m) => s + m.total, 0)

  const fyEndPct = (fyEndTotal / totalAnnual) * 100
  if (fyEndPct > thresholds.fyEndPct) {
    flags.push({
      type: 'fy-end-clustering',
      label: 'End-of-year clustering',
      detail: `${fyEndPct.toFixed(0)}% of annual payments concentrated in May-June`,
      severity: 'amber',
    })
  }

  // 6. Split purchase pattern — multiple payments just below thresholds
  for (const threshold of thresholds.splitThresholds) {
    const lowerBound = threshold * 0.85 // 85-100% of threshold
    const nearThreshold = monthlyTotals.filter(
      (m) => m.total >= lowerBound && m.total < threshold,
    )
    if (nearThreshold.length >= 3) {
      flags.push({
        type: 'split-purchase',
        label: 'Potential split purchases',
        detail: `${nearThreshold.length} payments just below ${formatDollar(threshold)} threshold`,
        severity: 'red',
      })
    }
  }

  return flags
}

// ── Helpers ────────────────────────────────────────────────

function formatDollar(amount: number): string {
  const abs = Math.abs(amount)
  if (abs >= 1_000_000_000) return `$${(abs / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(1)}K`
  return `$${abs.toFixed(0)}`
}

/** Filter flags based on sensitivity level (0-100). Higher = more flags shown. */
export function filterBySensitivity(flags: VendorFlag[], sensitivity: number): VendorFlag[] {
  if (sensitivity >= 100) return flags
  if (sensitivity <= 0) return []

  // Red flags always show above 25, amber above 50, green/ghost above 75
  return flags.filter((f) => {
    switch (f.severity) {
      case 'red': return sensitivity >= 25
      case 'amber': return sensitivity >= 50
      case 'green': return sensitivity >= 75
      case 'ghost': return sensitivity >= 75
      default: return true
    }
  })
}
