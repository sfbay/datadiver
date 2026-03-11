# Campaign Finance View — Design Spec

## Overview

New top-level view (`/campaign-finance`) visualizing SF campaign finance transactions. Chart-centric layout with a two-level drill-down: election overview → candidate/measure detail with for/against split. Supporting donor geography map in the sidebar. Dataset: `pitq-e56w` (Campaign Finance Transactions, ~953K records).

## Dataset

- **Socrata ID:** `pitq-e56w`
- **Endpoint:** `https://data.sfgov.org/resource/pitq-e56w.json`
- **Records:** ~953K total (2015–present)
- **Date field:** `calculated_date` (reliable; `election_date` is 99.5% null)
- **Amount field:** `calculated_amount`
- **Geo field:** None (donor zip via `transaction_zip`)

### Key Fields

**Transaction Identity:**
- `form_type` — `A` (contributions, 486K), `E` (expenditures, 179K), `F497P1` (late contributions, 10K), `F496` (independent expenditures, 6.5K), others
- `filer_name` — committee or candidate name
- `filer_type` — `Candidate or Officeholder` (557K), `General Purpose` (223K), `Primarily Formed Measure` (147K), `Primarily Formed Candidate` (19K), `Major Donor`, `Independent Expenditure`
- `entity_code` — `IND` (individual, 494K), `OTH` (other, 265K), `COM` (committee, 64K)

**Contributor Info:**
- `transaction_last_name`, `transaction_city`, `transaction_state`, `transaction_zip`
- `transaction_self` — boolean for self-funding

**Support/Oppose (IE forms only):**
- `support_oppose_code` — `S` (support, 37K) or `O` (oppose, 6K). Only on F496/F465P3/F496P3 forms.
- `candidate_last_name`, `office_description`, `district_number` — IE target (candidates)
- `ballot_name`, `ballot_number`, `ballot_jurisdiction` — IE target (measures)

**Expenditure Details:**
- `transaction_description` — free-text, 63% null on Form E. Needs normalization for spending categories.

## Election Scoping

`election_date` is too sparse for filtering (99.5% null). Instead, use a static election cycle lookup:

```typescript
const SF_ELECTIONS = [
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
```

The DateRangePicker renders these as presets. Default: most recent election with substantial data. The `start` dates approximate the beginning of the election cycle (filing season for that election). Custom date ranges remain available.

## Layout

Chart-centric (like Dispatch 911). No primary map — the hero is a chart area. Right sidebar holds candidate/measure list and a compact donor geography map.

```
┌─────────────────────────────────────────────────────┬──────────────┐
│  [Stat Cards Row]                                   │  Candidates  │
│                                                     │  · Name $amt │
│  ┌─────────────────────────────────────────────┐    │  · Name $amt │
│  │  Top Recipients (horizontal bar chart)       │    │  · Name $amt │
│  │  or                                          │    │              │
│  │  Entity Detail (for/against split)           │    │  Measures    │
│  └─────────────────────────────────────────────┘    │  · Prop A    │
│                                                     │  · Prop B    │
│  ┌──────────────────┐  ┌──────────────────────┐    │              │
│  │ Contribution      │  │ Funding Sources      │    │  ┌────────┐ │
│  │ Timeline          │  │ (Individual/Cmte/    │    │  │ Donor  │ │
│  │                   │  │  Self/Public)        │    │  │ Map    │ │
│  └──────────────────┘  └──────────────────────┘    │  └────────┘ │
└─────────────────────────────────────────────────────┴──────────────┘
```

## Stat Cards (4)

