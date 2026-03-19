# City Budget & Spending Analysis — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-03-19-city-budget-design.md`
**Branch:** `feature/city-budget`
**Estimated chunks:** 4 (data foundation → overview → search → advertising)

## Chunk 1: Data Foundation (do first)

### Task 1.1: Add Socrata dataset configs
- File: `src/api/datasets.ts`
- Add 4 new datasets:
  - `budget`: endpoint `xdgd-c79v`, no dateField (uses fiscal_year)
  - `spendingRevenue`: endpoint `bpnb-jwfb`, no dateField (uses fiscal_year)
  - `vendorPayments`: endpoint `n9pm-xkyq`, no dateField (uses fiscal_year)
  - `supplierContracts`: endpoint `cqi5-hm2d`, no dateField (uses fiscal_year)
- These datasets use fiscal_year field, NOT a datetime field — do NOT set defaultSort or dateField

### Task 1.2: Add TypeScript types
- File: `src/types/budget.ts` (new)
- Types needed:
  - `BudgetRecord` — fiscal_year, revenue_or_spending, organization_group, department, program, character, object, sub_object, budget (amount), fund_type, fund
  - `SpendingRecord` — same hierarchy + amount field instead of budget
  - `VendorPaymentRecord` — same hierarchy + vendor, purchase_order, vouchers_paid, vouchers_pending, voucher, contract_number, contract_title, non_profit_indicator
  - `SupplierContractRecord` — contract_no, contract_title, term_start_date, term_end_date, department, prime_contractor, scope_of_work, agreed_amt, consumed_amt, pmt_amt, remaining_amt, sole_source_flg
  - `FiscalYear` type alias
  - Aggregation row types for department summaries, vendor summaries, etc.

### Task 1.3: Fiscal year utilities
- File: `src/utils/fiscalYear.ts` (new)
- `getCurrentFiscalYear()` — returns current FY based on date (July 1 boundary)
- `fiscalYearToDateRange(fy: number)` — returns { start: 'YYYY-07-01', end: 'YYYY-06-30' }
- `formatFiscalYear(fy: number)` — returns "FY2024-25" display format
- `getFiscalYearRange(start: number, end: number)` — array of FYs

### Task 1.4: Budget data hooks
- File: `src/hooks/useBudgetData.ts` (new)
- `useDepartmentBudget(fiscalYear)` — aggregated budget by department
- `useDepartmentSpending(fiscalYear)` — aggregated actual spending by department
- `useBudgetVsActual(fiscalYear)` — joined budget vs spending with variance calculation
- `useSpendingTrend(department?, character?)` — multi-year spending trend
- All use `useDataset` with fiscal_year WHERE clause, server-side GROUP BY

### Task 1.5: Route + nav item
- File: `src/App.tsx` — add route `/city-budget`
- File: `src/components/layout/AppShell.tsx` — add nav item, shortLabel: 'BU', accentColor: '#0ea5e9'
- File: `src/views/CityBudget/CityBudget.tsx` — skeleton view with tab structure (Overview, Search, Advertising)

### Verification: `npx tsc --noEmit && pnpm build`

## Chunk 2: Budget Overview Tab

### Task 2.1: Fiscal year picker component
- File: `src/components/filters/FiscalYearPicker.tsx` (new)
- Dropdown with FY2010–current
- Shows "FY2024-25" format
- Stored in URL params (?fy=2025)
- Placed in CityBudget header bar

### Task 2.2: Department breakdown chart
- File: `src/components/charts/DepartmentBars.tsx` (new)
- Horizontal bar chart: departments sorted by spending
- Color: over-budget (red) vs under-budget (green)
- Ghost bar showing budget amount behind actual spending bar
- Click department → drill into programs/objects (progressive disclosure)

### Task 2.3: Spending trends chart
- File: `src/components/charts/SpendingTrend.tsx` (new)
- Multi-line D3 chart: top N departments over time (FY2000-present)
- Toggle: absolute vs % of total
- Highlight anomaly years (z-score bands)

### Task 2.4: CardTray metrics
- In CityBudget.tsx Overview tab
- Cards: Total Budget, Total Spending, Spending %, Largest Department, YoY Growth
- Use existing CardTray component

### Task 2.5: Department sidebar
- Scrollable department list with spend bars (same pattern as neighborhood sidebars)
- Click to filter charts to that department
- Fund type filter (General Fund / Enterprise / Special Revenue)

### Verification: `npx tsc --noEmit && pnpm build`, visually test in browser

## Chunk 3: Vendor Search Tab

### Task 3.1: Search hook
- File: `src/hooks/useVendorSearch.ts` (new)
- `useVendorSearch(query, fiscalYear?)` — searches vendor names via Socrata `LIKE` query
- Also searches sub_object, department, contract_title
- Returns grouped results: { vendors: [], departments: [], categories: [] }
- Debounced (300ms)

### Task 3.2: Search UI
- In CityBudget.tsx Search tab
- Full-width search input with autocomplete suggestions
- Results grouped by type with expandable cards
- Each vendor result: name, total paid, department breakdown, sparkline trend

### Task 3.3: Vendor detail panel
- File: `src/components/ui/VendorDetailPanel.tsx` (new)
- Slide-in panel (use DetailPanelShell)
- Payment history table by fiscal year
- Department breakdown pie chart
- Contract cross-reference (if contract_number exists)
- Nonprofit indicator badge

### Task 3.4: Vendor concentration chart
- Top 20 vendors = X% of total spend
- Horizontal bar chart with cumulative % line

### Task 3.5: Anomaly flags sidebar
- Sensitivity slider (1σ–4σ, default 2σ, stored in URL params)
- Flagged items with badge + explanation
- Algorithm: z-score by department × sub_object × fiscal_year

### Verification: `npx tsc --noEmit && pnpm build`

## Chunk 4: Advertising & Media Tracker Tab

### Task 4.1: Advertising data hook
- File: `src/hooks/useAdvertisingData.ts` (new)
- Three-layer detection:
  1. `sub_object = 'Advertising'` from vendor payments
  2. Known agency vendor list (hardcoded registry)
  3. P-card detection (vendor LIKE '%P-CARD%' AND sub_object = 'Advertising')
- Returns: { tagged: [], agency: [], pcard: [], combined: [] }

### Task 4.2: Media classification registry
- File: `src/utils/mediaClassification.ts` (new)
- Vendor → category mapping (major metro, community/ethnic, radio/TV, out-of-home, agency, digital agency, recruitment, direct social, P-card, production)
- `classifyVendor(vendorName)` → MediaCategory
- Export category colors, labels, icons

### Task 4.3: Advertising dashboard
- In CityBudget.tsx Advertising tab
- CardTray: Total Ad Spend, YoY Change, Top Department, P-Card Spend (flagged)
- Timeline: ad spend by department stacked area chart
- Media mix pie chart (traditional vs digital vs P-card)
- Vendor breakdown with classification badges

### Task 4.4: P-card transparency section
- Callout card explaining P-card opacity
- Total P-card ad spend by department
- Trend: is P-card ad spend growing?
- Department transparency score (% of ad spend via P-card)

### Task 4.5: CSV export
- File: `src/utils/csvExport.ts` (new)
- `exportToCSV(data, filename)` — generic CSV export utility
- Applied to vendor search results, advertising breakdown, department spending
- Button in each tab's header

### Verification: Full build + visual testing

## Build order
Chunks must be sequential: 1 → 2 → 3 → 4 (each depends on the prior).
Within each chunk, tasks can be done in order listed.
Commit after each chunk. Push after each chunk.
