# Campaign Finance View Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a chart-centric Campaign Finance view (`/campaign-finance`) with election-scoped contribution analysis, two-level drill-down (overview → candidate/measure for/against split), and donor geography map.

**Architecture:** Chart-centric layout (same pattern as Dispatch911). Level 1 shows election overview with stat cards, top recipients bar chart, contribution timeline, and funding sources. Level 2 shows entity detail with for/against support/oppose split view. Sidebar holds filer list + donor geography map. All data from Socrata dataset `pitq-e56w` via server-side aggregation.

**Tech Stack:** React 18, TypeScript, D3.js (charts), Mapbox GL JS (donor map), Zustand (global state), Socrata SODA API

---

## File Structure

### New Files
| File | Responsibility |
|------|----------------|
| `src/views/CampaignFinance/CampaignFinance.tsx` | Main view: header, stat cards, Level 1/Level 2 content switching, sidebar, skeleton/error/empty states |
| `src/hooks/useCampaignFinance.ts` | Level 1 Socrata queries: stat cards (total, avg, unique donors, small donor %), top recipients, timeline, funding sources, donor geo, prior-cycle YoY |
| `src/hooks/useCampaignDetail.ts` | Level 2 Socrata queries: entity source breakdown, top donors, IE support/oppose, spending, entity timeline, entity donor geo. Fires only when an entity is selected. |
| `src/components/charts/TopRecipientsChart.tsx` | D3 horizontal bar chart for Level 1 hero — clickable bars, colored by filer_type |
| `src/components/charts/ContributionTimeline.tsx` | D3 area chart for money flow over election cycle |
| `src/components/charts/FundingSourcesChart.tsx` | D3 horizontal bar for entity_code breakdown (IND/COM/OTH/SELF) |
| `src/components/charts/ForAgainstSplit.tsx` | Two-column support/oppose visualization with top funders bars + source breakdown |
| `src/utils/spendingCategories.ts` | Normalization map + `categorizeSpending()` function |
| `src/utils/electionCycles.ts` | Static SF_ELECTIONS list + helper functions (findPriorCycle, getCurrentCycle) |

### Modified Files
| File | Change |
|------|--------|
| `src/api/datasets.ts` | Add `campaignFinance` entry |
| `src/types/datasets.ts` | Add campaign finance interfaces + `'campaign-finance'` to ViewId |
| `src/components/layout/AppShell.tsx` | Add Campaign Finance nav item |
| `src/App.tsx` | Add `/campaign-finance` route |
| `src/utils/glossary.ts` | Add 5 campaign finance glossary entries |

---

## Chunk 1: Foundation + Data Hooks

### Task 1: Types, Dataset Registration, Route, Nav, Glossary

**Files:**
- Modify: `src/types/datasets.ts:509` (ViewId union)
- Modify: `src/api/datasets.ts:176` (before closing `}`)
- Modify: `src/components/layout/AppShell.tsx:64-71` (nav items array)
- Modify: `src/App.tsx` (routes)
- Modify: `src/utils/glossary.ts` (glossary entries)
- Create: `src/utils/electionCycles.ts`
- Create: `src/utils/spendingCategories.ts`
- Create: `src/views/CampaignFinance/CampaignFinance.tsx` (placeholder)

- [ ] **Step 1: Add campaign finance types to `src/types/datasets.ts`**

Add before the `ViewId` type at line 509. Then add `'campaign-finance'` to the ViewId union.

```typescript
// --- Campaign Finance types ---

export interface CampaignTransaction {
  filing_id_number: string
  filer_name: string
  filer_type: string
  filer_nid: string
  form_type: string
  calculated_amount: string
  calculated_date: string
  transaction_last_name?: string
  transaction_city?: string
  transaction_state?: string
  transaction_zip?: string
  transaction_self?: boolean
  transaction_description?: string
  entity_code?: string
  support_oppose_code?: string
  candidate_last_name?: string
  office_description?: string
  district_number?: string
  ballot_name?: string
  ballot_number?: string
  ballot_jurisdiction?: string
}

export interface CampaignFilerAggRow {
  filer_name: string
  filer_type: string
  filer_nid: string
  total: string
}

export interface CampaignDonorGeoRow {
  transaction_zip: string
  total: string
  cnt: string
}

export interface CampaignSourceAggRow {
  entity_code: string
  total: string
  cnt: string
}

export interface CampaignTimelineRow {
  period: string
  total: string
}

export interface CampaignDonorRow {
  transaction_last_name: string
  total: string
}

export interface CampaignIERow {
  filer_name: string
  total: string
}

export interface CampaignSpendRow {
  transaction_description: string
  total: string
}

export interface CampaignStatTotals {
  total: string
  avg_amt: string
}

export interface CampaignCountRow {
  cnt: string
}

export interface CampaignSelfFundRow {
  total: string
}

export interface CampaignUniqueDonorRow {
  transaction_last_name: string
  cnt: string
}
```

Update ViewId:
```typescript
export type ViewId = 'home' | 'emergency-response' | 'parking-revenue' | 'dispatch-911' | '311-cases' | 'crime-incidents' | 'parking-citations' | 'traffic-safety' | 'business-activity' | 'campaign-finance'
```

- [ ] **Step 2: Add dataset entry to `src/api/datasets.ts`**

Add before the closing `} as const` at the end of the DATASETS object:

```typescript
  campaignFinance: {
    id: 'pitq-e56w',
    name: 'Campaign Finance',
    description: 'Campaign contributions, expenditures, and independent expenditure disclosures',
    endpoint: `${BASE_URL}/pitq-e56w.json`,
    category: 'other',
    hasGeo: false,
    defaultSort: 'calculated_date DESC',
    dateField: 'calculated_date',
  },
```

- [ ] **Step 3: Create `src/utils/electionCycles.ts`**

```typescript
export interface ElectionCycle {
  label: string
  date: string
  start: string
  end: string
}

export const SF_ELECTIONS: ElectionCycle[] = [
  { label: 'June 2026', date: '2026-06-02', start: '2025-07-01', end: '2026-06-02' },
  { label: 'Nov 2024',  date: '2024-11-05', start: '2024-01-01', end: '2024-11-05' },
  { label: 'Mar 2024',  date: '2024-03-05', start: '2023-07-01', end: '2024-03-05' },
  { label: 'Nov 2022',  date: '2022-11-08', start: '2022-01-01', end: '2022-11-08' },
  { label: 'Jun 2022',  date: '2022-06-07', start: '2021-07-01', end: '2022-06-07' },
  { label: 'Nov 2020',  date: '2020-11-03', start: '2020-01-01', end: '2020-11-03' },
  { label: 'Mar 2020',  date: '2020-03-03', start: '2019-07-01', end: '2020-03-03' },
  { label: 'Nov 2019',  date: '2019-11-05', start: '2019-01-01', end: '2019-11-05' },
  { label: 'Nov 2018',  date: '2018-11-06', start: '2018-01-01', end: '2018-11-06' },
  { label: 'Jun 2018',  date: '2018-06-05', start: '2017-07-01', end: '2018-06-05' },
]

/** Find the prior equivalent election cycle for YoY comparison.
 *  Nov → prior Nov, Mar → prior Mar, Jun → prior Jun.
 *  Returns null if no match found. */
export function findPriorCycle(current: ElectionCycle): ElectionCycle | null {
  const currentMonth = current.label.split(' ')[0] // "Nov", "Mar", "Jun"
  const currentIdx = SF_ELECTIONS.indexOf(current)
  for (let i = currentIdx + 1; i < SF_ELECTIONS.length; i++) {
    if (SF_ELECTIONS[i].label.startsWith(currentMonth)) return SF_ELECTIONS[i]
  }
  return null
}

/** Get the most recent election cycle that has likely concluded (date <= today). */
export function getDefaultCycle(): ElectionCycle {
  const today = new Date().toISOString().slice(0, 10)
  const past = SF_ELECTIONS.find(e => e.date <= today)
  return past || SF_ELECTIONS[0]
}

/** Find which election cycle contains a given date range, or null. */
export function findCycleForRange(start: string, end: string): ElectionCycle | null {
  return SF_ELECTIONS.find(e => e.start === start && e.end === end) || null
}

/** Escape single quotes for SoQL WHERE clauses. */
export function escapeSoQL(value: string): string {
  return value.replace(/'/g, "''")
}
```