| Card | ID | Metric | Color | Query |
|------|----|--------|-------|-------|
| Total Raised | `cf-total-raised` | SUM(`calculated_amount`) for Form A contributions | #10b981 (green) | `form_type='A' AND calculated_date in range` |
| Avg Contribution | `cf-avg-contribution` | AVG(`calculated_amount`) for Form A | #60a5fa (blue) | Same filter |
| Unique Donors | `cf-unique-donors` | Approximate unique contributor count | #a78bfa (purple) | `GROUP BY transaction_last_name` → count rows client-side (Socrata does not support `COUNT(DISTINCT)`) |
| Small Donor % | `cf-small-donor-pct` | % of Form A records where `calculated_amount < 100` | #f59e0b (amber) | Two queries: total count + count where amount < 100 |

**YoY comparison:** Each election maps to its prior equivalent (Nov 2024 → Nov 2022, Mar 2024 → Mar 2020). This is election-cycle YoY, not calendar YoY — `useTrendBaseline` is **not used** here since it assumes rolling calendar periods. The `useCampaignFinance` hook fires the same stat queries against the prior cycle's date range and computes deltas.

**Negative amounts:** Refunds and adjustments produce negative `calculated_amount` values. These correctly reduce SUM totals. For Avg Contribution and Small Donor %, filter to `calculated_amount > 0` to exclude refunds.

Format: Total Raised as currency ($12.3M), Avg as currency ($285), Unique Donors as number (4,218), Small Donor % as percentage (34%).

## Two-Level Drill-Down

### Level 1 — Election Overview

The default view when an election is selected. Shows aggregate data across all filers.

**Top Recipients Chart** (hero chart):
- Horizontal bar chart ranking filers by total contributions received
- Bars colored by `filer_type`: candidates (blue), measures (green), general purpose committees (purple)
- Top 20 filers, sorted by total raised
- Click a bar → drill to Level 2
- Query: `SELECT filer_name, filer_type, SUM(calculated_amount) as total WHERE form_type='A' AND calculated_date in range GROUP BY filer_name, filer_type ORDER BY total DESC LIMIT 20`

**Contribution Timeline:**
- Area chart showing total contribution dollars by week/month across the election cycle
- X-axis: weeks or months (auto-granularity based on cycle length)
- Y-axis: dollars
- Query: `SELECT date_trunc_ym(calculated_date) as period, SUM(calculated_amount) as total WHERE form_type='A' AND calculated_date in range GROUP BY period ORDER BY period`

**Funding Sources:**
- Donut or horizontal bar chart showing breakdown by donor type:
  - IND (Individual) — direct individual contributions
  - COM (Committee) — committee-to-committee transfers
  - OTH (Other) — other organizations
  - SELF — self-funded (where `transaction_self = true`)
- Two queries: (1) `GROUP BY entity_code` for IND/COM/OTH totals, (2) `WHERE transaction_self=true` for SELF total. Client-side: subtract SELF amount from its entity_code bucket (usually IND) to avoid double-counting, then add SELF as its own category.
- Query 1: `SELECT entity_code, SUM(calculated_amount) as total WHERE form_type='A' AND calculated_date in range GROUP BY entity_code ORDER BY total DESC`
- Query 2: `SELECT SUM(calculated_amount) as total WHERE form_type='A' AND transaction_self=true AND calculated_date in range`

### Level 2 — Entity Detail

When a candidate or measure is clicked, the hero area transitions to show that entity's breakdown.

**Header:** Entity name, total raised, filer type badge. Back arrow to return to Level 1.

**For/Against Split View:**

```
┌──────────────────────────────┬──────────────────────────────┐
│  ✓ SUPPORT                   │  ✗ OPPOSE                    │
│  $2.4M total                 │  $890K total                 │
│                              │                              │
│  Top Funders                 │  Top Funders                 │
│  ▓▓▓▓▓▓▓▓ Tech PAC  $400K   │  ▓▓▓▓▓▓ Landlords  $200K    │
│  ▓▓▓▓▓▓ Labor PAC  $350K    │  ▓▓▓▓ Chamber PAC  $180K    │
│  ▓▓▓▓ Indiv. donor  $200K   │  ▓▓▓ Individual    $120K    │
│                              │                              │
│  Source Breakdown            │  Source Breakdown             │
│  Individual: 45%             │  Committee: 72%              │
│  Committee: 35%              │  Individual: 28%             │
│  Self: 20%                   │                              │
└──────────────────────────────┴──────────────────────────────┘
```

