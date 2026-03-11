const SPENDING_CATEGORIES: Record<string, string[]> = {
  'Campaign Staff': ['campaign worker', 'payroll', 'employer payroll', 'canvassing', 'field'],
  'Mailers & Print': ['slate mailer', 'mailer', 'printing', 'print'],
  'Digital & Media': ['digital', 'social media', 'online', 'advertising', 'media buy', 'tv', 'radio'],
  'Consulting': ['consulting', 'consultant', 'professional', 'pro/ofc', 'political strategy'],
  'Events & Fundraising': ['fundrais', 'event', 'catering', 'venue'],
  'Overhead': ['rent', 'office', 'supplies', 'phone', 'postage'],
}

export interface SpendingCategory {
  category: string
  total: number
}

/** Categorize raw expenditure description rows into spending categories.
 *  Returns sorted array with "Other" as the last entry for uncategorized spending. */
export function categorizeSpending(
  rows: { transaction_description: string; total: string }[]
): SpendingCategory[] {
  const totals = new Map<string, number>()

  for (const row of rows) {
    const desc = row.transaction_description.toLowerCase()
    const amount = parseFloat(row.total) || 0
    let matched = false
    for (const [category, keywords] of Object.entries(SPENDING_CATEGORIES)) {
      if (keywords.some(kw => desc.includes(kw))) {
        totals.set(category, (totals.get(category) || 0) + amount)
        matched = true
        break
      }
    }
    if (!matched) {
      totals.set('Other', (totals.get('Other') || 0) + amount)
    }
  }

  return Array.from(totals.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => {
      if (a.category === 'Other') return 1
      if (b.category === 'Other') return -1
      return b.total - a.total
    })
}