- [ ] **Step 4: Create `src/utils/spendingCategories.ts`**

```typescript
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
```

- [ ] **Step 5: Add glossary entries to `src/utils/glossary.ts`**

Add these entries to the GLOSSARY object:

```typescript
  'cf-total-raised': 'Total monetary contributions received (Form A filings). Includes individual donors, committees, and self-funding.',
  'cf-avg-contribution': 'Average contribution size. Lower averages suggest broader grassroots support; higher averages indicate reliance on large donors.',
  'cf-unique-donors': 'Distinct contributor names in the filing period. Approximation — same person may appear with slightly different name spellings.',
  'cf-small-donor-pct': 'Percentage of contributions under $100. A measure of grassroots funding strength.',
  'cf-support-oppose': 'Support/oppose classification from independent expenditure (IE) filings. Committees must disclose whether spending supports or opposes a candidate or measure.',
```

- [ ] **Step 6: Create placeholder view at `src/views/CampaignFinance/CampaignFinance.tsx`**

```typescript
export default function CampaignFinance() {
  return (
    <div className="h-full flex items-center justify-center">
      <p className="text-slate-400 font-mono text-sm">Campaign Finance — coming soon</p>
    </div>
  )
}
```

- [ ] **Step 7: Add route to `src/App.tsx`**

Add import at the top:
```typescript
import CampaignFinance from '@/views/CampaignFinance/CampaignFinance'
```

Add route alongside other routes (before the catch-all `*` route):
```typescript
<Route path="/campaign-finance" element={<CampaignFinance />} />
```

- [ ] **Step 8: Add nav item to `src/components/layout/AppShell.tsx`**

Add to the `NAV_ITEMS` array, after the Business Activity entry:
```typescript
  {
    path: '/campaign-finance',
    label: 'Campaign Finance',
    shortLabel: 'CF',
    description: 'Campaign contributions & spending',
    accentColor: '#14b8a6',
  },
```

- [ ] **Step 9: Verify build**

Run: `pnpm build`
Expected: Clean build, no type errors. Navigate to `/campaign-finance` shows placeholder.

- [ ] **Step 10: Commit**

```bash
git add src/types/datasets.ts src/api/datasets.ts src/utils/electionCycles.ts src/utils/spendingCategories.ts src/utils/glossary.ts src/views/CampaignFinance/CampaignFinance.tsx src/App.tsx src/components/layout/AppShell.tsx
git commit -m "feat(campaign-finance): foundation — types, dataset, route, nav, utils"
```

---

### Task 2: `useCampaignFinance` hook (Level 1 data)

**Files:**
- Create: `src/hooks/useCampaignFinance.ts`

**Reference:** `src/hooks/useDispatchComparisonData.ts` for multi-query pattern, `src/hooks/useDataFreshness.ts` for conditional fetch pattern.

- [ ] **Step 1: Create `src/hooks/useCampaignFinance.ts`**

This hook fires 8 parallel Socrata queries for the Level 1 election overview. It only fires when given a valid date range. Returns stat card values, top recipients, timeline, funding sources, donor geo, and prior-cycle YoY deltas.

```typescript
import { useState, useEffect, useRef } from 'react'
import { fetchDataset } from '@/api/client'
import type {
  CampaignFilerAggRow,
  CampaignDonorGeoRow,
  CampaignSourceAggRow,
  CampaignTimelineRow,
  CampaignStatTotals,
  CampaignCountRow,
  CampaignSelfFundRow,
  CampaignUniqueDonorRow,
} from '@/types/datasets'
import { findCycleForRange, findPriorCycle } from '@/utils/electionCycles'

export interface CampaignFinanceStats {
  totalRaised: number
  avgContribution: number
  uniqueDonors: number
  smallDonorPct: number
  selfFundingTotal: number
}

export interface CampaignFinanceYoY {
  totalRaisedDelta: number | null
  smallDonorDelta: number | null
}

export interface UseCampaignFinanceResult {
  stats: CampaignFinanceStats | null
  yoy: CampaignFinanceYoY
  topRecipients: CampaignFilerAggRow[]
  timeline: CampaignTimelineRow[]
  fundingSources: CampaignSourceAggRow[]
  donorGeo: CampaignDonorGeoRow[]
  isLoading: boolean
  error: string | null
}

export function useCampaignFinance(
  dateRange: { start: string; end: string }
): UseCampaignFinanceResult {
  const [stats, setStats] = useState<CampaignFinanceStats | null>(null)
  const [yoy, setYoY] = useState<CampaignFinanceYoY>({ totalRaisedDelta: null, smallDonorDelta: null })
  const [topRecipients, setTopRecipients] = useState<CampaignFilerAggRow[]>([])
  const [timeline, setTimeline] = useState<CampaignTimelineRow[]>([])
  const [fundingSources, setFundingSources] = useState<CampaignSourceAggRow[]>([])
  const [donorGeo, setDonorGeo] = useState<CampaignDonorGeoRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef(0)

  useEffect(() => {
    const id = ++abortRef.current
    setIsLoading(true)
    setError(null)

    const { start, end } = dateRange
    const dateWhere = `calculated_date >= '${start}T00:00:00' AND calculated_date <= '${end}T23:59:59'`
    const contribWhere = `form_type='A' AND calculated_amount > 0 AND ${dateWhere}`

    const queries = [
      // 0: Total raised + avg
      fetchDataset<CampaignStatTotals>('campaignFinance', {
        $select: 'SUM(calculated_amount) as total, AVG(calculated_amount) as avg_amt',
        $where: contribWhere,
      }),
      // 1: Unique donors (GROUP BY, count rows client-side)
      fetchDataset<CampaignUniqueDonorRow>('campaignFinance', {
        $select: 'transaction_last_name, COUNT(*) as cnt',
        $where: `form_type='A' AND ${dateWhere} AND transaction_last_name IS NOT NULL`,
        $group: 'transaction_last_name',
        $limit: 50000,
      }),
      // 2: Small donor count
      fetchDataset<CampaignCountRow>('campaignFinance', {
        $select: 'COUNT(*) as cnt',
        $where: `${contribWhere} AND calculated_amount < 100`,
      }),
      // 3: Total contribution count
      fetchDataset<CampaignCountRow>('campaignFinance', {
        $select: 'COUNT(*) as cnt',
        $where: contribWhere,
      }),
      // 4: Self-funding total
      fetchDataset<CampaignSelfFundRow>('campaignFinance', {
        $select: 'SUM(calculated_amount) as total',
        $where: `form_type='A' AND transaction_self=true AND ${dateWhere}`,
      }),
      // 5: Top recipients
      fetchDataset<CampaignFilerAggRow>('campaignFinance', {
        $select: 'filer_nid, filer_name, filer_type, SUM(calculated_amount) as total',
        $where: `form_type='A' AND ${dateWhere}`,
        $group: 'filer_nid, filer_name, filer_type',
        $order: 'total DESC',
        $limit: 50,
      }),
      // 6: Contribution timeline
      fetchDataset<CampaignTimelineRow>('campaignFinance', {
        $select: 'date_trunc_ym(calculated_date) as period, SUM(calculated_amount) as total',
        $where: `form_type='A' AND ${dateWhere}`,
        $group: 'period',
        $order: 'period',
      }),
      // 7: Funding sources by entity_code
      fetchDataset<CampaignSourceAggRow>('campaignFinance', {
        $select: 'entity_code, SUM(calculated_amount) as total',
        $where: `form_type='A' AND ${dateWhere}`,
        $group: 'entity_code',
        $order: 'total DESC',
      }),
      // 8: Donor geography
      fetchDataset<CampaignDonorGeoRow>('campaignFinance', {
        $select: 'transaction_zip, SUM(calculated_amount) as total, COUNT(*) as cnt',
        $where: `form_type='A' AND ${dateWhere} AND transaction_zip IS NOT NULL`,
        $group: 'transaction_zip',
        $order: 'total DESC',
        $limit: 50,
      }),
    ] as const

    // Determine prior cycle for YoY before firing queries
    const currentCycle = findCycleForRange(start, end)
    const priorCycle = currentCycle ? findPriorCycle(currentCycle) : null

    Promise.all(queries)
      .then(async ([totalsRows, uniqueRows, smallRows, countRows, selfRows, recipients, timelineRows, sourceRows, geoRows]) => {
        if (id !== abortRef.current) return

        const totalRaised = parseFloat(totalsRows[0]?.total || '0')
        const avgContribution = parseFloat(totalsRows[0]?.avg_amt || '0')
        const uniqueDonors = uniqueRows.length
        const smallCount = parseInt(smallRows[0]?.cnt || '0', 10)
        const totalCount = parseInt(countRows[0]?.cnt || '0', 10)
        const smallDonorPct = totalCount > 0 ? (smallCount / totalCount) * 100 : 0
        const selfFundingTotal = parseFloat(selfRows[0]?.total || '0')

        setStats({ totalRaised, avgContribution, uniqueDonors, smallDonorPct, selfFundingTotal })
        setTopRecipients(recipients)
        setTimeline(timelineRows)
        setFundingSources(sourceRows)
        setDonorGeo(geoRows)
        setIsLoading(false)

        // YoY: fire inside .then() so totalRaised and smallDonorPct are in scope
        if (priorCycle) {
          const priorWhere = `calculated_date >= '${priorCycle.start}T00:00:00' AND calculated_date <= '${priorCycle.end}T23:59:59'`
          const priorContribWhere = `form_type='A' AND calculated_amount > 0 AND ${priorWhere}`
          try {
            const [priorTotals, priorSmall, priorCount] = await Promise.all([
              fetchDataset<CampaignStatTotals>('campaignFinance', {
                $select: 'SUM(calculated_amount) as total, AVG(calculated_amount) as avg_amt',
                $where: priorContribWhere,
              }),
              fetchDataset<CampaignCountRow>('campaignFinance', {
                $select: 'COUNT(*) as cnt',
                $where: `${priorContribWhere} AND calculated_amount < 100`,
              }),
              fetchDataset<CampaignCountRow>('campaignFinance', {
                $select: 'COUNT(*) as cnt',
                $where: priorContribWhere,
              }),
            ])
            if (id !== abortRef.current) return
            const priorTotal = parseFloat(priorTotals[0]?.total || '0')
            const priorSmallCount = parseInt(priorSmall[0]?.cnt || '0', 10)
            const priorTotalCount = parseInt(priorCount[0]?.cnt || '0', 10)
            const priorSmallPct = priorTotalCount > 0 ? (priorSmallCount / priorTotalCount) * 100 : 0
            setYoY({
              totalRaisedDelta: priorTotal > 0 ? ((totalRaised - priorTotal) / priorTotal) * 100 : null,
              smallDonorDelta: priorSmallPct > 0 ? ((smallDonorPct - priorSmallPct) / priorSmallPct) * 100 : null,
            })
          } catch {
            // YoY failure is non-critical
          }
        } else {
          setYoY({ totalRaisedDelta: null, smallDonorDelta: null })
        }
      })
      .catch((err) => {
        if (id !== abortRef.current) return
        setError(err.message || 'Failed to load campaign finance data')
        setIsLoading(false)
      })
  }, [dateRange.start, dateRange.end])

  return { stats, yoy, topRecipients, timeline, fundingSources, donorGeo, isLoading, error }
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCampaignFinance.ts
git commit -m "feat(campaign-finance): add useCampaignFinance hook — Level 1 data queries"
```