**Data assembly for the split view:**

For **ballot measures** (`filer_type = 'Primarily Formed Measure'`):
- **Support side:** Direct contributions (Form A) to this filer + IE expenditures (F496) with `support_oppose_code = 'S'` and matching `ballot_number`/`ballot_name`
- **Oppose side:** IE expenditures (F496) with `support_oppose_code = 'O'` and matching `ballot_number`/`ballot_name`. Also contributions to opposing committees (filer names often contain "No on X" or "Against").

For **candidates** (`filer_type = 'Candidate or Officeholder'`):
- **Support side:** Direct contributions (Form A) to this filer + IE expenditures (F496) with `support_oppose_code = 'S'` and matching `candidate_last_name`
- **Oppose side:** IE expenditures (F496) with `support_oppose_code = 'O'` and matching `candidate_last_name`

Note: Oppose data is only available via IE records (~6K oppose records total). Some entities will have no oppose data — show "No opposing expenditures on record" in the oppose column.

**Below the split:** Contribution timeline for this entity (same chart type as Level 1, filtered to this filer).

## Sidebar

### Candidate/Measure List

Two sections: **Candidates** and **Ballot Measures**.

Each row:
- Filer name (truncated if long)
- Total raised (formatted currency)
- Mini horizontal bar showing relative funding level (proportional to top filer)
- Ballot measure rows get a small green/red split indicator showing support vs oppose money balance (from IE data)
- Click → Level 2 drill-down
- Active entity highlighted

**Sort:** By total raised (default). Text filter at top for quick lookup.

**Query:** `SELECT filer_name, filer_type, SUM(calculated_amount) as total WHERE form_type='A' AND calculated_date in range GROUP BY filer_name, filer_type ORDER BY total DESC`

### Donor Geography Map

Small Mapbox choropleth below the candidate list. SF zip code boundaries colored by contribution volume.

