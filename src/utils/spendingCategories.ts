/**
 * FPPC transaction_code → human-readable spending categories.
 *
 * SF campaign finance data (pitq-e56w) uses standardized 3-letter FPPC
 * expenditure codes on Form 460 Schedule E. We group these into broader
 * categories for the spending breakdown chart.
 */

/** Map every known FPPC transaction_code to a display category */
const CODE_TO_CATEGORY: Record<string, string> = {
  // Media & Advertising
  LIT: 'Media & Advertising',
  TEL: 'Media & Advertising',
  RAD: 'Media & Advertising',
  WEB: 'Media & Advertising',
  PHO: 'Media & Advertising',

  // Consulting & Professional
  CNS: 'Consulting & Professional',
  PRO: 'Consulting & Professional',
  POL: 'Consulting & Professional',
  LEG: 'Consulting & Professional',

  // Campaign Operations
  SAL: 'Campaign Operations',
  OFC: 'Campaign Operations',
  TRS: 'Campaign Operations',
  TRC: 'Campaign Operations',
  FIL: 'Campaign Operations',
  MBR: 'Campaign Operations',

  // Contributions & Transfers
  CTB: 'Contributions & Transfers',
  TSF: 'Contributions & Transfers',
  IND: 'Contributions & Transfers',

  // Voter Contact
  PET: 'Voter Contact',
  POS: 'Voter Contact',
  PRT: 'Voter Contact',
  VOT: 'Voter Contact',
  CVC: 'Voter Contact',

  // Events & Fundraising
  FND: 'Events & Fundraising',
  MTG: 'Events & Fundraising',

  // Compliance
  CMP: 'Compliance',

  // Refunds
  RFD: 'Refunds',
}

export interface SpendingCategory {
  category: string
  total: number
}

/** Categorize expenditure rows by FPPC transaction_code.
 *  Rows with null/missing codes are grouped as "Uncoded / Pass-through". */
export function categorizeSpending(
  rows: { transaction_code: string; total: string }[]
): SpendingCategory[] {
  const totals = new Map<string, number>()

  for (const row of rows) {
    const amount = parseFloat(row.total) || 0
    const code = row.transaction_code?.trim()
    const category = code ? (CODE_TO_CATEGORY[code] || 'Other') : 'Uncoded / Pass-through'
    totals.set(category, (totals.get(category) || 0) + amount)
  }

  return Array.from(totals.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => {
      // Push special categories to the end
      if (a.category === 'Uncoded / Pass-through') return 1
      if (b.category === 'Uncoded / Pass-through') return -1
      if (a.category === 'Other') return 1
      if (b.category === 'Other') return -1
      return b.total - a.total
    })
}