---

### Task 3: `useCampaignDetail` hook (Level 2 data)

**Files:**
- Create: `src/hooks/useCampaignDetail.ts`

- [ ] **Step 1: Create `src/hooks/useCampaignDetail.ts`**

This hook fires when an entity (candidate or measure) is selected. It fetches entity-specific contribution breakdowns, top donors, IE support/oppose records, spending categories, timeline, and donor geography.

```typescript
import { useState, useEffect, useRef } from 'react'
import { fetchDataset } from '@/api/client'
import type {
  CampaignSourceAggRow,
  CampaignDonorRow,
  CampaignIERow,
  CampaignSpendRow,
  CampaignTimelineRow,
  CampaignDonorGeoRow,
} from '@/types/datasets'
import { escapeSoQL } from '@/utils/electionCycles'
import { categorizeSpending, type SpendingCategory } from '@/utils/spendingCategories'

export interface SelectedEntity {
  filerName: string
  filerNid: string
  filerType: string  // 'Candidate or Officeholder' | 'Primarily Formed Measure' | etc.
  total: number
  /** For candidates: extracted last name for IE matching */
  candidateLastName?: string
  /** For measures: ballot letter/number for IE matching */
  ballotNumber?: string
}

export interface UseCampaignDetailResult {
  sourceBreakdown: CampaignSourceAggRow[]
  topDonors: CampaignDonorRow[]
  ieSupport: CampaignIERow[]
  ieOppose: CampaignIERow[]
  ieSupportTotal: number
  ieOpposeTotal: number
  spendingCategories: SpendingCategory[]
  entityTimeline: CampaignTimelineRow[]
  entityDonorGeo: CampaignDonorGeoRow[]
  isLoading: boolean
  error: string | null
}

export function useCampaignDetail(
  entity: SelectedEntity | null,
  dateRange: { start: string; end: string }
): UseCampaignDetailResult {
  const [sourceBreakdown, setSourceBreakdown] = useState<CampaignSourceAggRow[]>([])
  const [topDonors, setTopDonors] = useState<CampaignDonorRow[]>([])
  const [ieSupport, setIeSupport] = useState<CampaignIERow[]>([])
  const [ieOppose, setIeOppose] = useState<CampaignIERow[]>([])
  const [ieSupportTotal, setIeSupportTotal] = useState(0)
  const [ieOpposeTotal, setIeOpposeTotal] = useState(0)
  const [spendingCategories, setSpendingCategories] = useState<SpendingCategory[]>([])
  const [entityTimeline, setEntityTimeline] = useState<CampaignTimelineRow[]>([])
  const [entityDonorGeo, setEntityDonorGeo] = useState<CampaignDonorGeoRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef(0)

  useEffect(() => {
    if (!entity) {
      setSourceBreakdown([])
      setTopDonors([])
      setIeSupport([])
      setIeOppose([])
      setIeSupportTotal(0)
      setIeOpposeTotal(0)
      setSpendingCategories([])
      setEntityTimeline([])
      setEntityDonorGeo([])
      setError(null)
      return
    }

    const id = ++abortRef.current
    setIsLoading(true)
    setError(null)

    const { start, end } = dateRange
    const dateWhere = `calculated_date >= '${start}T00:00:00' AND calculated_date <= '${end}T23:59:59'`
    // Use filer_nid for stable grouping (filer_name can vary across filings)
    const filerWhere = `filer_nid='${entity.filerNid}'`

    // Determine IE match field based on entity type
    const isMeasure = entity.filerType === 'Primarily Formed Measure'
    const ieMatchWhere = isMeasure && entity.ballotNumber
      ? `ballot_number='${escapeSoQL(entity.ballotNumber)}'`
      : entity.candidateLastName
        ? `candidate_last_name='${escapeSoQL(entity.candidateLastName)}'`
        : null

    const queries: Promise<unknown>[] = [
      // 0: Source breakdown
      fetchDataset<CampaignSourceAggRow>('campaignFinance', {
        $select: 'entity_code, SUM(calculated_amount) as total, COUNT(*) as cnt',
        $where: `form_type='A' AND ${filerWhere} AND ${dateWhere}`,
        $group: 'entity_code',
      }),
      // 1: Top donors
      fetchDataset<CampaignDonorRow>('campaignFinance', {
        $select: 'transaction_last_name, SUM(calculated_amount) as total',
        $where: `form_type='A' AND ${filerWhere} AND ${dateWhere}`,
        $group: 'transaction_last_name',
        $order: 'total DESC',
        $limit: 10,
      }),
      // 2: Entity timeline
      fetchDataset<CampaignTimelineRow>('campaignFinance', {
        $select: 'date_trunc_ym(calculated_date) as period, SUM(calculated_amount) as total',
        $where: `form_type='A' AND ${filerWhere} AND ${dateWhere}`,
        $group: 'period',
        $order: 'period',
      }),
      // 3: Spending categories
      fetchDataset<CampaignSpendRow>('campaignFinance', {
        $select: 'transaction_description, SUM(calculated_amount) as total',
        $where: `form_type='E' AND ${filerWhere} AND ${dateWhere} AND transaction_description IS NOT NULL`,
        $group: 'transaction_description',
        $order: 'total DESC',
        $limit: 100,
      }),
      // 4: Entity donor geography
      fetchDataset<CampaignDonorGeoRow>('campaignFinance', {
        $select: 'transaction_zip, SUM(calculated_amount) as total, COUNT(*) as cnt',
        $where: `form_type='A' AND ${filerWhere} AND ${dateWhere} AND transaction_zip IS NOT NULL`,
        $group: 'transaction_zip',
        $order: 'total DESC',
        $limit: 50,
      }),
    ]

    // 5-6: IE support/oppose (only if we have a match field)
    if (ieMatchWhere) {
      queries.push(
        fetchDataset<CampaignIERow>('campaignFinance', {
          $select: 'filer_name, SUM(calculated_amount) as total',
          $where: `(form_type='F496' OR form_type='F496P3' OR form_type='F465P3') AND support_oppose_code='S' AND ${ieMatchWhere} AND ${dateWhere}`,
          $group: 'filer_name',
          $order: 'total DESC',
          $limit: 10,
        }),
        fetchDataset<CampaignIERow>('campaignFinance', {
          $select: 'filer_name, SUM(calculated_amount) as total',
          $where: `(form_type='F496' OR form_type='F496P3' OR form_type='F465P3') AND support_oppose_code='O' AND ${ieMatchWhere} AND ${dateWhere}`,
          $group: 'filer_name',
          $order: 'total DESC',
          $limit: 10,
        }),
      )
    }

    Promise.all(queries)
      .then((results) => {
        if (id !== abortRef.current) return

        const [sources, donors, timeline, spending, geo, ...ieResults] = results as [
          CampaignSourceAggRow[], CampaignDonorRow[], CampaignTimelineRow[],
          CampaignSpendRow[], CampaignDonorGeoRow[], ...CampaignIERow[][]
        ]

        setSourceBreakdown(sources)
        setTopDonors(donors)
        setEntityTimeline(timeline)
        setSpendingCategories(categorizeSpending(spending))
        setEntityDonorGeo(geo)

        if (ieResults.length >= 2) {
          const supportRows = ieResults[0] as CampaignIERow[]
          const opposeRows = ieResults[1] as CampaignIERow[]
          setIeSupport(supportRows)
          setIeOppose(opposeRows)
          setIeSupportTotal(supportRows.reduce((sum, r) => sum + (parseFloat(r.total) || 0), 0))
          setIeOpposeTotal(opposeRows.reduce((sum, r) => sum + (parseFloat(r.total) || 0), 0))
        } else {
          setIeSupport([])
          setIeOppose([])
          setIeSupportTotal(0)
          setIeOpposeTotal(0)
        }

        setIsLoading(false)
      })
      .catch((err) => {
        if (id !== abortRef.current) return
        setError(err.message || 'Failed to load entity detail')
        setIsLoading(false)
      })
  }, [entity?.filerNid, dateRange.start, dateRange.end])

  return {
    sourceBreakdown, topDonors, ieSupport, ieOppose,
    ieSupportTotal, ieOpposeTotal, spendingCategories,
    entityTimeline, entityDonorGeo, isLoading, error,
  }
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCampaignDetail.ts
git commit -m "feat(campaign-finance): add useCampaignDetail hook — Level 2 entity queries"
```

