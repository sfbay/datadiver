/** Vendor anomaly flag computation — automated investigative signals */

import type { VendorLandscapeItem } from '@/hooks/useVendorLandscape'
import type { VendorContractRow, MonthlySpendRow } from '@/hooks/useVendorProfile'

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
  /** FY-end clustering: % of payments in May-June per fiscal year */
  fyEndPct: number
  /** Split purchase thresholds (individual payment amounts to check proximity to) */
  splitThresholds: number[]
}

export const DEFAULT_THRESHOLDS: FlagThresholds = {
  spikeSigma: 2,
  megaThreshold: 1_000_000,
  soleSourcePct: 50,
  fyEndPct: 40,
  splitThresholds: [10_000, 75_000],
}

// ── Pre-computed cohort stats (avoids O(n²)) ───────────────

export interface CohortStats {
  yoyMean: number
  yoySigma: number
  sampleSize: number
}

export function computeCohortStats(allVendors: VendorLandscapeItem[]): CohortStats {
  const deltas = allVendors
    .filter((v) => v.yoyDelta !== null && !v.isNew && !v.isDeparted && v.priorTotal > 0)
    .map((v) => v.yoyDelta!)

  if (deltas.length < 5) return { yoyMean: 0, yoySigma: 0, sampleSize: deltas.length }

  const mean = deltas.reduce((s, d) => s + d, 0) / deltas.length
  const variance = deltas.reduce((s, d) => s + (d - mean) ** 2, 0) / deltas.length
  return { yoyMean: mean, yoySigma: Math.sqrt(variance), sampleSize: deltas.length }
}

// ── Landscape-level flags (computed from VendorLandscapeItem) ──

export function computeLandscapeFlags(
  vendor: VendorLandscapeItem,
  cohort: CohortStats,
  thresholds = DEFAULT_THRESHOLDS,
): VendorFlag[] {
  const flags: VendorFlag[] = []

  // 1. Spending spike — YoY increase significantly above the cohort norm
  if (
    vendor.yoyDelta !== null && vendor.priorTotal > 0 &&
    !vendor.isNew && !vendor.isDeparted &&
    cohort.sampleSize >= 5 && cohort.yoySigma > 0
  ) {
    if (vendor.yoyDelta > cohort.yoyMean + thresholds.spikeSigma * cohort.yoySigma) {
      const sigmaVal = ((vendor.yoyDelta - cohort.yoyMean) / cohort.yoySigma).toFixed(1)
      flags.push({
        type: 'spending-spike',
        label: `${sigmaVal}σ spike`,
        detail: `YoY increase of ${vendor.yoyDelta.toFixed(0)}% is ${sigmaVal}σ above the cohort mean`,
        severity: 'red',
      })
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

// ── Payment pattern flags (per-FY monthly data) ────────────

export function computePaymentPatternFlags(
  monthlyData: MonthlySpendRow[],
  individualPayments: { vouchers_paid: string }[],
  thresholds = DEFAULT_THRESHOLDS,
): VendorFlag[] {
  const flags: VendorFlag[] = []

  // 5. FY-end clustering — check per fiscal year, flag if ANY FY exceeds threshold
  if (monthlyData.length > 0) {
    // Group by fiscal year
    const byFY = new Map<string, { total: number; fyEnd: number }>()
    for (const r of monthlyData) {
      const month = parseInt(r.month, 10)
      const total = parseFloat(r.total_paid) || 0
      if (!byFY.has(r.fiscal_year)) byFY.set(r.fiscal_year, { total: 0, fyEnd: 0 })
      const entry = byFY.get(r.fiscal_year)!
      entry.total += total
      if (month === 5 || month === 6) entry.fyEnd += total
    }

    // Check each FY independently
    let worstFY = ''
    let worstPct = 0
    for (const [fy, { total, fyEnd }] of byFY) {
      if (total === 0) continue
      const pct = (fyEnd / total) * 100
      if (pct > worstPct) {
        worstPct = pct
        worstFY = fy
      }
    }
    if (worstPct > thresholds.fyEndPct) {
      flags.push({
        type: 'fy-end-clustering',
        label: 'End-of-year clustering',
        detail: `FY${worstFY}: ${worstPct.toFixed(0)}% of payments in May-June`,
        severity: 'amber',
      })
    }
  }

  // 6. Split purchase pattern — check individual payment amounts near thresholds
  if (individualPayments.length > 0) {
    const amounts = individualPayments.map((p) => parseFloat(p.vouchers_paid) || 0).filter((a) => a > 0)

    for (const threshold of thresholds.splitThresholds) {
      const lowerBound = threshold * 0.85 // 85-100% of threshold
      const nearThreshold = amounts.filter((a) => a >= lowerBound && a < threshold)
      if (nearThreshold.length >= 3) {
        flags.push({
          type: 'split-purchase',
          label: 'Potential split purchases',
          detail: `${nearThreshold.length} individual payments between ${formatDollar(lowerBound)} and ${formatDollar(threshold)}`,
          severity: 'red',
        })
      }
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