- Data: `SELECT transaction_zip, SUM(calculated_amount) as total, COUNT(*) as cnt WHERE form_type='A' AND calculated_date in range AND transaction_zip IS NOT NULL GROUP BY transaction_zip ORDER BY total DESC LIMIT 50`
- Zip code polygons: loaded once from a static GeoJSON asset (SF zip code boundaries)
- Color scale: sequential green (low→high contribution volume)
- Updates when drilling into Level 2 (shows where that entity's donors are)
- Tooltip: zip code, total contributions, donor count

## Spending Categories (Level 2, entity detail)

Horizontal bar chart of top expenditure categories from Form E `transaction_description`. Because 63% of descriptions are null and the rest are free-text, apply a normalization map:

```typescript
const SPENDING_CATEGORIES: Record<string, string[]> = {
  'Campaign Staff': ['campaign worker', 'payroll', 'employer payroll', 'canvassing', 'field'],
  'Mailers & Print': ['slate mailer', 'mailer', 'printing', 'print'],
  'Digital & Media': ['digital', 'social media', 'online', 'advertising', 'media buy', 'tv', 'radio'],
  'Consulting': ['consulting', 'consultant', 'professional', 'pro/ofc', 'political strategy'],
  'Events & Fundraising': ['fundrais', 'event', 'catering', 'venue'],
  'Overhead': ['rent', 'office', 'supplies', 'phone', 'postage'],
}
```

Match `transaction_description` (case-insensitive contains) against these categories. Unmapped entries grouped as "Other". This runs client-side on the fetched expenditure description rows.

Query: `SELECT transaction_description, SUM(calculated_amount) as total WHERE form_type='E' AND filer_name='{filer}' AND calculated_date in range AND transaction_description IS NOT NULL GROUP BY transaction_description ORDER BY total DESC LIMIT 100`

## Route & Navigation

- **Path:** `/campaign-finance`
- **Nav item:** Top-level in AppShell sidebar, accent color `#10b981` (green — distinct from existing views)
- **Short label:** `CF`
- **Description:** "Campaign contributions & spending"
- **Category:** `'other'` in dataset config (or add `'governance'` if we want semantic separation later)

## Loading & Error States

**Progressive skeleton loading** (standard pattern — no full-screen blockers):
- Stat cards: `SkeletonStatCards` (4 shimmer cards) while queries 1-5 resolve
- Top Recipients chart: `SkeletonChart` in the hero area
- Sidebar filer list: `SkeletonSidebarRows`
- Donor map: `MapLoadingIndicator` corner pill
- Level 2 detail: `SkeletonChart` for for/against split while detail queries fire

**Error handling:**
- Query failures: silent fail per component zone (same as other views). Chart area shows "Unable to load data" message.
- All queries fail: full error overlay with retry button

**Empty state:**
- No contributions in selected date range: "No campaign finance data in this period. Try selecting a different election cycle." with election picker presets visible.

**Data freshness:**
- `useDataFreshness('campaignFinance', 'calculated_date', dateRange)` checks whether the selected date range has data
- `DataFreshnessAlert` appears if the range is stale (e.g., user selects a future election cycle with no filings yet)

**Export:**
- `ExportButton` positioned in header bar (same as other views) for PNG export of the current state

## Data Strategy

### Server-side aggregation (stat cards, charts, sidebar list)
Standard Socrata `GROUP BY` queries against `pitq-e56w`. All filtered by `calculated_date` within the selected election cycle range.

### Spending normalization (client-side)
Fetch top 100 expenditure description rows with amounts, normalize client-side via category map. Acceptable because the grouped result set is small.

### Donor geography (server-side)
`GROUP BY transaction_zip` with `SUM(calculated_amount)`. Zip code polygons from a static GeoJSON file bundled as an asset.

### For/against assembly (multiple queries)
Level 2 detail fires parallel queries:
1. Direct contributions (Form A) to the selected filer
2. IE support records (F496 where `support_oppose_code = 'S'` and matching candidate/ballot)
3. IE oppose records (F496 where `support_oppose_code = 'O'` and matching candidate/ballot)

## New Socrata Queries (all against `pitq-e56w`)

### Stat cards
1. **Total raised + avg:** `SELECT SUM(calculated_amount) as total, AVG(calculated_amount) as avg_amt WHERE form_type='A' AND calculated_amount > 0 AND calculated_date >= '{start}' AND calculated_date <= '{end}'`
2. **Unique donors:** `SELECT transaction_last_name, COUNT(*) as cnt WHERE form_type='A' AND calculated_date >= '{start}' AND calculated_date <= '{end}' AND transaction_last_name IS NOT NULL GROUP BY transaction_last_name LIMIT 50000` → count rows client-side. (Socrata does not support `COUNT(DISTINCT)`)
3. **Small donor count:** `SELECT COUNT(*) as cnt WHERE form_type='A' AND calculated_amount > 0 AND calculated_amount < 100 AND calculated_date >= '{start}' AND calculated_date <= '{end}'`
4. **Total contribution count:** `SELECT COUNT(*) as cnt WHERE form_type='A' AND calculated_amount > 0 AND calculated_date >= '{start}' AND calculated_date <= '{end}'`
5. **Self-funding total:** `SELECT SUM(calculated_amount) as total WHERE form_type='A' AND transaction_self=true AND calculated_date >= '{start}' AND calculated_date <= '{end}'`
6. **Prior cycle stat cards:** Queries 1, 3, 4 repeated with prior election cycle dates for YoY delta

### Charts
4. **Top recipients:** `SELECT filer_name, filer_type, SUM(calculated_amount) as total WHERE form_type='A' AND calculated_date in range GROUP BY filer_name, filer_type ORDER BY total DESC LIMIT 20`
5. **Contribution timeline:** `SELECT date_trunc_ym(calculated_date) as period, SUM(calculated_amount) as total WHERE form_type='A' AND calculated_date in range GROUP BY period ORDER BY period`
6. **Funding sources:** `SELECT entity_code, SUM(calculated_amount) as total WHERE form_type='A' AND calculated_date in range GROUP BY entity_code ORDER BY total DESC`

### Sidebar
7. **Filer list:** Same as query 4 with higher LIMIT (50)
8. **Donor geography:** `SELECT transaction_zip, SUM(calculated_amount) as total, COUNT(*) as cnt WHERE form_type='A' AND calculated_date in range AND transaction_zip IS NOT NULL GROUP BY transaction_zip ORDER BY total DESC LIMIT 50`

### Level 2 detail
9. **Entity contributions by source:** `SELECT entity_code, SUM(calculated_amount) as total, COUNT(*) as cnt WHERE form_type='A' AND filer_name='{name}' AND calculated_date in range GROUP BY entity_code`
10. **Entity top donors:** `SELECT transaction_last_name, SUM(calculated_amount) as total WHERE form_type='A' AND filer_name='{name}' AND calculated_date in range GROUP BY transaction_last_name ORDER BY total DESC LIMIT 10`
11. **Entity timeline:** `SELECT date_trunc_ym(calculated_date) as period, SUM(calculated_amount) as total WHERE form_type='A' AND filer_name='{name}' AND calculated_date in range GROUP BY period ORDER BY period`
12. **IE support for candidate:** `SELECT filer_name, SUM(calculated_amount) as total WHERE support_oppose_code='S' AND candidate_last_name='{last}' AND calculated_date in range GROUP BY filer_name ORDER BY total DESC LIMIT 10`
12b. **IE support for measure:** `SELECT filer_name, SUM(calculated_amount) as total WHERE support_oppose_code='S' AND ballot_number='{num}' AND calculated_date in range GROUP BY filer_name ORDER BY total DESC LIMIT 10`
13. **IE oppose for candidate:** Same as 12 with `support_oppose_code='O'`
13b. **IE oppose for measure:** Same as 12b with `support_oppose_code='O'`

The hook selects the appropriate query (12 or 12b, 13 or 13b) based on entity type (`filer_type`). Never OR across candidate/ballot fields.
14. **Entity spending categories:** `SELECT transaction_description, SUM(calculated_amount) as total WHERE form_type='E' AND filer_name='{name}' AND calculated_date in range AND transaction_description IS NOT NULL GROUP BY transaction_description ORDER BY total DESC LIMIT 100`
15. **Entity donor geography:** Same as query 8 but filtered by `filer_name`

## Type Definitions

### Dataset registration

Add to `src/api/datasets.ts`:
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
}
```

### New types in `src/types/datasets.ts`

```typescript
export interface CampaignTransaction {
  filing_id_number: string
  filer_name: string
  filer_type: string
  filer_nid: string
  form_type: string
  calculated_amount: string  // Socrata returns numbers as strings
  calculated_date: string
  transaction_last_name?: string
  transaction_city?: string
  transaction_state?: string
  transaction_zip?: string
  transaction_self?: boolean
  transaction_description?: string
  entity_code?: string
  support_oppose_code?: string    // 'S' or 'O', IE forms only
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
```

## New Files

- `src/views/CampaignFinance/CampaignFinance.tsx` — main view component (Level 1 + Level 2 state)
- `src/hooks/useCampaignFinance.ts` — all Socrata queries (stat cards, charts, sidebar list, donor geo). Only fires when view is active.
- `src/hooks/useCampaignDetail.ts` — Level 2 queries (entity contributions, top donors, IE support/oppose, spending, timeline). Fires when an entity is selected.
- `src/components/charts/TopRecipientsChart.tsx` — horizontal bar chart for Level 1 hero
- `src/components/charts/ForAgainstSplit.tsx` — two-column support/oppose visualization for Level 2
- `src/components/charts/FundingSourcesChart.tsx` — donut or horizontal bar for entity_code breakdown
- `src/components/charts/ContributionTimeline.tsx` — area/line chart for money flow over election cycle
- `src/utils/spendingCategories.ts` — normalization map + categorization function

## Modified Files

- `src/api/datasets.ts` — add `campaignFinance` entry
- `src/types/datasets.ts` — add campaign finance interfaces + add `'campaign-finance'` to `ViewId` union type
- `src/components/layout/AppShell.tsx` — add Campaign Finance nav item
- `src/App.tsx` — add `/campaign-finance` route
- `src/utils/glossary.ts` — campaign finance glossary entries

## Glossary Entries

```
'cf-total-raised': 'Total monetary contributions received (Form A filings). Includes individual donors, committees, and self-funding.'
'cf-avg-contribution': 'Average contribution size. Lower averages suggest broader grassroots support; higher averages indicate reliance on large donors.'
'cf-unique-donors': 'Distinct contributor names in the filing period. Approximation — same person may appear with slightly different name spellings.'
'cf-small-donor-pct': 'Percentage of contributions under $100. A measure of grassroots funding strength.'
'cf-support-oppose': 'Support/oppose classification from independent expenditure (IE) filings. Committees must disclose whether spending supports or opposes a candidate or measure.'
```

## Edge Cases

**Name matching for IE records:** `candidate_last_name` in IE filings may not exactly match `filer_name` in direct contribution records. Use case-insensitive partial matching (last name extracted from filer_name).

**Ballot measure matching:** `ballot_number` (e.g., "A", "G") combined with election date range provides reliable matching. `ballot_name` is more descriptive but less consistent.

**Missing oppose data:** Many candidates and measures have no opposing IE records. The oppose column should gracefully show "No opposing expenditures on record" rather than appearing empty or broken.

**Spending category normalization:** Free-text descriptions are messy. The normalization map covers common patterns but won't catch everything. "Other" category will be significant (~40-50%). This is acceptable — the chart shows directional spending patterns, not precise accounting.

**Self-funding:** `transaction_self = true` identifies self-funded contributions. These should be broken out in the funding sources chart as a distinct category.

**Filer name stability:** The same committee can appear with slightly different `filer_name` spellings across filings. Use `filer_nid` (numeric ID) as the primary group key for aggregation queries, with `filer_name` for display. Updated queries should `GROUP BY filer_nid, filer_name` and use `filer_nid` for Level 2 lookups.

**Quote escaping in WHERE clauses:** Filer names may contain apostrophes (e.g., "People's Party"). Single quotes must be escaped with `''` in SoQL. The `useCampaignDetail` hook must escape `filer_name` before interpolating into queries.

**Election cycle overlap:** The `SF_ELECTIONS` start/end ranges may overlap (e.g., Nov 2024 starts Jan 2024, Mar 2024 starts Jul 2023). This is intentional — each cycle captures its own filing season. A contribution filed in Feb 2024 correctly appears in both the Nov 2024 and Mar 2024 cycles. The sidebar list shows different filers for each election since candidates file for specific elections.

**Zip code boundaries:** Need a static GeoJSON file of SF zip code polygons. Source: Census Bureau ZCTA shapefiles (`cb_2023_us_zcta520_500k.shp`), filter to SF-area ZCTAs (941xx), convert to GeoJSON with `ogr2ogr` or `mapshaper`. ~30 zip codes. Bundle as `public/data/sf-zipcodes.geojson`. If sourcing proves difficult, fall back to a dot map (circles at zip code centroids sized by contribution volume) which requires no boundary file.