---

## Chunk 2: Chart Components

### Task 4: TopRecipientsChart

**Files:**
- Create: `src/components/charts/TopRecipientsChart.tsx`

**Reference:** `src/components/charts/HorizontalBarChart.tsx` for D3 horizontal bar pattern.

- [ ] **Step 1: Create `src/components/charts/TopRecipientsChart.tsx`**

D3 horizontal bar chart with clickable bars, colored by filer_type. Follows the same D3 margin/scale pattern as HorizontalBarChart but adds click interaction and filer_type coloring.

```typescript
import { useRef, useEffect, useMemo } from 'react'
import * as d3 from 'd3'
import { useAppStore } from '@/stores/appStore'

interface RecipientDatum {
  filerName: string
  filerNid: string
  filerType: string
  total: number
}

interface Props {
  data: RecipientDatum[]
  width?: number
  height?: number
  onSelect?: (d: RecipientDatum) => void
}

const FILER_TYPE_COLORS: Record<string, string> = {
  'Candidate or Officeholder': '#60a5fa',
  'Primarily Formed Measure': '#10b981',
  'General Purpose': '#a78bfa',
  'Primarily Formed Candidate': '#60a5fa',
  'Major Donor': '#f59e0b',
  'Independent Expenditure': '#f97316',
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value.toFixed(0)}`
}

export default function TopRecipientsChart({ data, width = 600, height, onSelect }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const isDark = useAppStore((s) => s.isDarkMode)
  const barHeight = 22
  const gap = 4
  const computedHeight = height || Math.max(200, data.length * (barHeight + gap) + 30)
  const margin = { top: 4, right: 80, bottom: 4, left: 180 }
  const innerW = width - margin.left - margin.right
  const innerH = computedHeight - margin.top - margin.bottom

  const maxVal = useMemo(() => Math.max(...data.map(d => d.total), 1), [data])

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const x = d3.scaleLinear().domain([0, maxVal]).range([0, innerW])
    const y = d3.scaleBand<number>()
      .domain(d3.range(data.length))
      .range([0, innerH])
      .padding(0.15)

    // Bars
    g.selectAll('rect.bar')
      .data(data)
      .join('rect')
      .attr('class', 'bar')
      .attr('x', 0)
      .attr('y', (_, i) => y(i)!)
      .attr('width', 0)
      .attr('height', y.bandwidth())
      .attr('rx', 3)
      .attr('fill', d => FILER_TYPE_COLORS[d.filerType] || '#64748b')
      .attr('opacity', 0.75)
      .style('cursor', onSelect ? 'pointer' : 'default')
      .on('click', (_, d) => onSelect?.(d))
      .on('mouseenter', function() { d3.select(this).attr('opacity', 1) })
      .on('mouseleave', function() { d3.select(this).attr('opacity', 0.75) })
      .transition()
      .duration(600)
      .delay((_, i) => i * 30)
      .attr('width', d => x(d.total))

    // Labels (left — filer name)
    g.selectAll('text.label')
      .data(data)
      .join('text')
      .attr('class', 'label')
      .attr('x', -8)
      .attr('y', (_, i) => y(i)! + y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .attr('fill', isDark ? '#cbd5e1' : '#475569')
      .attr('font-size', '11px')
      .attr('font-family', "'Inter', sans-serif")
      .text(d => d.filerName.length > 25 ? d.filerName.slice(0, 23) + '…' : d.filerName)
      .style('cursor', onSelect ? 'pointer' : 'default')
      .on('click', (_, d) => onSelect?.(d))

    // Values (right — dollar amount)
    g.selectAll('text.value')
      .data(data)
      .join('text')
      .attr('class', 'value')
      .attr('x', d => x(d.total) + 6)
      .attr('y', (_, i) => y(i)! + y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('fill', isDark ? '#94a3b8' : '#64748b')
      .attr('font-size', '10px')
      .attr('font-family', "'JetBrains Mono', monospace")
      .text(d => formatCurrency(d.total))
      .attr('opacity', 0)
      .transition()
      .duration(400)
      .delay((_, i) => i * 30 + 400)
      .attr('opacity', 1)
  }, [data, width, innerW, innerH, maxVal, isDark, onSelect, margin.left, margin.top])

  return <svg ref={svgRef} width={width} height={computedHeight} />
}

export { formatCurrency }
export type { RecipientDatum }
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/components/charts/TopRecipientsChart.tsx
git commit -m "feat(campaign-finance): add TopRecipientsChart — clickable horizontal bar chart"
```

---

### Task 5: ContributionTimeline

**Files:**
- Create: `src/components/charts/ContributionTimeline.tsx`

**Reference:** `src/components/charts/TrendChart.tsx` for D3 area chart pattern.

- [ ] **Step 1: Create `src/components/charts/ContributionTimeline.tsx`**

D3 area chart showing contribution money flow over an election cycle.

```typescript
import { useRef, useEffect } from 'react'
import * as d3 from 'd3'
import { useAppStore } from '@/stores/appStore'

interface TimelinePoint {
  period: string
  total: number
}

interface Props {
  data: TimelinePoint[]
  width?: number
  height?: number
  accentColor?: string
}

export default function ContributionTimeline({ data, width = 400, height = 160, accentColor = '#10b981' }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const isDark = useAppStore((s) => s.isDarkMode)

  useEffect(() => {
    if (data.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 8, right: 8, bottom: 24, left: 50 }
    const innerW = width - margin.left - margin.right
    const innerH = height - margin.top - margin.bottom

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const dates = data.map(d => new Date(d.period))
    const x = d3.scaleTime()
      .domain(d3.extent(dates) as [Date, Date])
      .range([0, innerW])

    const maxVal = Math.max(...data.map(d => d.total), 1)
    const y = d3.scaleLinear().domain([0, maxVal * 1.1]).range([innerH, 0])

    // Area
    const area = d3.area<TimelinePoint>()
      .x(d => x(new Date(d.period)))
      .y0(innerH)
      .y1(d => y(d.total))
      .curve(d3.curveMonotoneX)

    const line = d3.line<TimelinePoint>()
      .x(d => x(new Date(d.period)))
      .y(d => y(d.total))
      .curve(d3.curveMonotoneX)

    // Gradient fill
    const gradientId = `cf-timeline-grad-${Math.random().toString(36).slice(2, 8)}`
    const defs = svg.append('defs')
    const gradient = defs.append('linearGradient')
      .attr('id', gradientId)
      .attr('x1', '0%').attr('y1', '0%').attr('x2', '0%').attr('y2', '100%')
    gradient.append('stop').attr('offset', '0%').attr('stop-color', accentColor).attr('stop-opacity', 0.3)
    gradient.append('stop').attr('offset', '100%').attr('stop-color', accentColor).attr('stop-opacity', 0.02)

    g.append('path')
      .datum(data)
      .attr('d', area)
      .attr('fill', `url(#${gradientId})`)

    g.append('path')
      .datum(data)
      .attr('d', line)
      .attr('fill', 'none')
      .attr('stroke', accentColor)
      .attr('stroke-width', 1.5)

    // X axis
    const xAxis = d3.axisBottom(x)
      .ticks(Math.min(data.length, 6))
      .tickFormat(d => d3.timeFormat('%b %y')(d as Date))
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(xAxis)
      .selectAll('text')
      .attr('fill', isDark ? '#64748b' : '#94a3b8')
      .attr('font-size', '8px')
      .attr('font-family', "'JetBrains Mono', monospace")
    g.selectAll('.domain, .tick line').attr('stroke', isDark ? '#1e293b' : '#e2e8f0')

    // Y axis
    const yAxis = d3.axisLeft(y)
      .ticks(4)
      .tickFormat(d => {
        const v = d as number
        if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
        if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
        return `$${v}`
      })
    g.append('g')
      .call(yAxis)
      .selectAll('text')
      .attr('fill', isDark ? '#64748b' : '#94a3b8')
      .attr('font-size', '8px')
      .attr('font-family', "'JetBrains Mono', monospace")
    g.selectAll('.domain, .tick line').attr('stroke', isDark ? '#1e293b' : '#e2e8f0')
  }, [data, width, height, accentColor, isDark])

  return <svg ref={svgRef} width={width} height={height} />
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/charts/ContributionTimeline.tsx
git commit -m "feat(campaign-finance): add ContributionTimeline — D3 area chart"
```

---

### Task 6: FundingSourcesChart

**Files:**
- Create: `src/components/charts/FundingSourcesChart.tsx`

- [ ] **Step 1: Create `src/components/charts/FundingSourcesChart.tsx`**

Horizontal bar chart for entity_code breakdown (IND/COM/OTH/SELF).

```typescript
import { useRef, useEffect } from 'react'
import * as d3 from 'd3'
import { useAppStore } from '@/stores/appStore'
import { formatCurrency } from './TopRecipientsChart'

interface SourceDatum {
  label: string
  value: number
  color: string
}

interface Props {
  data: SourceDatum[]
  width?: number
  height?: number
}

const SOURCE_COLORS: Record<string, string> = {
  Individual: '#60a5fa',
  Committee: '#a78bfa',
  Other: '#64748b',
  Self: '#f59e0b',
}

const SOURCE_LABELS: Record<string, string> = {
  IND: 'Individual',
  COM: 'Committee',
  OTH: 'Other',
  SCC: 'Small Committee',
}

/** Transform raw source agg rows + self-funding total into chart data. */
export function buildSourceData(
  sourceRows: { entity_code: string; total: string }[],
  selfFundingTotal: number
): SourceDatum[] {
  const items: SourceDatum[] = []
  for (const row of sourceRows) {
    const label = SOURCE_LABELS[row.entity_code] || row.entity_code || 'Unknown'
    let value = parseFloat(row.total) || 0
    // Subtract self-funding from Individual bucket to avoid double-counting
    if (row.entity_code === 'IND' && selfFundingTotal > 0) {
      value = Math.max(0, value - selfFundingTotal)
    }
    if (value > 0) {
      items.push({ label, value, color: SOURCE_COLORS[label] || '#64748b' })
    }
  }
  if (selfFundingTotal > 0) {
    items.push({ label: 'Self', value: selfFundingTotal, color: SOURCE_COLORS.Self })
  }
  return items.sort((a, b) => b.value - a.value)
}

export default function FundingSourcesChart({ data, width = 300, height }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const isDark = useAppStore((s) => s.isDarkMode)
  const barHeight = 24
  const gap = 6
  const computedHeight = height || Math.max(100, data.length * (barHeight + gap) + 8)
  const margin = { top: 4, right: 70, bottom: 4, left: 80 }
  const innerW = width - margin.left - margin.right

  useEffect(() => {
    if (data.length === 0) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)
    const maxVal = Math.max(...data.map(d => d.value), 1)
    const x = d3.scaleLinear().domain([0, maxVal]).range([0, innerW])
    const y = d3.scaleBand<number>()
      .domain(d3.range(data.length))
      .range([0, computedHeight - margin.top - margin.bottom])
      .padding(0.2)

    g.selectAll('rect')
      .data(data)
      .join('rect')
      .attr('x', 0)
      .attr('y', (_, i) => y(i)!)
      .attr('height', y.bandwidth())
      .attr('rx', 3)
      .attr('fill', d => d.color)
      .attr('opacity', 0.75)
      .attr('width', 0)
      .transition().duration(500).delay((_, i) => i * 60)
      .attr('width', d => x(d.value))

    g.selectAll('text.label')
      .data(data)
      .join('text')
      .attr('x', -8)
      .attr('y', (_, i) => y(i)! + y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .attr('fill', isDark ? '#cbd5e1' : '#475569')
      .attr('font-size', '11px')
      .text(d => d.label)

    g.selectAll('text.value')
      .data(data)
      .join('text')
      .attr('x', d => x(d.value) + 6)
      .attr('y', (_, i) => y(i)! + y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('fill', isDark ? '#94a3b8' : '#64748b')
      .attr('font-size', '10px')
      .attr('font-family', "'JetBrains Mono', monospace")
      .text(d => formatCurrency(d.value))
  }, [data, width, computedHeight, isDark, innerW, margin.left, margin.top])

  return <svg ref={svgRef} width={width} height={computedHeight} />
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/charts/FundingSourcesChart.tsx
git commit -m "feat(campaign-finance): add FundingSourcesChart — entity_code horizontal bars"
```

---

### Task 7: ForAgainstSplit

**Files:**
- Create: `src/components/charts/ForAgainstSplit.tsx`

- [ ] **Step 1: Create `src/components/charts/ForAgainstSplit.tsx`**

Two-column support/oppose layout with top funders and source breakdown. This is primarily a layout component with inline mini-bars, not a full D3 chart.

```typescript
import type { CampaignIERow, CampaignDonorRow } from '@/types/datasets'
import { formatCurrency } from './TopRecipientsChart'

interface Props {
  supportTotal: number
  opposeTotal: number
  directContribTotal: number
  topDonors: CampaignDonorRow[]
  ieSupport: CampaignIERow[]
  ieOppose: CampaignIERow[]
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="w-full h-3 bg-slate-200/50 dark:bg-slate-800/50 rounded-sm overflow-hidden">
      <div className="h-full rounded-sm" style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.7 }} />
    </div>
  )
}

export default function ForAgainstSplit({
  supportTotal, opposeTotal, directContribTotal,
  topDonors, ieSupport, ieOppose,
}: Props) {
  const supportFunders = [
    ...topDonors.map(d => ({ name: d.transaction_last_name, amount: parseFloat(d.total) || 0 })),
    ...ieSupport.map(d => ({ name: `IE: ${d.filer_name}`, amount: parseFloat(d.total) || 0 })),
  ].sort((a, b) => b.amount - a.amount).slice(0, 7)

  const opposeFunders = ieOppose.map(d => ({
    name: d.filer_name,
    amount: parseFloat(d.total) || 0,
  })).slice(0, 7)

  const maxFunderAmount = Math.max(
    ...supportFunders.map(f => f.amount),
    ...opposeFunders.map(f => f.amount),
    1
  )

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Support side */}
      <div className="glass-card rounded-xl p-4 border-l-2 border-emerald-500/50">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-emerald-400 text-sm font-semibold">SUPPORT</span>
        </div>
        <p className="font-mono text-lg text-ink dark:text-white mb-4">
          {formatCurrency(directContribTotal + supportTotal)}
        </p>
        {directContribTotal > 0 && (
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-1">
            {formatCurrency(directContribTotal)} direct + {formatCurrency(supportTotal)} IE
          </p>
        )}

        <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500 mb-2 mt-4">
          Top Funders
        </p>
        <div className="space-y-1.5">
          {supportFunders.map((f, i) => (
            <div key={i}>
              <div className="flex justify-between text-[10px] mb-0.5">
                <span className="text-slate-600 dark:text-slate-300 truncate max-w-[60%]">{f.name}</span>
                <span className="font-mono text-slate-500 dark:text-slate-400">{formatCurrency(f.amount)}</span>
              </div>
              <MiniBar value={f.amount} max={maxFunderAmount} color="#10b981" />
            </div>
          ))}
          {supportFunders.length === 0 && (
            <p className="text-[10px] text-slate-400 dark:text-slate-500 italic">No direct contributions found</p>
          )}
        </div>
      </div>

      {/* Oppose side */}
      <div className="glass-card rounded-xl p-4 border-l-2 border-red-500/50">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-red-400 text-sm font-semibold">OPPOSE</span>
        </div>
        <p className="font-mono text-lg text-ink dark:text-white mb-4">
          {formatCurrency(opposeTotal)}
        </p>

        <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500 mb-2 mt-4">
          Top Funders
        </p>
        <div className="space-y-1.5">
          {opposeFunders.map((f, i) => (
            <div key={i}>
              <div className="flex justify-between text-[10px] mb-0.5">
                <span className="text-slate-600 dark:text-slate-300 truncate max-w-[60%]">{f.name}</span>
                <span className="font-mono text-slate-500 dark:text-slate-400">{formatCurrency(f.amount)}</span>
              </div>
              <MiniBar value={f.amount} max={maxFunderAmount} color="#ef4444" />
            </div>
          ))}
          {opposeFunders.length === 0 && (
            <p className="text-[10px] text-slate-400 dark:text-slate-500 italic">No opposing expenditures on record</p>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/components/charts/ForAgainstSplit.tsx
git commit -m "feat(campaign-finance): add ForAgainstSplit — two-column support/oppose view"
```

---

## Chunk 3: Main View Component

### Task 8: CampaignFinance.tsx — Full View

**Files:**
- Replace: `src/views/CampaignFinance/CampaignFinance.tsx`

**Reference:** `src/views/Dispatch911/Dispatch911.tsx` for chart-centric layout pattern.

- [ ] **Step 1: Implement the full CampaignFinance view**

Replace the placeholder with the full implementation. This is a large component — the view manages Level 1/Level 2 state, renders stat cards, charts, sidebar, and wires up all hooks.

```typescript
import { useState, useMemo, useCallback } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useDataFreshness } from '@/hooks/useDataFreshness'
import { useCampaignFinance } from '@/hooks/useCampaignFinance'
import { useCampaignDetail, type SelectedEntity } from '@/hooks/useCampaignDetail'
import { SF_ELECTIONS, getDefaultCycle, findCycleForRange } from '@/utils/electionCycles'
import StatCard from '@/components/ui/StatCard'
import DataFreshnessAlert from '@/components/ui/DataFreshnessAlert'
import ExportButton from '@/components/export/ExportButton'
import { Skeleton, SkeletonChart, SkeletonSidebarRows } from '@/components/ui/Skeleton'
import TopRecipientsChart, { type RecipientDatum, formatCurrency } from '@/components/charts/TopRecipientsChart'
import ContributionTimeline from '@/components/charts/ContributionTimeline'
import FundingSourcesChart, { buildSourceData } from '@/components/charts/FundingSourcesChart'
import ForAgainstSplit from '@/components/charts/ForAgainstSplit'
import type { CampaignFilerAggRow } from '@/types/datasets'

export default function CampaignFinance() {
  const { dateRange, setDateRange } = useAppStore()
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null)
  const [searchFilter, setSearchFilter] = useState('')

  // Use global dateRange but default to most recent election if it's the app default (30-day rolling)
  const effectiveRange = useMemo(() => {
    const cycle = findCycleForRange(dateRange.start, dateRange.end)
    if (cycle) return dateRange
    // If current range doesn't match any election cycle, use the default
    const defaultCycle = getDefaultCycle()
    return { start: defaultCycle.start, end: defaultCycle.end }
  }, [dateRange])

  // Apply election range on mount if needed
  const currentCycle = findCycleForRange(dateRange.start, dateRange.end)

  const freshness = useDataFreshness('campaignFinance', 'calculated_date', effectiveRange)
  const cfData = useCampaignFinance(effectiveRange)
  const detail = useCampaignDetail(selectedEntity, effectiveRange)

  // Election cycle presets for picker
  const electionPresets = useMemo(() =>
    SF_ELECTIONS.map(e => ({ label: e.label, start: e.start, end: e.end })),
    []
  )

  // Transform top recipients for chart
  const recipientData: RecipientDatum[] = useMemo(() =>
    cfData.topRecipients.slice(0, 20).map(r => ({
      filerName: r.filer_name,
      filerNid: r.filer_nid,
      filerType: r.filer_type,
      total: parseFloat(r.total) || 0,
    })),
    [cfData.topRecipients]
  )

  // Timeline data
  const timelineData = useMemo(() =>
    (selectedEntity ? detail.entityTimeline : cfData.timeline).map(r => ({
      period: r.period,
      total: parseFloat(r.total) || 0,
    })),
    [selectedEntity, detail.entityTimeline, cfData.timeline]
  )

  // Funding sources
  const sourceData = useMemo(() =>
    buildSourceData(
      selectedEntity ? detail.sourceBreakdown : cfData.fundingSources,
      selectedEntity ? 0 : (cfData.stats?.selfFundingTotal || 0)
    ),
    [selectedEntity, detail.sourceBreakdown, cfData.fundingSources, cfData.stats]
  )

  // Sidebar filer list (split into candidates and measures)
  const { candidates, measures, committees } = useMemo(() => {
    const all = cfData.topRecipients
    const filter = searchFilter.toLowerCase()
    const filtered = filter
      ? all.filter(r => r.filer_name.toLowerCase().includes(filter))
      : all
    return {
      candidates: filtered.filter(r =>
        r.filer_type === 'Candidate or Officeholder' ||
        r.filer_type === 'Primarily Formed Candidate'
      ),
      measures: filtered.filter(r =>
        r.filer_type === 'Primarily Formed Measure'
      ),
      committees: filtered.filter(r =>
        r.filer_type === 'General Purpose' ||
        r.filer_type === 'Major Donor' ||
        r.filer_type === 'Independent Expenditure'
      ),
    }
  }, [cfData.topRecipients, searchFilter])

  const maxFilerTotal = useMemo(() =>
    Math.max(...cfData.topRecipients.map(r => parseFloat(r.total) || 0), 1),
    [cfData.topRecipients]
  )

  const handleSelectRecipient = useCallback((d: RecipientDatum) => {
    // Extract last name for IE matching (take last word of filer_name)
    const parts = d.filerName.split(/\s+/)
    const lastName = parts[parts.length - 1]
    setSelectedEntity({
      filerName: d.filerName,
      filerNid: d.filerNid,
      filerType: d.filerType,
      total: d.total,
      candidateLastName: d.filerType.includes('Candidate') ? lastName : undefined,
      // For measures, we'd need ballot_number — not available from agg row.
      // This would need a secondary lookup or be embedded in the sidebar data.
    })
  }, [])

  const handleSelectFiler = useCallback((r: CampaignFilerAggRow) => {
    const parts = r.filer_name.split(/\s+/)
    const lastName = parts[parts.length - 1]
    setSelectedEntity({
      filerName: r.filer_name,
      filerNid: r.filer_nid,
      filerType: r.filer_type,
      total: parseFloat(r.total) || 0,
      candidateLastName: r.filer_type.includes('Candidate') ? lastName : undefined,
    })
  }, [])

  const handleBack = useCallback(() => setSelectedEntity(null), [])

  const cycleName = currentCycle?.label || 'Custom Range'

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-slate-200/50 dark:border-white/[0.04] px-6 py-3 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="font-display text-2xl italic text-ink dark:text-white leading-none">
                Campaign Finance
              </h1>
              <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-0.5">
                SF Ethics Commission · {cycleName}
              </p>
            </div>
            {!cfData.isLoading && cfData.stats && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-signal-emerald/80 bg-signal-emerald/10 px-2 py-1 rounded-full">
                <span className="w-1 h-1 rounded-full bg-signal-emerald pulse-live" />
                {cfData.topRecipients.length} filers
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Election cycle quick-select */}
            <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-white/[0.04] rounded-lg p-0.5">
              {SF_ELECTIONS.slice(0, 4).map((e) => (
                <button
                  key={e.date}
                  onClick={() => setDateRange(e.start, e.end)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-mono transition-all duration-200 ${
                    effectiveRange.start === e.start && effectiveRange.end === e.end
                      ? 'bg-white dark:bg-white/[0.08] text-ink dark:text-white shadow-sm'
                      : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                >
                  {e.label}
                </button>
              ))}
            </div>
            <ExportButton targetSelector="#cf-capture" filename="campaign-finance" />
          </div>
        </div>
      </header>

      {/* Content */}
      <div id="cf-capture" className="flex-1 overflow-hidden flex">
        {/* Main chart area */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Loading */}
          {cfData.isLoading && (
            <div className="max-w-4xl space-y-6">
              <div className="flex gap-2.5 flex-wrap">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="glass-card rounded-xl px-4 py-3 min-w-[140px] animate-pulse" style={{ animationDelay: `${i * 60}ms` }}>
                    <Skeleton className="h-2.5 w-16 mb-3" />
                    <Skeleton className="h-6 w-24" />
                  </div>
                ))}
              </div>
              <SkeletonChart width={640} height={300} />
            </div>
          )}

          {/* Freshness alert */}
          {!cfData.isLoading && !freshness.isLoading && !freshness.hasDataInRange && (
            <div className="relative h-64">
              <DataFreshnessAlert
                latestDate={freshness.latestDate}
                suggestedRange={freshness.suggestedRange}
                accentColor="#10b981"
              />
            </div>
          )}

          {/* Error */}
          {cfData.error && (
            <div className="flex items-center justify-center py-16">
              <div className="glass-card rounded-xl p-6 max-w-sm">
                <p className="text-sm font-medium text-signal-red mb-1">Data Error</p>
                <p className="text-xs text-slate-400">{cfData.error}</p>
              </div>
            </div>
          )}

          {/* Main content */}
          {!cfData.isLoading && !cfData.error && cfData.stats && (
            <div className="max-w-4xl space-y-6">
              {/* Stat cards */}
              <div className="flex gap-2.5 flex-wrap">
                <StatCard
                  label="Total Raised" info="cf-total-raised"
                  value={formatCurrency(cfData.stats.totalRaised)}
                  color="#10b981" delay={0}
                  yoyDelta={cfData.yoy.totalRaisedDelta}
                />
                <StatCard
                  label="Avg Contribution" info="cf-avg-contribution"
                  value={formatCurrency(cfData.stats.avgContribution)}
                  color="#60a5fa" delay={80}
                />
                <StatCard
                  label="Unique Donors" info="cf-unique-donors"
                  value={cfData.stats.uniqueDonors.toLocaleString()}
                  color="#a78bfa" delay={160}
                />
                <StatCard
                  label="Small Donor %" info="cf-small-donor-pct"
                  value={`${cfData.stats.smallDonorPct.toFixed(1)}%`}
                  color="#f59e0b" delay={240}
                  yoyDelta={cfData.yoy.smallDonorDelta}
                />
              </div>

              {/* Level 2: Entity Detail */}
              {selectedEntity && (
                <>
                  {/* Back + entity header */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleBack}
                      className="text-slate-400 hover:text-white transition-colors text-sm"
                    >
                      ← Back
                    </button>
                    <div>
                      <h2 className="text-lg font-semibold text-white">{selectedEntity.filerName}</h2>
                      <p className="text-[10px] font-mono text-slate-400">
                        {selectedEntity.filerType} · {formatCurrency(selectedEntity.total)} raised
                      </p>
                    </div>
                  </div>

                  {detail.isLoading ? (
                    <SkeletonChart width={640} height={200} />
                  ) : (
                    <>
                      {/* For/Against split */}
                      <ForAgainstSplit
                        supportTotal={detail.ieSupportTotal}
                        opposeTotal={detail.ieOpposeTotal}
                        directContribTotal={selectedEntity.total}
                        topDonors={detail.topDonors}
                        ieSupport={detail.ieSupport}
                        ieOppose={detail.ieOppose}
                      />

                      {/* Entity charts */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {timelineData.length > 0 && (
                          <div className="glass-card rounded-xl p-4">
                            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                              Contribution Timeline
                            </p>
                            <ContributionTimeline data={timelineData} width={340} height={140} />
                          </div>
                        )}
                        {sourceData.length > 0 && (
                          <div className="glass-card rounded-xl p-4">
                            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                              Funding Sources
                            </p>
                            <FundingSourcesChart data={sourceData} width={300} />
                          </div>
                        )}
                      </div>

                      {/* Spending categories */}
                      {detail.spendingCategories.length > 0 && (
                        <div className="glass-card rounded-xl p-4">
                          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                            Spending Categories
                          </p>
                          <div className="space-y-1.5">
                            {detail.spendingCategories.map((cat, i) => (
                              <div key={i} className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-300 w-28 truncate">{cat.category}</span>
                                <div className="flex-1 h-3 bg-slate-800/50 rounded-sm overflow-hidden">
                                  <div
                                    className="h-full rounded-sm bg-amber-500/60"
                                    style={{
                                      width: `${(cat.total / (detail.spendingCategories[0]?.total || 1)) * 100}%`,
                                    }}
                                  />
                                </div>
                                <span className="text-[10px] font-mono text-slate-400 w-16 text-right">
                                  {formatCurrency(cat.total)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {/* Level 1: Election Overview */}
              {!selectedEntity && (
                <>
                  {/* Top Recipients hero chart */}
                  <div className="glass-card rounded-xl p-4">
                    <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                      Top Recipients
                    </p>
                    <TopRecipientsChart
                      data={recipientData}
                      width={640}
                      onSelect={handleSelectRecipient}
                    />
                  </div>

                  {/* Timeline + Funding Sources side by side */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {timelineData.length > 0 && (
                      <div className="glass-card rounded-xl p-4">
                        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                          Contribution Timeline
                        </p>
                        <ContributionTimeline data={timelineData} width={340} height={140} />
                      </div>
                    )}
                    {sourceData.length > 0 && (
                      <div className="glass-card rounded-xl p-4">
                        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                          Funding Sources
                        </p>
                        <FundingSourcesChart data={sourceData} width={300} />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Empty state */}
          {!cfData.isLoading && !cfData.error && !cfData.stats && (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <p className="text-slate-400 dark:text-slate-500 text-sm mb-1">No campaign finance data in this period</p>
                <p className="text-slate-400/60 dark:text-slate-600 text-xs">
                  Try selecting a different election cycle
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <aside className="w-80 flex-shrink-0 border-l border-slate-200/50 dark:border-white/[0.04] overflow-y-auto bg-white/50 dark:bg-slate-900/30 backdrop-blur-xl flex flex-col">
          <div className="p-4">
            {/* Search filter */}
            <input
              type="text"
              placeholder="Search filers…"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full mb-4 px-3 py-1.5 rounded-lg bg-slate-100/80 dark:bg-white/[0.04] border border-slate-200/50 dark:border-white/[0.04] text-sm text-ink dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
            />

            {cfData.isLoading ? (
              <SkeletonSidebarRows count={8} />
            ) : (
              <>
                {/* Candidates section */}
                {candidates.length > 0 && (
                  <>
                    <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                      Candidates ({candidates.length})
                    </p>
                    <div className="space-y-0.5 mb-4">
                      {candidates.map((r) => (
                        <FilerRow
                          key={r.filer_nid}
                          filer={r}
                          maxTotal={maxFilerTotal}
                          isSelected={selectedEntity?.filerNid === r.filer_nid}
                          onSelect={() => handleSelectFiler(r)}
                        />
                      ))}
                    </div>
                  </>
                )}

                {/* Measures section */}
                {measures.length > 0 && (
                  <>
                    <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                      Ballot Measures ({measures.length})
                    </p>
                    <div className="space-y-0.5 mb-4">
                      {measures.map((r) => (
                        <FilerRow
                          key={r.filer_nid}
                          filer={r}
                          maxTotal={maxFilerTotal}
                          isSelected={selectedEntity?.filerNid === r.filer_nid}
                          onSelect={() => handleSelectFiler(r)}
                        />
                      ))}
                    </div>
                  </>
                )}

                {/* Committees section */}
                {committees.length > 0 && (
                  <>
                    <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                      Committees ({committees.length})
                    </p>
                    <div className="space-y-0.5 mb-4">
                      {committees.map((r) => (
                        <FilerRow
                          key={r.filer_nid}
                          filer={r}
                          maxTotal={maxFilerTotal}
                          isSelected={selectedEntity?.filerNid === r.filer_nid}
                          onSelect={() => handleSelectFiler(r)}
                        />
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            {/* Donor Geography Map placeholder — see implementation note below */}
            {!cfData.isLoading && cfData.donorGeo.length > 0 && (
              <div className="mt-4">
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                  Donor Geography
                </p>
                <div className="glass-card rounded-xl overflow-hidden" style={{ height: 200 }}>
                  {/* MapView with zip code choropleth or dot map goes here.
                      Uses cfData.donorGeo (or detail.entityDonorGeo when in Level 2)
                      with a small Mapbox instance. See implementation note in Task 8. */}
                  <div className="h-full flex items-center justify-center text-[10px] text-slate-500">
                    Donor map — requires sf-zipcodes.geojson
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

/** Sidebar filer row with mini bar */
function FilerRow({
  filer, maxTotal, isSelected, onSelect,
}: {
  filer: CampaignFilerAggRow
  maxTotal: number
  isSelected: boolean
  onSelect: () => void
}) {
  const total = parseFloat(filer.total) || 0
  const pct = (total / maxTotal) * 100

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-3 py-2 rounded-lg transition-all duration-150 ${
        isSelected
          ? 'bg-emerald-500/10 border border-emerald-500/20'
          : 'hover:bg-slate-100/50 dark:hover:bg-white/[0.02]'
      }`}
    >
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-[11px] text-slate-700 dark:text-slate-200 font-medium truncate max-w-[65%]">
          {filer.filer_name}
        </span>
        <span className="text-[10px] font-mono text-slate-400">
          {formatCurrency(total)}
        </span>
      </div>
      <div className="w-full h-1.5 bg-slate-200/50 dark:bg-slate-800/50 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            backgroundColor: isSelected ? '#10b981' : '#64748b',
            opacity: isSelected ? 0.8 : 0.4,
          }}
        />
      </div>
    </button>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: Clean build. No type errors.

- [ ] **Step 3: Verify in browser**

Run: `pnpm dev`
Navigate to `http://localhost:5174/campaign-finance`
Expected:
- Header shows "Campaign Finance" with election cycle pills
- 4 stat cards render with data (Total Raised, Avg Contribution, Unique Donors, Small Donor %)
- Top Recipients horizontal bar chart shows top 20 filers
- Contribution Timeline and Funding Sources charts render below
- Sidebar shows Candidates and Ballot Measures sections
- Clicking a bar or sidebar row drills into Level 2 with For/Against split
- Back arrow returns to Level 1
- Election cycle pills switch data

- [ ] **Step 4: Commit**

```bash
git add src/views/CampaignFinance/CampaignFinance.tsx
git commit -m "feat(campaign-finance): implement full view — Level 1 overview + Level 2 entity detail"
```

**Implementation notes for Task 8:**

1. **Donor Geography Map:** The sidebar includes a placeholder for the donor map. Full implementation requires sourcing `public/data/sf-zipcodes.geojson` (Census ZCTA boundaries for 941xx zips). If the GeoJSON is available, render a small `MapView` with a choropleth fill layer using `cfData.donorGeo` data (or `detail.entityDonorGeo` when in Level 2). If sourcing proves difficult, implement as a dot map instead (circles at zip centroid coordinates sized by contribution volume — no boundary file needed). This can be added as a follow-up task.

2. **Ballot Number Population:** The `handleSelectFiler` callback cannot populate `ballotNumber` from the aggregation row (it only has filer_name/filer_nid/filer_type/total). To enable IE matching for ballot measures, either:
   - Fire a secondary lookup when a measure is selected: `SELECT ballot_number FROM pitq-e56w WHERE filer_nid='{nid}' AND ballot_number IS NOT NULL LIMIT 1`
   - Or add `ballot_number` to the sidebar query by joining with IE records
   The simpler approach (secondary lookup) should be done inside `useCampaignDetail` — fire a quick query to find the ballot_number for the filer_nid when the entity type is "Primarily Formed Measure", then use that for IE queries.

3. **`formatCurrency` location:** Currently exported from `TopRecipientsChart`. Consider moving to `src/utils/formatting.ts` if it causes circular import issues. For now it works because CampaignFinance.tsx imports from TopRecipientsChart directly.

---

### Task 9: Final Verification

- [ ] **Step 1: Run full build**

Run: `pnpm build`
Expected: Clean build, zero errors.

- [ ] **Step 2: Functional verification checklist**

Navigate to `http://localhost:5174/campaign-finance`:

1. **Nav item visible** in sidebar with green accent
2. **Default election cycle** loads (most recent completed)
3. **Stat cards** show Total Raised, Avg Contribution, Unique Donors, Small Donor %
4. **Top Recipients chart** renders with colored bars (blue=candidates, green=measures, purple=committees)
5. **Clicking a bar** transitions to Level 2 with entity name, For/Against split, spending categories
6. **Back arrow** returns to Level 1
7. **Sidebar search** filters the filer list
8. **Election cycle pills** switch data when clicked
9. **DataFreshnessAlert** appears if a future election cycle is selected
10. **ExportButton** captures PNG of the current state
11. **Dark mode** renders correctly (toggle via AppShell)

- [ ] **Step 3: Final commit (if any polish needed)**

```bash
git add -A
git commit -m "feat(campaign-finance): polish and verification"
```
